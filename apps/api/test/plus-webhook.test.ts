import { PLUS_RETRY_ATTEMPTS } from "@sualive/config";
import { plusCheckoutResponseSchema } from "@sualive/protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { planStatusAt } from "../src/billing/plan";
import { DAY_MS, periodMs } from "../src/billing/state";
import { resetWebhookKeyCache } from "../src/billing/woovi";
import { billingPayments, billingSubscriptions } from "../src/db/schema";
import {
  billingEnv,
  createUser,
  db,
  loginAs,
  mockWoovi,
  payloads,
  postJson,
  request,
  sendWebhook,
  setupWebhookKeys,
  sign,
  wooviCalls,
  type WooviMock,
} from "./billing-helpers";
import { useD1 } from "./d1";

vi.mock("../src/auth/viewer", () => ({ getViewer: vi.fn() }));

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

/** Conta com checkout criado; devolve o correlationID mandado à Woovi. */
async function startCheckout(cycle: "monthly" | "annual") {
  const userId = await createUser();
  loginAs(userId);
  const response = await postJson("/api/plus/checkout", { cycle, taxId: "52998224725" });
  const { paymentId } = plusCheckoutResponseSchema.parse(await response.json());
  const [row] = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId));
  return { userId, paymentId, correlationId: row!.correlationId };
}

async function plan(userId: string, at = Date.now()) {
  return planStatusAt(billingEnv, userId, at);
}

async function paymentStatus(paymentId: string) {
  return (await (await request(`/api/plus/payments/${paymentId}`)).json()) as { status: string };
}

async function deliver(payload: unknown) {
  const response = await sendWebhook(payload);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as { result: string };
}

describe("autenticação do webhook", () => {
  it("assinatura válida e Authorization certo: aceita", async () => {
    const { correlationId } = await startCheckout("annual");
    expect((await deliver(payloads.chargeCompleted(correlationId))).result).toBe("applied");
  });

  it("assinatura de outro corpo: 401 e nada muda", async () => {
    const { userId, correlationId } = await startCheckout("annual");
    const body = JSON.stringify(payloads.chargeCompleted(correlationId));
    const response = await sendWebhook(null, { rawBody: body, signature: await sign(`${body} `) });
    expect(response.status).toBe(401);
    expect((await plan(userId)).plan.status).toBe("none");
  });

  it("sem assinatura, assinatura lixo ou Authorization errado: 401", async () => {
    const { userId, correlationId } = await startCheckout("annual");
    const payload = payloads.chargeCompleted(correlationId);
    expect((await sendWebhook(payload, { signature: null })).status).toBe(401);
    expect((await sendWebhook(payload, { signature: "!!!nao-e-base64" })).status).toBe(401);
    expect((await sendWebhook(payload, { signature: btoa("x".repeat(256)) })).status).toBe(401);
    expect((await sendWebhook(payload, { authorization: null })).status).toBe(401);
    expect((await sendWebhook(payload, { authorization: "outro-segredo" })).status).toBe(401);
    expect((await plan(userId)).plan.status).toBe("none");
  });

  it("evento desconhecido (ou o teste de cadastro da Woovi) responde 2xx sem efeito", async () => {
    expect((await deliver({ event: "OPENPIX:TRANSACTION_RECEIVED", pix: {} })).result).toBe("ignored");
    expect((await deliver({ evento: "teste_webhook" })).result).toBe("ignored");
  });

  it("ambiente sem cobrança não processa webhook", async () => {
    const response = await request(
      "/api/webhooks/woovi",
      { method: "POST", body: "{}" },
      { WOOVI_APP_ID: undefined, WOOVI_WEBHOOK_SECRET: undefined },
    );
    expect(response.status).toBe(503);
  });
});

describe("idempotência", () => {
  it("o mesmo evento entregue duas vezes não muda nada na segunda", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    const paid = payloads.installmentCompleted(correlationId, 1);
    expect((await deliver(paid)).result).toBe("applied");
    const after = await plan(userId);
    const [rowAfter] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.userId, userId));

    expect((await deliver(paid)).result).toBe("duplicate");
    expect(await plan(userId)).toEqual(after);
    const [rowAgain] = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.userId, userId));
    expect(rowAgain).toEqual(rowAfter);
    const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, userId));
    expect(payments).toHaveLength(1);
  });

  it("entregas simultâneas do mesmo evento aplicam uma vez só", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    const periodEnd = (await plan(userId)).plan.periodEnd!;
    const renewal = payloads.installmentCompleted(correlationId, 2);
    const results = await Promise.all([sendWebhook(renewal), sendWebhook(renewal), sendWebhook(renewal)]);
    // Uma aplica; as outras são duplicata (200) ou perderam a trava (500, a Woovi reenvia).
    expect(results.map((r) => r.status).filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    await deliver(renewal);
    const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, userId));
    expect(payments).toHaveLength(2);
    expect((await plan(userId)).plan.periodEnd).toBe(periodEnd + periodMs("monthly"));
  });

  it("eventos diferentes simultâneos da mesma conta: nenhum se perde depois das reentregas", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    const periodEnd = (await plan(userId)).plan.periodEnd!;
    const second = payloads.installmentCompleted(correlationId, 2);
    const third = payloads.installmentCompleted(correlationId, 3);
    await Promise.all([sendWebhook(second), sendWebhook(third)]);
    // A Woovi reentrega o que não recebeu 2xx; reentregar tudo é seguro.
    await deliver(second);
    await deliver(third);
    expect((await plan(userId)).plan.periodEnd).toBe(periodEnd + 2 * periodMs("monthly"));
  });

  it("pagamento confirmado por dois eventos diferentes (cobrança e parcela) estende uma vez", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.chargeCompleted(correlationId));
    const periodEnd = (await plan(userId)).plan.periodEnd;
    await deliver(payloads.installmentCompleted(correlationId, 1));
    expect((await plan(userId)).plan.periodEnd).toBe(periodEnd);
  });
});

describe("mensal", () => {
  it("assinar → renovar → falhar com novas tentativas → voltar a pagar", async () => {
    const { userId, paymentId, correlationId } = await startCheckout("monthly");
    expect(await paymentStatus(paymentId)).toEqual({ status: "pending" });

    await deliver(payloads.recurrenceApproved(correlationId));
    // A autorização sozinha não concede o plano: só a confirmação do pagamento.
    expect((await plan(userId)).plan.status).toBe("none");

    await deliver(payloads.installmentCompleted(correlationId, 1));
    expect(await paymentStatus(paymentId)).toEqual({ status: "paid" });
    const first = await plan(userId);
    expect(first.plan).toMatchObject({ status: "active", plus: true, cycle: "monthly", renews: true });
    expect(first.badges).toContain("plus");

    await deliver(payloads.installmentCompleted(correlationId, 2));
    const renewed = await plan(userId);
    expect(renewed.plan.periodEnd).toBe(first.plan.periodEnd! + periodMs("monthly"));

    await deliver(payloads.installmentTryRejected(correlationId, 3, 1));
    expect((await plan(userId)).plan).toMatchObject({ status: "past_due", plus: true, renews: false });
    await deliver(payloads.installmentTryRejected(correlationId, 3, 2));
    expect((await plan(userId)).plan.status).toBe("past_due");

    await deliver(payloads.installmentCompleted(correlationId, 3));
    expect((await plan(userId)).plan).toMatchObject({ status: "active", plus: true, renews: true });
    const payments = await db.select().from(billingPayments).where(eq(billingPayments.userId, userId));
    expect(payments.map((p) => p.status)).toEqual(["paid", "paid", "paid"]);
  });

  it("falhar até encerrar (tentativas esgotadas)", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    for (let attempt = 1; attempt <= PLUS_RETRY_ATTEMPTS + 1; attempt++) {
      await deliver(payloads.installmentTryRejected(correlationId, 2, attempt));
    }
    expect((await plan(userId)).plan).toMatchObject({ status: "ended", plus: false });
    expect((await plan(userId)).badges).not.toContain("plus");
  });

  it("falhar até encerrar (recusa definitiva da Woovi)", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    await deliver(payloads.installmentTryRejected(correlationId, 2, 1));
    await deliver(payloads.installmentRejected(correlationId, 2));
    expect((await plan(userId)).plan.status).toBe("ended");
  });

  it("cancelar e valer até o fim do período", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    const { periodEnd } = (await plan(userId)).plan;

    const response = await postJson("/api/plus/cancel", {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "canceled", plus: true, renews: false, periodEnd });
    expect(wooviCalls(woovi, "PUT", `/api/v1/subscriptions/${correlationId}/cancel`)).toHaveLength(1);
    const [row] = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, userId));
    expect(row!.cancelRequestedAt).not.toBeNull();

    expect((await plan(userId, periodEnd! - 1)).plan).toMatchObject({ status: "canceled", plus: true });
    expect((await plan(userId, periodEnd!)).plan).toMatchObject({ status: "ended", plus: false });
  });

  it("autorização recusada no checkout: pagamento falha e não há plano", async () => {
    const { userId, paymentId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.recurrenceRejected(correlationId));
    expect(await paymentStatus(paymentId)).toEqual({ status: "failed" });
    expect((await plan(userId)).plan.status).toBe("none");
  });

  it("autorização revogada no banco depois de pagar: vale até o fim do período", async () => {
    const { userId, correlationId } = await startCheckout("monthly");
    await deliver(payloads.installmentCompleted(correlationId, 1));
    await deliver(payloads.recurrenceRejected(correlationId));
    expect((await plan(userId)).plan).toMatchObject({ status: "canceled", plus: true });
  });
});

describe("anual", () => {
  it("assinar anual vale 365 dias e vence sem renovar", async () => {
    const { userId, paymentId, correlationId } = await startCheckout("annual");
    const before = Date.now();
    await deliver(payloads.chargeCompleted(correlationId));
    expect(await paymentStatus(paymentId)).toEqual({ status: "paid" });
    const { plan: current } = await plan(userId);
    expect(current).toMatchObject({ status: "active", cycle: "annual", plus: true, renews: false });
    expect(current.periodEnd! - before).toBeGreaterThanOrEqual(365 * DAY_MS);
    expect(current.periodEnd! - before).toBeLessThan(365 * DAY_MS + 60_000);

    expect((await plan(userId, current.periodEnd! - 1)).plan.plus).toBe(true);
    expect((await plan(userId, current.periodEnd!)).plan).toMatchObject({ status: "ended", plus: false });
  });

  it("cobrança expirada marca o pagamento como expirado", async () => {
    const { userId, paymentId, correlationId } = await startCheckout("annual");
    await deliver(payloads.chargeExpired(correlationId));
    expect(await paymentStatus(paymentId)).toEqual({ status: "expired" });
    expect((await plan(userId)).plan.status).toBe("none");
  });

  it("cobrança paga depois de expirada ainda vale (a confirmação da Woovi manda)", async () => {
    const { userId, correlationId } = await startCheckout("annual");
    await deliver(payloads.chargeExpired(correlationId));
    await deliver(payloads.chargeCompleted(correlationId));
    expect((await plan(userId)).plan.status).toBe("active");
  });
});
