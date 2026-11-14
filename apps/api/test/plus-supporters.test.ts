import { EARLY_SUPPORTER_LIMIT, PLUS_ANNUAL_PRICE_CENTS } from "@sualive/config";
import { env } from "cloudflare:workers";
import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { applyBillingEvent } from "../src/billing/events";
import { planStatusAt } from "../src/billing/plan";
import { billingEarlySupporters, billingPayments } from "../src/db/schema";
import { billingEnv, createUser, db } from "./billing-helpers";
import { useD1 } from "./d1";

useD1();

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM billing_early_supporters").run();
});

/** Conta com um checkout anual pendente (sem passar pela Woovi: o teste é do selo). */
async function pendingAnnual() {
  const userId = await createUser();
  const correlationId = `teste-${crypto.randomUUID()}`;
  await db.insert(billingPayments).values({
    id: crypto.randomUUID(),
    userId,
    cycle: "annual",
    amountCents: PLUS_ANNUAL_PRICE_CENTS,
    status: "pending",
    correlationId,
    brCode: "x",
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
  });
  return { userId, correlationId };
}

function pay(correlationId: string) {
  return applyBillingEvent(
    billingEnv,
    { kind: "charge_paid", key: `charge_paid:${correlationId}`, correlationId },
    Date.now(),
  );
}

async function fillSupporters(count: number) {
  for (let position = 1; position <= count; position++) {
    await db.insert(billingEarlySupporters).values({ position, userId: await createUser(), grantedAt: 1 });
  }
}

describe("selo de apoiador inicial", () => {
  it("o primeiro pagante recebe o selo, que é permanente", async () => {
    const { userId, correlationId } = await pendingAnnual();
    await pay(correlationId);
    const status = await planStatusAt(billingEnv, userId, Date.now());
    expect(status.badges).toEqual(["plus", "early_supporter"]);
    // Depois que o plano acaba, o selo de apoiador continua.
    const later = await planStatusAt(billingEnv, userId, status.plan.periodEnd!);
    expect(later.badges).toEqual(["early_supporter"]);
  });

  it(`o ${EARLY_SUPPORTER_LIMIT + 1}º pagante não recebe o selo`, async () => {
    await fillSupporters(EARLY_SUPPORTER_LIMIT - 1);
    const last = await pendingAnnual();
    const extra = await pendingAnnual();
    await pay(last.correlationId);
    await pay(extra.correlationId);
    expect((await planStatusAt(billingEnv, last.userId, Date.now())).badges).toContain("early_supporter");
    const extraStatus = await planStatusAt(billingEnv, extra.userId, Date.now());
    expect(extraStatus.plan.plus).toBe(true);
    expect(extraStatus.badges).toEqual(["plus"]);
    const rows = await db.select().from(billingEarlySupporters);
    expect(rows).toHaveLength(EARLY_SUPPORTER_LIMIT);
  });

  it("dois pagamentos simultâneos não recebem a mesma posição", async () => {
    await fillSupporters(10);
    const buyers = await Promise.all([pendingAnnual(), pendingAnnual(), pendingAnnual(), pendingAnnual()]);
    await Promise.all(buyers.map((buyer) => pay(buyer.correlationId)));
    const rows = await db.select().from(billingEarlySupporters).orderBy(asc(billingEarlySupporters.position));
    const positions = rows
      .filter((row) => buyers.some((b) => b.userId === row.userId))
      .map((row) => row.position);
    expect(positions.sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
  });

  it("disputa pelas últimas posições: só cabe quem chegou até o limite", async () => {
    await fillSupporters(EARLY_SUPPORTER_LIMIT - 2);
    const buyers = await Promise.all([pendingAnnual(), pendingAnnual(), pendingAnnual()]);
    await Promise.all(buyers.map((buyer) => pay(buyer.correlationId)));
    const rows = await db.select().from(billingEarlySupporters);
    expect(rows).toHaveLength(EARLY_SUPPORTER_LIMIT);
    expect(new Set(rows.map((row) => row.position)).size).toBe(EARLY_SUPPORTER_LIMIT);
  });

  it("um segundo pagamento da mesma conta não dá outra posição", async () => {
    const { userId, correlationId } = await pendingAnnual();
    await pay(correlationId);
    const correlation2 = `teste-${crypto.randomUUID()}`;
    await db.insert(billingPayments).values({
      id: crypto.randomUUID(),
      userId,
      cycle: "annual",
      amountCents: PLUS_ANNUAL_PRICE_CENTS,
      status: "pending",
      correlationId: correlation2,
      createdAt: Date.now(),
    });
    await pay(correlation2);
    expect(await db.select().from(billingEarlySupporters)).toHaveLength(1);
  });
});
