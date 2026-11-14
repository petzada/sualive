import { PLUS_ANNUAL_EXPIRY_NOTICE_DAYS } from "@sualive/config";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runDailyBilling } from "../src/billing/daily";
import { planStatusAt } from "../src/billing/plan";
import { DAY_MS, periodMs, RETRY_WINDOW_MS } from "../src/billing/state";
import { resetWebhookKeyCache } from "../src/billing/woovi";
import { billingSubscriptions } from "../src/db/schema";
import type { AppEnv } from "../src/env";
import worker from "../src/index";
import {
  billingEnv,
  createUser,
  db,
  mockWoovi,
  setupWebhookKeys,
  wooviCalls,
  type WooviMock,
} from "./billing-helpers";
import { useD1 } from "./d1";

useD1();

let woovi: WooviMock;
const NOW = Date.UTC(2026, 10, 14, 9);

beforeAll(setupWebhookKeys);
beforeEach(async () => {
  resetWebhookKeyCache();
  woovi = mockWoovi();
  await db.delete(billingSubscriptions);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function subscription(values: Partial<typeof billingSubscriptions.$inferInsert>) {
  const userId = await createUser();
  await db.insert(billingSubscriptions).values({
    userId,
    cycle: "monthly",
    status: "active",
    periodEnd: NOW + 10 * DAY_MS,
    createdAt: NOW - DAY_MS,
    updatedAt: NOW - DAY_MS,
    ...values,
  });
  return userId;
}

async function row(userId: string) {
  const [result] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId));
  return result!;
}

describe("rotina diária", () => {
  it("confirma o cancelamento na Woovi e mantém o período pago", async () => {
    const userId = await subscription({
      status: "canceled",
      wooviCorrelationId: "rec-cancelada",
      cancelRequestedAt: NOW,
    });
    woovi.remote.set("rec-cancelada", { status: "INACTIVE", pixRecurring: "CANCELED" });
    await runDailyBilling(billingEnv, NOW);
    expect(await row(userId)).toMatchObject({ status: "canceled", cancelConfirmedAt: NOW, checkedAt: NOW });
    expect((await planStatusAt(billingEnv, userId, NOW)).plan.plus).toBe(true);
  });

  it("repete o cancelamento na Woovi quando ele ainda não pegou", async () => {
    const userId = await subscription({
      status: "canceled",
      wooviCorrelationId: "rec-ativa",
      cancelRequestedAt: NOW,
    });
    woovi.remote.set("rec-ativa", { status: "ACTIVE", pixRecurring: "APPROVED" });
    await runDailyBilling(billingEnv, NOW);
    expect(wooviCalls(woovi, "PUT", "/api/v1/subscriptions/rec-ativa/cancel")).toHaveLength(1);
    expect((await row(userId)).cancelConfirmedAt).toBeNull();
  });

  it("descobre cancelamento feito pelo pagador no banco (sem evento) e vira cancelada", async () => {
    const userId = await subscription({ wooviCorrelationId: "rec-revogada" });
    woovi.remote.set("rec-revogada", { status: "ACTIVE", pixRecurring: "REJECTED" });
    await runDailyBilling(billingEnv, NOW);
    expect(await row(userId)).toMatchObject({ status: "canceled", cancelConfirmedAt: NOW });
  });

  it("encerra cancelada com o período vencido", async () => {
    const userId = await subscription({
      status: "canceled",
      periodEnd: NOW - 1,
      wooviCorrelationId: "rec-x",
      cancelConfirmedAt: NOW - DAY_MS,
    });
    await runDailyBilling(billingEnv, NOW);
    expect((await row(userId)).status).toBe("ended");
    expect(woovi.calls).toEqual([]);
  });

  it("encerra o anual vencido", async () => {
    const userId = await subscription({ cycle: "annual", periodEnd: NOW - 1 });
    await runDailyBilling(billingEnv, NOW);
    expect((await row(userId)).status).toBe("ended");
  });

  it("encerra o atraso com a janela de novas tentativas vencida", async () => {
    const userId = await subscription({
      status: "past_due",
      periodEnd: NOW - RETRY_WINDOW_MS - DAY_MS,
      pastDueSince: NOW - RETRY_WINDOW_MS,
      failedAttempts: 2,
      wooviCorrelationId: "rec-atraso",
    });
    woovi.remote.set("rec-atraso", { status: "EXPIRED", pixRecurring: "APPROVED" });
    await runDailyBilling(billingEnv, NOW);
    expect((await row(userId)).status).toBe("ended");
  });

  it("marca o aviso de vencimento do anual 7 dias antes, uma vez", async () => {
    const soon = await subscription({
      cycle: "annual",
      periodEnd: NOW + PLUS_ANNUAL_EXPIRY_NOTICE_DAYS * DAY_MS - 1,
    });
    const later = await subscription({ cycle: "annual", periodEnd: NOW + periodMs("annual") });
    await runDailyBilling(billingEnv, NOW);
    expect((await row(soon)).expiryNoticeAt).toBe(NOW);
    expect((await row(later)).expiryNoticeAt).toBeNull();
    await runDailyBilling(billingEnv, NOW + DAY_MS);
    expect((await row(soon)).expiryNoticeAt).toBe(NOW);
  });

  it("falha numa consulta não impede as outras", async () => {
    const broken = await subscription({ wooviCorrelationId: "rec-inexistente" });
    const fine = await subscription({ wooviCorrelationId: "rec-ok" });
    woovi.remote.set("rec-ok", { status: "INACTIVE", pixRecurring: "CANCELED" });
    const report = await runDailyBilling(billingEnv, NOW);
    expect(report).toMatchObject({ failed: 1 });
    expect((await row(broken)).status).toBe("active");
    expect((await row(fine)).status).toBe("canceled");
  });

  it("o handler agendado do Worker roda a rotina", async () => {
    const userId = await subscription({ cycle: "annual", periodEnd: Date.now() - 1 });
    const ctx = createExecutionContext();
    // O `withSentry` mantém a assinatura (controller, env, ctx) do handler exportado.
    const scheduled = worker.scheduled as unknown as (
      c: ScheduledController,
      e: AppEnv,
      x: ExecutionContext,
    ) => Promise<void>;
    await scheduled(createScheduledController({ cron: "0 9 * * *" }), billingEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect((await row(userId)).status).toBe("ended");
  });
});
