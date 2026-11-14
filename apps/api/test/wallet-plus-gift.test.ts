import { PLUS_GIFT_DAYS, PLUS_GIFT_PRICE_GOLD } from "@sualive/config";
import { walletResponseSchema } from "@sualive/protocol";
import { eq, ne } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyBilling } from "../src/billing/daily";
import { planStatusAt } from "../src/billing/plan";
import { DAY_MS, INITIAL_STATE, periodMs, planFromState, transition } from "../src/billing/state";
import { resetWebhookKeyCache } from "../src/billing/woovi";
import { billingEarlySupporters, billingPayments, billingSubscriptions } from "../src/db/schema";
import { creditPlusGold } from "../src/wallet/plus-gold";
import { createTestUser, uniqueHandle, type TestUser } from "./account";
import {
  billingEnv,
  db,
  mockWoovi,
  payloads,
  sendWebhook,
  setupWebhookKeys,
  wooviCalls,
  type WooviMock,
} from "./billing-helpers";
import { useD1 } from "./d1";
import { expectConsistent, grant, ledgerRows, walletPost } from "./wallet-helpers";

useD1();

const GIFT_MS = PLUS_GIFT_DAYS * DAY_MS;
let woovi: WooviMock;

beforeAll(setupWebhookKeys);
beforeEach(() => {
  resetWebhookKeyCache();
  woovi = mockWoovi();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function subscriptionOf(userId: string) {
  const [row] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, userId));
  return row ?? null;
}

async function gift(sender: TestUser, to: string | null) {
  return walletPost(sender, "/gifts/plus", { to });
}

async function sendersWithGold(amount = PLUS_GIFT_PRICE_GOLD) {
  const sender = await createTestUser();
  await grant(sender.userId, amount);
  return sender;
}

describe("máquina de estados: Plus de presente", () => {
  const AT = Date.UTC(2026, 10, 20);

  it("sem Plus: vira ativo de presente, sem renovação, e acaba sozinho no fim do período", () => {
    const { state } = transition(INITIAL_STATE, { type: "gift_received", at: AT, days: PLUS_GIFT_DAYS });
    expect(state).toEqual({ ...INITIAL_STATE, status: "active", cycle: "gift", periodEnd: AT + GIFT_MS });
    expect(planFromState(state, AT)).toEqual({
      status: "active",
      plus: true,
      cycle: "gift",
      periodEnd: AT + GIFT_MS,
      renews: false,
    });
    expect(planFromState(state, AT + GIFT_MS)).toMatchObject({ status: "ended", plus: false });
    // Eventos da Woovi não mexem no presente.
    for (const type of [
      "charge_failed",
      "charge_rejected",
      "cancel_requested",
      "recurrence_stopped",
    ] as const) {
      expect(transition(state, { type, at: AT }).changed).toBe(false);
    }
  });

  it("com Plus valendo: só soma os dias ao período", () => {
    for (const status of ["active", "canceled", "past_due"] as const) {
      const stored = {
        ...INITIAL_STATE,
        status,
        cycle: "monthly" as const,
        periodEnd: AT + 5 * DAY_MS,
        pastDueSince: status === "past_due" ? AT - DAY_MS : null,
        failedAttempts: status === "past_due" ? 1 : 0,
      };
      const { state } = transition(stored, { type: "gift_received", at: AT, days: PLUS_GIFT_DAYS });
      expect(state).toEqual({ ...stored, periodEnd: AT + 5 * DAY_MS + GIFT_MS });
    }
  });

  it("Plus vencido (ainda não gravado como encerrado): recomeça como presente", () => {
    const stored = {
      ...INITIAL_STATE,
      status: "active" as const,
      cycle: "annual" as const,
      periodEnd: AT - 1,
    };
    const { state } = transition(stored, { type: "gift_received", at: AT, days: PLUS_GIFT_DAYS });
    expect(state).toMatchObject({ status: "active", cycle: "gift", periodEnd: AT + GIFT_MS });
  });

  it("pagamento sobre presente: o ciclo passa a ser o pago e o período soma", () => {
    const giftState = transition(INITIAL_STATE, {
      type: "gift_received",
      at: AT,
      days: PLUS_GIFT_DAYS,
    }).state;
    for (const cycle of ["monthly", "annual"] as const) {
      const { state } = transition(giftState, { type: "payment_confirmed", at: AT + DAY_MS, cycle });
      expect(state).toMatchObject({ status: "active", cycle, periodEnd: AT + GIFT_MS + periodMs(cycle) });
    }
  });
});

describe("presentear Plus", () => {
  it("destinatário sem Plus: debita 1.990 de ouro e dá 30 dias de presente", async () => {
    const sender = await sendersWithGold(PLUS_GIFT_PRICE_GOLD + 10);
    const recipient = await createTestUser();
    const before = Date.now();
    const response = await gift(sender, recipient.handle);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(walletResponseSchema.parse(await response.json())).toMatchObject({ gold: 10, goldSentToday: 0 });

    const row = await subscriptionOf(recipient.userId);
    expect(row).toMatchObject({
      status: "active",
      cycle: "gift",
      wooviCorrelationId: null,
      cancelRequestedAt: null,
    });
    expect(row!.periodEnd).toBeGreaterThanOrEqual(before + GIFT_MS);
    expect(row!.periodEnd).toBeLessThanOrEqual(Date.now() + GIFT_MS);
    const { plan, badges } = await planStatusAt(billingEnv, recipient.userId, Date.now());
    expect(plan).toMatchObject({ plus: true, cycle: "gift", renews: false });
    expect(badges).toEqual(["plus"]);

    const [line] = await ledgerRows(sender.userId).then((rows) =>
      rows.filter((r) => r.reason === "plus_gift"),
    );
    expect(line).toMatchObject({
      currency: "gold",
      amount: -PLUS_GIFT_PRICE_GOLD,
      counterpartUserId: recipient.userId,
    });
    await expectConsistent(sender.userId);
  });

  it("não dá selo de apoiador inicial nem ouro a quem recebe, e a rotina diária não consulta a Woovi", async () => {
    const sender = await sendersWithGold();
    const recipient = await createTestUser();
    expect((await gift(sender, recipient.handle)).status).toBe(200);
    expect(
      await db
        .select()
        .from(billingEarlySupporters)
        .where(eq(billingEarlySupporters.userId, recipient.userId)),
    ).toEqual([]);
    expect(
      await db.select().from(billingPayments).where(eq(billingPayments.userId, recipient.userId)),
    ).toEqual([]);

    // Só a assinatura de presente na rotina: nenhuma chamada à Woovi.
    await db.delete(billingSubscriptions).where(ne(billingSubscriptions.userId, recipient.userId));
    woovi.calls.length = 0;
    const report = await runDailyBilling(billingEnv, Date.now() + DAY_MS);
    await creditPlusGold(billingEnv, Date.now() + 20 * DAY_MS);
    expect(report).toMatchObject({ checked: 1, failed: 0 });
    expect(wooviCalls(woovi, "GET", "/api/v1/subscriptions")).toEqual([]);
    expect(woovi.calls).toEqual([]);
    expect(await ledgerRows(recipient.userId)).toEqual([]);
    expect((await subscriptionOf(recipient.userId))!.status).toBe("active");

    // No fim do período a rotina encerra o presente.
    await runDailyBilling(billingEnv, Date.now() + GIFT_MS + DAY_MS);
    expect((await subscriptionOf(recipient.userId))!.status).toBe("ended");
  });

  it("destinatário com Plus mensal ativo: soma 30 dias ao período e o resto não muda", async () => {
    const sender = await sendersWithGold();
    const recipient = await createTestUser();
    const periodEnd = Date.now() + 10 * DAY_MS;
    await db.insert(billingSubscriptions).values({
      userId: recipient.userId,
      cycle: "monthly",
      status: "active",
      periodEnd,
      wooviCorrelationId: "rec-do-mensal",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect((await gift(sender, recipient.handle)).status).toBe(200);
    expect(await subscriptionOf(recipient.userId)).toMatchObject({
      status: "active",
      cycle: "monthly",
      periodEnd: periodEnd + GIFT_MS,
      wooviCorrelationId: "rec-do-mensal",
      version: 1,
    });
    expect((await planStatusAt(billingEnv, recipient.userId, Date.now())).plan.renews).toBe(true);
  });

  it("dois presentes para quem já tem presente: somam (inclusive simultâneos)", async () => {
    const recipient = await createTestUser();
    const senders = await Promise.all([sendersWithGold(), sendersWithGold(), sendersWithGold()]);
    expect((await gift(senders[0]!, recipient.handle)).status).toBe(200);
    const first = (await subscriptionOf(recipient.userId))!.periodEnd;
    const responses = await Promise.all([
      gift(senders[1]!, recipient.handle),
      gift(senders[2]!, recipient.handle),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await subscriptionOf(recipient.userId))!.periodEnd).toBe(first + 2 * GIFT_MS);
    for (const sender of senders) expect((await expectConsistent(sender.userId)).gold).toBe(0);
  });

  it("para a própria conta: recusado, sem débito", async () => {
    const sender = await sendersWithGold();
    expect(await gift(sender, sender.handle).then(async (r) => [r.status, await r.json()])).toEqual([
      400,
      { error: "self_gift" },
    ]);
    expect((await expectConsistent(sender.userId)).gold).toBe(PLUS_GIFT_PRICE_GOLD);
    expect(await subscriptionOf(sender.userId)).toBeNull();
  });

  it("@nome inexistente ou sem primeiro acesso: 404", async () => {
    const sender = await sendersWithGold();
    const pending = await createTestUser({ onboarded: false, handle: uniqueHandle("p") });
    for (const to of [uniqueHandle("nada"), pending.handle]) {
      const response = await gift(sender, to);
      expect([response.status, await response.json()]).toEqual([404, { error: "recipient_not_found" }]);
    }
    expect(await subscriptionOf(pending.userId)).toBeNull();
    expect((await expectConsistent(sender.userId)).gold).toBe(PLUS_GIFT_PRICE_GOLD);
  });

  it("saldo insuficiente: 409 e não estende nada", async () => {
    const sender = await sendersWithGold(PLUS_GIFT_PRICE_GOLD - 1);
    const recipient = await createTestUser();
    const response = await gift(sender, recipient.handle);
    expect([response.status, await response.json()]).toEqual([409, { error: "insufficient_funds" }]);
    expect(await subscriptionOf(recipient.userId)).toBeNull();
    expect((await expectConsistent(sender.userId)).gold).toBe(PLUS_GIFT_PRICE_GOLD - 1);
    expect(await ledgerRows(sender.userId)).toHaveLength(1);
  });

  it("corpo inválido: 400", async () => {
    const sender = await sendersWithGold();
    expect((await gift(sender, null)).status).toBe(400);
    expect((await expectConsistent(sender.userId)).gold).toBe(PLUS_GIFT_PRICE_GOLD);
  });

  it("pagamento confirmado sobre o presente: ciclo pago, período soma, recorrência ligada", async () => {
    const sender = await sendersWithGold();
    const recipient = await createTestUser();
    expect((await gift(sender, recipient.handle)).status).toBe(200);
    const giftEnd = (await subscriptionOf(recipient.userId))!.periodEnd;

    // Checkout mensal começado antes do presente e pago depois.
    const id = crypto.randomUUID();
    const recurrence = `sualive-plus-monthly-${id}`;
    await db.insert(billingPayments).values({
      id,
      userId: recipient.userId,
      cycle: "monthly",
      amountCents: 1990,
      status: "pending",
      correlationId: recurrence,
      wooviSubscriptionCorrelationId: recurrence,
      createdAt: Date.now(),
    });
    const response = await sendWebhook(payloads.installmentCompleted(recurrence, 1));
    expect(response.status).toBe(200);
    const row = await subscriptionOf(recipient.userId);
    expect(row).toMatchObject({ status: "active", cycle: "monthly", wooviCorrelationId: recurrence });
    expect(row!.periodEnd).toBe(giftEnd + periodMs("monthly"));
    expect((await planStatusAt(billingEnv, recipient.userId, Date.now())).plan).toMatchObject({
      cycle: "monthly",
      renews: true,
    });
    // O pagamento, sim, rende o ouro do Plus.
    expect((await expectConsistent(recipient.userId)).gold).toBe(1000);
  });
});
