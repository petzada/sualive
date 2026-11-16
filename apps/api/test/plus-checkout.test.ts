import { PLUS_ANNUAL_PRICE_CENTS, PLUS_MONTHLY_PRICE_CENTS } from "@sualive/config";
import { planSchema, plusCheckoutResponseSchema } from "@sualive/protocol";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBillingEvent } from "../src/billing/events";
import { deleteBillingData, planStatusAt } from "../src/billing/plan";
import { resetWebhookKeyCache } from "../src/billing/woovi";
import { billingPayments, billingSubscriptions } from "../src/db/schema";
import {
  billingEnv,
  createUser,
  db,
  FAKE_BRCODE,
  FAKE_EMV,
  INVALID_CPF,
  loginAs,
  mockWoovi,
  postJson,
  request,
  setupWebhookKeys,
  VALID_CPF,
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

async function checkout(cycle: "monthly" | "annual", taxId = VALID_CPF) {
  return postJson("/api/plus/checkout", { cycle, taxId });
}

async function paymentRow(id: string) {
  const [row] = await db.select().from(billingPayments).where(eq(billingPayments.id, id));
  return row!;
}

describe("POST /api/plus/checkout", () => {
  it("exige conta logada e primeiro acesso concluído", async () => {
    loginAs(null);
    expect((await checkout("monthly")).status).toBe(401);
    loginAs(await createUser(), false);
    const response = await checkout("monthly");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "onboarding_required" });
  });

  it("recusa ambiente sem cobrança", async () => {
    loginAs(await createUser());
    const response = await postJson(
      "/api/plus/checkout",
      { cycle: "monthly", taxId: VALID_CPF },
      { WOOVI_APP_ID: undefined, WOOVI_WEBHOOK_SECRET: undefined },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "billing_unavailable" });
    expect(woovi.calls).toEqual([]);
  });

  it("recusa CPF inválido sem chamar a Woovi", async () => {
    loginAs(await createUser());
    for (const taxId of [INVALID_CPF, "11111111111", "123", "529.982.247-25"]) {
      const response = await checkout("monthly", taxId);
      expect(response.status).toBe(400);
    }
    expect(woovi.calls).toEqual([]);
  });

  it("mensal: cria o Pix Automático na jornada 3 com 3 novas tentativas em 7 dias", async () => {
    const userId = await createUser();
    loginAs(userId);
    const response = await checkout("monthly");
    expect(response.status).toBe(200);
    const body = plusCheckoutResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ cycle: "monthly", amountCents: PLUS_MONTHLY_PRICE_CENTS, brCode: FAKE_EMV });
    expect(body.qrCodeImageUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    const [call] = wooviCalls(woovi, "POST", "/api/v1/subscriptions");
    expect(call!.authorization).toBe(billingEnv.WOOVI_APP_ID);
    expect(call!.body).toMatchObject({
      value: PLUS_MONTHLY_PRICE_CENTS,
      type: "PIX_RECURRING",
      frequency: "MONTHLY",
      customer: { taxID: VALID_CPF },
      pixRecurringOptions: { journey: "PAYMENT_ON_APPROVAL", retryPolicy: "THREE_RETRIES_7_DAYS" },
    });
    expect((call!.body as { comment: string }).comment.length).toBeLessThan(30);

    const row = await paymentRow(body.paymentId);
    expect(row).toMatchObject({
      userId,
      status: "pending",
      cycle: "monthly",
      amountCents: PLUS_MONTHLY_PRICE_CENTS,
    });
  });

  it("anual: cria a cobrança Pix única com o preço da configuração", async () => {
    loginAs(await createUser());
    const body = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    expect(body).toMatchObject({
      cycle: "annual",
      amountCents: PLUS_ANNUAL_PRICE_CENTS,
      brCode: FAKE_BRCODE,
      qrCodeImageUrl: "https://api.woovi.com/openpix/charge/brcode/image/teste.png",
    });
    expect(wooviCalls(woovi, "POST", "/api/v1/charge")[0]!.body).toMatchObject({
      value: PLUS_ANNUAL_PRICE_CENTS,
    });
  });

  it("ignora preço e plano mandados pelo navegador", async () => {
    loginAs(await createUser());
    const response = await postJson("/api/plus/checkout", {
      cycle: "annual",
      taxId: VALID_CPF,
      amountCents: 1,
      plan: "free",
    });
    const body = plusCheckoutResponseSchema.parse(await response.json());
    expect(body.amountCents).toBe(PLUS_ANNUAL_PRICE_CENTS);
  });

  it("reaproveita o checkout pendente do mesmo ciclo", async () => {
    loginAs(await createUser());
    const first = plusCheckoutResponseSchema.parse(await (await checkout("monthly")).json());
    const second = plusCheckoutResponseSchema.parse(await (await checkout("monthly")).json());
    expect(second.paymentId).toBe(first.paymentId);
    expect(wooviCalls(woovi, "POST", "/api/v1/subscriptions")).toHaveLength(1);
  });

  it("trocar de ciclo cria outro checkout e cancela a recorrência pendente anterior", async () => {
    loginAs(await createUser());
    const monthly = plusCheckoutResponseSchema.parse(await (await checkout("monthly")).json());
    const annual = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    expect(annual.paymentId).not.toBe(monthly.paymentId);
    expect((await paymentRow(monthly.paymentId)).status).toBe("expired");
    expect(wooviCalls(woovi, "PUT", "/api/v1/subscriptions/")).toHaveLength(1);
  });

  it("recusa quem já tem Plus ativo", async () => {
    const userId = await createUser();
    loginAs(userId);
    const body = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    const row = await paymentRow(body.paymentId);
    await applyBillingEvent(
      billingEnv,
      { kind: "charge_paid", key: `charge_paid:${row.correlationId}`, correlationId: row.correlationId },
      Date.now(),
    );
    const response = await checkout("monthly");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "already_subscribed" });
  });

  it("falha da Woovi não grava pagamento", async () => {
    const userId = await createUser();
    loginAs(userId);
    woovi.failCreate = true;
    const response = await checkout("monthly");
    expect(response.status).toBe(500);
    expect(await db.select().from(billingPayments).where(eq(billingPayments.userId, userId))).toEqual([]);
  });
});

describe("GET /api/plus/payments/:id", () => {
  it("devolve o estado do pagamento ao dono", async () => {
    loginAs(await createUser());
    const body = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    const response = await request(`/api/plus/payments/${body.paymentId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
  });

  it("pagamento de outra conta não é legível", async () => {
    loginAs(await createUser());
    const body = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    loginAs(await createUser());
    const response = await request(`/api/plus/payments/${body.paymentId}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});

describe("POST /api/plus/cancel", () => {
  it("anual não tem o que cancelar: devolve o plano atual", async () => {
    const userId = await createUser();
    loginAs(userId);
    const body = plusCheckoutResponseSchema.parse(await (await checkout("annual")).json());
    const row = await paymentRow(body.paymentId);
    await applyBillingEvent(
      billingEnv,
      { kind: "charge_paid", key: `charge_paid:${row.correlationId}`, correlationId: row.correlationId },
      Date.now(),
    );
    const response = await postJson("/api/plus/cancel", {});
    expect(response.status).toBe(200);
    expect(planSchema.parse(await response.json())).toMatchObject({
      status: "active",
      cycle: "annual",
      plus: true,
    });
    expect(wooviCalls(woovi, "PUT", "/api/v1/subscriptions/")).toEqual([]);
  });

  it("sem assinatura devolve o plano vazio", async () => {
    loginAs(await createUser());
    const response = await postJson("/api/plus/cancel", {});
    expect(await response.json()).toEqual({
      status: "none",
      plus: false,
      cycle: null,
      periodEnd: null,
      renews: false,
    });
  });
});

describe("CSRF em /api/plus", () => {
  const forged = (path: string, body: unknown, headers: Record<string, string>) =>
    request(path, {
      method: "POST",
      body: JSON.stringify(body),
      // Sem preflight: é o que uma página de outra origem consegue mandar.
      headers: { "Content-Type": "text/plain", ...headers },
    });

  it("recusa checkout e cancelamento vindos de outra origem, do mesmo site ou sem cabeçalho", async () => {
    loginAs(await createUser());
    const body = { cycle: "annual", taxId: VALID_CPF };
    for (const headers of [
      { "Sec-Fetch-Site": "same-site", Origin: "https://outro.example.workers.dev" },
      { "Sec-Fetch-Site": "cross-site" },
      { Origin: "https://evil.test" },
      {},
    ]) {
      expect((await forged("/api/plus/checkout", body, headers)).status).toBe(400);
      expect((await forged("/api/plus/cancel", {}, headers)).status).toBe(400);
    }
    // Nada chegou à Woovi.
    expect(woovi.calls).toEqual([]);
  });
});

describe("deleteBillingData", () => {
  it("cancela a recorrência na Woovi, apaga a assinatura e não deixa CPF", async () => {
    const userId = await createUser();
    loginAs(userId);
    const body = plusCheckoutResponseSchema.parse(await (await checkout("monthly")).json());
    const row = await paymentRow(body.paymentId);
    await applyBillingEvent(
      billingEnv,
      {
        kind: "installment_paid",
        key: "installment_paid:delete-1",
        recurrenceId: row.correlationId,
        installmentId: "delete-1",
        installmentNumber: 1,
      },
      Date.now(),
    );
    expect((await planStatusAt(billingEnv, userId, Date.now())).plan.status).toBe("active");

    await deleteBillingData(billingEnv, userId);

    expect(wooviCalls(woovi, "PUT", `/api/v1/subscriptions/${row.correlationId}/cancel`)).toHaveLength(1);
    expect(
      await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, userId)),
    ).toEqual([]);
    // O pagamento feito fica como registro anônimo; nada em nenhuma tabela de cobrança tem o CPF.
    const [kept] = await db.select().from(billingPayments).where(eq(billingPayments.id, row.id));
    expect(kept).toMatchObject({ userId: null, status: "paid", brCode: null, qrCodeImageUrl: null });
    for (const table of [
      "billing_payments",
      "billing_subscriptions",
      "billing_webhook_events",
      "billing_early_supporters",
    ]) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      expect(JSON.stringify(results)).not.toContain(VALID_CPF);
    }
    expect((await planStatusAt(billingEnv, userId, Date.now())).plan.status).toBe("none");
  });
});
