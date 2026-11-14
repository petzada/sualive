import {
  GOLD_PACKS,
  PLUS_GOLD_AMOUNT,
  PLUS_GOLD_CREDITS_ANNUAL,
  PLUS_GOLD_INTERVAL_DAYS,
} from "@sualive/config";
import { goldCheckoutResponseSchema, goldPaymentResponseSchema } from "@sualive/protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyBilling } from "../src/billing/daily";
import { DAY_MS } from "../src/billing/state";
import { resetWebhookKeyCache } from "../src/billing/woovi";
import { billingPayments, goldPurchases } from "../src/db/schema";
import { creditPlusGold } from "../src/wallet/plus-gold";
import { accountRequest, createTestUser, type TestUser } from "./account";
import {
  billingEnv,
  db,
  FAKE_BRCODE,
  INVALID_CPF,
  mockWoovi,
  payloads,
  sendWebhook,
  setupWebhookKeys,
  VALID_CPF,
  wooviCalls,
  type WooviMock,
} from "./billing-helpers";
import { useD1 } from "./d1";
import { expectConsistent, ledgerRows, walletEnv, walletPost, walletRequest } from "./wallet-helpers";

useD1();

let woovi: WooviMock;

beforeAll(setupWebhookKeys);
beforeEach(() => {
  resetWebhookKeyCache();
  woovi = mockWoovi();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function checkout(user: TestUser, packId: string) {
  const response = await walletPost(user, "/gold/checkout", { packId, taxId: VALID_CPF });
  expect(response.status, await response.clone().text()).toBe(200);
  const body = goldCheckoutResponseSchema.parse(await response.json());
  const [row] = await db.select().from(goldPurchases).where(eq(goldPurchases.id, body.paymentId));
  return { body, row: row! };
}

async function deliver(payload: unknown) {
  const response = await sendWebhook(payload);
  expect(response.status, await response.clone().text()).toBe(200);
  return ((await response.json()) as { result: string }).result;
}

async function purchaseStatus(user: TestUser, id: string) {
  const response = await walletRequest(user, `/gold/payments/${id}`);
  expect(response.status).toBe(200);
  return goldPaymentResponseSchema.parse(await response.json()).status;
}

describe("checkout de pacote de ouro", () => {
  it("cobrança única com preço e ouro do pacote; CPF só vai para a Woovi", async () => {
    const user = await createTestUser();
    const { body, row } = await checkout(user, "gold_2190");
    expect(body).toMatchObject({ packId: "gold_2190", gold: 2190, amountCents: 1990, brCode: FAKE_BRCODE });
    expect(body.qrCodeImageUrl).toMatch(/^https:\/\//);
    expect(row).toMatchObject({ userId: user.userId, status: "pending", gold: 2190, amountCents: 1990 });
    const [call] = wooviCalls(woovi, "POST", "/api/v1/charge");
    expect(call!.body).toMatchObject({
      correlationID: row.correlationId,
      value: 1990,
      customer: { taxID: VALID_CPF },
    });
    expect((call!.body as { comment: string }).comment.length).toBeLessThan(30);
    expect(JSON.stringify(row)).not.toContain(VALID_CPF);
    // Nada é creditado antes da confirmação da Woovi.
    expect((await expectConsistent(user.userId)).gold).toBe(0);
    expect(await purchaseStatus(user, body.paymentId)).toBe("pending");
  });

  it("reaproveita o checkout pendente do mesmo pacote; outro pacote cria outra cobrança", async () => {
    const user = await createTestUser();
    const first = await checkout(user, "gold_990");
    const again = await checkout(user, "gold_990");
    expect(again.body.paymentId).toBe(first.body.paymentId);
    const other = await checkout(user, "gold_5990");
    expect(other.body.paymentId).not.toBe(first.body.paymentId);
    expect(wooviCalls(woovi, "POST", "/api/v1/charge")).toHaveLength(2);
  });

  it("pacote desconhecido, CPF inválido ou valor vindo do navegador: recusa", async () => {
    const user = await createTestUser();
    for (const body of [
      { packId: "gold_1", taxId: VALID_CPF },
      { packId: "gold_990", taxId: INVALID_CPF },
      { packId: "gold_990" },
    ]) {
      expect((await walletPost(user, "/gold/checkout", body)).status).toBe(400);
    }
    // Campos a mais (preço, ouro) são ignorados: o servidor usa o pacote.
    const response = await walletPost(user, "/gold/checkout", {
      packId: "gold_990",
      taxId: VALID_CPF,
      gold: 999999,
      amountCents: 1,
    });
    expect(goldCheckoutResponseSchema.parse(await response.json())).toMatchObject({
      gold: 990,
      amountCents: 990,
    });
    expect(wooviCalls(woovi, "POST", "/api/v1/charge")).toHaveLength(1);
  });

  it("cobrança desligada: 503", async () => {
    const user = await createTestUser();
    const off = { WOOVI_APP_ID: undefined, WOOVI_WEBHOOK_SECRET: undefined };
    const response = await walletPost(
      user,
      "/gold/checkout",
      { packId: "gold_990", taxId: VALID_CPF },
      { env: off },
    );
    expect(response.status).toBe(503);
    expect((await walletRequest(user, "/gold/payments/x", { env: off })).status).toBe(503);
  });

  it("consulta de compra de outra conta: 404", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const { body } = await checkout(user, "gold_990");
    expect((await walletRequest(other, `/gold/payments/${body.paymentId}`)).status).toBe(404);
  });
});

describe("crédito do pacote pelo webhook", () => {
  for (const pack of GOLD_PACKS) {
    it(`${pack.id}: credita ${pack.gold} de ouro uma única vez, mesmo com o webhook repetido`, async () => {
      const user = await createTestUser();
      const { body, row } = await checkout(user, pack.id);
      expect(await deliver(payloads.chargeCompleted(row.correlationId))).toBe("applied");
      expect(await deliver(payloads.chargeCompleted(row.correlationId))).toBe("duplicate");
      expect((await expectConsistent(user.userId)).gold).toBe(pack.gold);
      expect(await purchaseStatus(user, body.paymentId)).toBe("paid");
      const [paid] = await db.select().from(goldPurchases).where(eq(goldPurchases.id, row.id));
      expect(paid).toMatchObject({ status: "paid", brCode: null, qrCodeImageUrl: null });
      expect(await ledgerRows(user.userId)).toEqual([
        {
          currency: "gold",
          amount: pack.gold,
          reason: "gold_purchase",
          reference: `gold-purchase:${row.id}`,
          counterpartUserId: null,
        },
      ]);
    });
  }

  it("dois webhooks simultâneos: um crédito só", async () => {
    const user = await createTestUser();
    const { row } = await checkout(user, "gold_5990");
    const results = await Promise.all([
      deliver(payloads.chargeCompleted(row.correlationId)),
      deliver(payloads.chargeCompleted(row.correlationId)),
    ]);
    expect(results.sort()).toEqual(["applied", "duplicate"]);
    expect((await expectConsistent(user.userId)).gold).toBe(5990);
    expect(await ledgerRows(user.userId)).toHaveLength(1);
  });

  it("pagamento expirado: marca expirada e não credita; pago depois, o dinheiro manda", async () => {
    const user = await createTestUser();
    const { body, row } = await checkout(user, "gold_990");
    expect(await deliver(payloads.chargeExpired(row.correlationId))).toBe("applied");
    expect(await purchaseStatus(user, body.paymentId)).toBe("expired");
    expect((await expectConsistent(user.userId)).gold).toBe(0);
    // O checkout expirado não é reaproveitado.
    const fresh = await checkout(user, "gold_990");
    expect(fresh.body.paymentId).not.toBe(body.paymentId);
    // Se a Woovi ainda confirmar o pagamento da cobrança antiga, o ouro entra uma vez.
    expect(await deliver(payloads.chargeCompleted(row.correlationId))).toBe("applied");
    expect((await expectConsistent(user.userId)).gold).toBe(990);
  });

  it("expiração depois de paga não muda nada", async () => {
    const user = await createTestUser();
    const { body, row } = await checkout(user, "gold_990");
    await deliver(payloads.chargeCompleted(row.correlationId));
    await deliver(payloads.chargeExpired(row.correlationId));
    expect(await purchaseStatus(user, body.paymentId)).toBe("paid");
    expect((await expectConsistent(user.userId)).gold).toBe(990);
  });

  it("conta excluída antes do pagamento (sem conta na compra): marca paga, sem crédito", async () => {
    const user = await createTestUser();
    const { row } = await checkout(user, "gold_990");
    await db.update(goldPurchases).set({ userId: null }).where(eq(goldPurchases.id, row.id));
    expect(await deliver(payloads.chargeCompleted(row.correlationId))).toBe("applied");
    const [paid] = await db.select().from(goldPurchases).where(eq(goldPurchases.id, row.id));
    expect(paid).toMatchObject({ status: "paid", userId: null });
    expect(await ledgerRows(user.userId)).toEqual([]);
  });

  it("excluir a conta: compra paga fica anônima, pendente é apagada, carteira some", async () => {
    const user = await createTestUser();
    const paid = await checkout(user, "gold_990");
    const pending = await checkout(user, "gold_2190");
    await deliver(payloads.chargeCompleted(paid.row.correlationId));
    expect((await expectConsistent(user.userId)).gold).toBe(990);

    const response = await accountRequest("/api/me", { method: "DELETE", cookie: user.cookie });
    expect(response.status).toBe(204);
    const [kept] = await db.select().from(goldPurchases).where(eq(goldPurchases.id, paid.row.id));
    expect(kept).toMatchObject({ userId: null, status: "paid", brCode: null, qrCodeImageUrl: null });
    expect(await db.select().from(goldPurchases).where(eq(goldPurchases.id, pending.row.id))).toEqual([]);
    const { results } = await walletEnv.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM wallets WHERE user_id = ?1) AS w, (SELECT COUNT(*) FROM wallet_ledger WHERE user_id = ?1) AS l",
    )
      .bind(user.userId)
      .all<{ w: number; l: number }>();
    expect(results[0]).toEqual({ w: 0, l: 0 });
  });
});

describe("ouro do Plus pago", () => {
  const INTERVAL = PLUS_GOLD_INTERVAL_DAYS * DAY_MS;

  async function plusCheckout(user: TestUser, cycle: "monthly" | "annual") {
    const response = await accountRequest("/api/plus/checkout", {
      method: "POST",
      cookie: user.cookie,
      body: { cycle, taxId: VALID_CPF },
      env: { WOOVI_APP_ID: billingEnv.WOOVI_APP_ID, WOOVI_WEBHOOK_SECRET: billingEnv.WOOVI_WEBHOOK_SECRET },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const { paymentId } = (await response.json()) as { paymentId: string };
    const [row] = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId));
    return row!;
  }

  async function paidPayment(userId: string | null, cycle: "monthly" | "annual", paidAt: number) {
    const id = crypto.randomUUID();
    await db.insert(billingPayments).values({
      id,
      userId,
      cycle,
      amountCents: cycle === "annual" ? 15990 : 1990,
      status: "paid",
      correlationId: `teste-${id}`,
      paidAt,
      createdAt: paidAt,
    });
    return id;
  }

  async function plusGoldRefs(userId: string) {
    return (await ledgerRows(userId))
      .filter((row) => row.reason === "plus_gold")
      .map((row) => row.reference)
      .sort();
  }

  it("mensal pago no webhook: 1.000 de ouro na hora, uma vez só", async () => {
    const user = await createTestUser();
    const payment = await plusCheckout(user, "monthly");
    await deliver(payloads.installmentCompleted(payment.correlationId, 1));
    expect(await plusGoldRefs(user.userId)).toEqual([`plus-gold:${payment.id}:0`]);
    expect((await expectConsistent(user.userId)).gold).toBe(PLUS_GOLD_AMOUNT);
    // A rotina diária, agora e daqui a 60 dias, não credita de novo o mesmo pagamento.
    await runDailyBilling(billingEnv, Date.now());
    await creditPlusGold(billingEnv, Date.now() + 60 * DAY_MS);
    expect((await expectConsistent(user.userId)).gold).toBe(PLUS_GOLD_AMOUNT);
  });

  it("renovação mensal paga rende outro crédito", async () => {
    const user = await createTestUser();
    const payment = await plusCheckout(user, "monthly");
    await deliver(payloads.installmentCompleted(payment.correlationId, 1));
    await deliver(payloads.installmentCompleted(payment.correlationId, 2));
    expect(await plusGoldRefs(user.userId)).toHaveLength(2);
    expect((await expectConsistent(user.userId)).gold).toBe(2 * PLUS_GOLD_AMOUNT);
  });

  it("anual: 12 créditos, um a cada 30 dias, idempotente entre webhook e rotina diária", async () => {
    const user = await createTestUser();
    const payment = await plusCheckout(user, "annual");
    await deliver(payloads.chargeCompleted(payment.correlationId));
    const [paid] = await db.select().from(billingPayments).where(eq(billingPayments.id, payment.id));
    const paidAt = paid!.paidAt!;
    expect((await expectConsistent(user.userId)).gold).toBe(PLUS_GOLD_AMOUNT);

    // Ainda não venceu o segundo.
    await runDailyBilling(billingEnv, paidAt + INTERVAL - 1);
    expect((await expectConsistent(user.userId)).gold).toBe(PLUS_GOLD_AMOUNT);
    // Venceu o segundo; repetir não credita de novo.
    await runDailyBilling(billingEnv, paidAt + INTERVAL);
    await runDailyBilling(billingEnv, paidAt + INTERVAL + DAY_MS);
    expect((await expectConsistent(user.userId)).gold).toBe(2 * PLUS_GOLD_AMOUNT);
    // Rotina parada por 100 dias: credita de uma vez os vencidos.
    await creditPlusGold(billingEnv, paidAt + 5 * INTERVAL);
    expect((await expectConsistent(user.userId)).gold).toBe(6 * PLUS_GOLD_AMOUNT);
    // Depois do ano: no máximo 12.
    await creditPlusGold(billingEnv, paidAt + 400 * DAY_MS);
    await creditPlusGold(billingEnv, paidAt + 800 * DAY_MS);
    expect(await plusGoldRefs(user.userId)).toEqual(
      Array.from({ length: PLUS_GOLD_CREDITS_ANNUAL }, (_, k) => `plus-gold:${payment.id}:${k}`).sort(),
    );
    expect((await expectConsistent(user.userId)).gold).toBe(PLUS_GOLD_CREDITS_ANNUAL * PLUS_GOLD_AMOUNT);
  });

  it("estreia: pagamentos feitos desde a entrega 2 recebem os créditos vencidos na primeira rotina", async () => {
    const now = Date.now();
    const monthlyUser = await createTestUser();
    const annualUser = await createTestUser();
    const monthlyA = await paidPayment(monthlyUser.userId, "monthly", now - 50 * DAY_MS);
    const monthlyB = await paidPayment(monthlyUser.userId, "monthly", now - 20 * DAY_MS);
    const annual = await paidPayment(annualUser.userId, "annual", now - 95 * DAY_MS);
    const anonymous = await paidPayment(null, "annual", now - 95 * DAY_MS);

    const report = await runDailyBilling(billingEnv, now);
    expect(report.plusGold.failed).toBe(0);
    expect(await plusGoldRefs(monthlyUser.userId)).toEqual(
      [`plus-gold:${monthlyA}:0`, `plus-gold:${monthlyB}:0`].sort(),
    );
    // 95 dias: créditos 0 (dia 0), 1 (30), 2 (60) e 3 (90).
    expect(await plusGoldRefs(annualUser.userId)).toEqual(
      [0, 1, 2, 3].map((k) => `plus-gold:${annual}:${k}`),
    );
    expect((await expectConsistent(monthlyUser.userId)).gold).toBe(2 * PLUS_GOLD_AMOUNT);
    expect((await expectConsistent(annualUser.userId)).gold).toBe(4 * PLUS_GOLD_AMOUNT);
    const { results } = await walletEnv.DB.prepare(
      "SELECT COUNT(*) AS n FROM wallet_ledger WHERE reference LIKE ?1",
    )
      .bind(`plus-gold:${anonymous}:%`)
      .all<{ n: number }>();
    expect(results[0]!.n).toBe(0);

    // Segunda execução no mesmo dia: nada novo.
    await runDailyBilling(billingEnv, now + 1000);
    expect((await expectConsistent(annualUser.userId)).gold).toBe(4 * PLUS_GOLD_AMOUNT);
  });

  it("pagamento pendente, expirado ou futuro não rende ouro", async () => {
    const user = await createTestUser();
    const now = Date.now();
    const pending = await plusCheckout(user, "annual");
    await db
      .update(billingPayments)
      .set({ paidAt: now - DAY_MS })
      .where(eq(billingPayments.id, pending.id));
    await paidPayment(user.userId, "monthly", now + DAY_MS);
    await creditPlusGold(billingEnv, now);
    expect((await expectConsistent(user.userId)).gold).toBe(0);
  });

  it("falha num crédito não para os outros", async () => {
    const now = Date.now();
    const user = await createTestUser();
    const first = await paidPayment(user.userId, "monthly", now - 2 * DAY_MS);
    const second = await paidPayment(user.userId, "monthly", now - DAY_MS);
    // O primeiro `batch` de crédito falha (falha simulada do D1); o segundo segue.
    let batches = 0;
    const DB = {
      prepare: (query: string) => walletEnv.DB.prepare(query),
      batch: (statements: D1PreparedStatement[]) => {
        batches += 1;
        if (batches === 1) return Promise.reject(new Error("falha simulada do D1"));
        return walletEnv.DB.batch(statements);
      },
    } as unknown as D1Database;
    const report = await creditPlusGold({ ...billingEnv, DB }, now, user.userId);
    expect(report).toEqual({ payments: 2, credited: 1, failed: 1 });
    expect(await plusGoldRefs(user.userId)).toEqual([`plus-gold:${second}:0`]);
    // A próxima execução credita o que faltou.
    await creditPlusGold(billingEnv, now + DAY_MS, user.userId);
    expect(await plusGoldRefs(user.userId)).toEqual([`plus-gold:${first}:0`, `plus-gold:${second}:0`].sort());
    expect((await expectConsistent(user.userId)).gold).toBe(2 * PLUS_GOLD_AMOUNT);
  });
});
