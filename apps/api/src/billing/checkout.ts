import { captureException } from "@sentry/cloudflare";
import { PLUS_ANNUAL_PRICE_CENTS, PLUS_MONTHLY_PRICE_CENTS, PLUS_RETRY_WINDOW_DAYS } from "@sualive/config";
import type { Plan, PlusCheckoutResponse, PlusCycle } from "@sualive/protocol";
import { and, desc, eq } from "drizzle-orm";
import type { Viewer } from "../auth/viewer";
import { createDb } from "../db";
import { billingPayments } from "../db/schema";
import type { AppEnv } from "../env";
import { qrCodeDataUrl } from "./qr";
import { planFromState, transition } from "./state";
import { loadSubscription, stateOf, writeSubscription } from "./store";
import { cancelRecurrence, createCharge, createRecurrence } from "./woovi";

/** Quanto tempo um checkout pendente fica válido (e é reaproveitado). */
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
/** Checkout que vence em menos que isto não é reaproveitado. */
export const CHECKOUT_REUSE_MARGIN_MS = 10 * 60 * 1000;
/** Contrato mostrado ao pagador no app do banco (a Woovi exige menos de 30 caracteres). */
const CONTRACT_TEXT: Record<PlusCycle, string> = {
  monthly: "sualive Plus mensal",
  annual: "sualive Plus anual",
};

export function priceCents(cycle: PlusCycle): number {
  return cycle === "annual" ? PLUS_ANNUAL_PRICE_CENTS : PLUS_MONTHLY_PRICE_CENTS;
}

/** Dia do mês em Brasília (a jornada 3 exige que a primeira cobrança seja hoje). */
function chargeDayInBrazil(now: number): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "numeric" }).format(now),
  );
}

type PaymentRow = typeof billingPayments.$inferSelect;

function checkoutResponse(payment: PaymentRow): PlusCheckoutResponse {
  const brCode = payment.brCode!;
  return {
    paymentId: payment.id,
    cycle: payment.cycle as PlusCycle,
    amountCents: payment.amountCents,
    brCode,
    qrCodeImageUrl: payment.qrCodeImageUrl ?? qrCodeDataUrl(brCode),
    expiresAt: payment.expiresAt!,
  };
}

export type CheckoutResult =
  { ok: true; body: PlusCheckoutResponse } | { ok: false; error: "already_subscribed" };

/**
 * Cria (ou reaproveita) o checkout do Plus. Preço e ciclo vêm da configuração; a conta vem do
 * login; o CPF só passa para a Woovi.
 */
export async function createCheckout(
  env: AppEnv,
  viewer: Viewer,
  cycle: PlusCycle,
  taxId: string,
  now: number,
): Promise<CheckoutResult> {
  const plan = planFromState(stateOf(await loadSubscription(env, viewer.userId)), now);
  if (plan.plus) return { ok: false, error: "already_subscribed" };

  const db = createDb(env.DB);
  const pending = await db
    .select()
    .from(billingPayments)
    .where(and(eq(billingPayments.userId, viewer.userId), eq(billingPayments.status, "pending")))
    .orderBy(desc(billingPayments.createdAt));
  const reusable = pending.find(
    (payment) =>
      payment.cycle === cycle &&
      payment.brCode !== null &&
      payment.expiresAt !== null &&
      payment.expiresAt > now + CHECKOUT_REUSE_MARGIN_MS,
  );
  if (reusable) return { ok: true, body: checkoutResponse(reusable) };

  const amountCents = priceCents(cycle);
  const correlationId = `sualive-plus-${cycle}-${crypto.randomUUID()}`;
  const customer = { name: viewer.nickname, taxId };
  let brCode: string;
  let qrCodeImageUrl: string | null = null;
  let expiresAt = now + CHECKOUT_TTL_MS;
  if (cycle === "monthly") {
    ({ brCode } = await createRecurrence(env, {
      correlationId,
      valueCents: amountCents,
      customer,
      comment: CONTRACT_TEXT.monthly,
      chargeDay: chargeDayInBrazil(now),
      dueDays: PLUS_RETRY_WINDOW_DAYS,
    }));
  } else {
    const charge = await createCharge(env, {
      correlationId,
      valueCents: amountCents,
      customer,
      comment: CONTRACT_TEXT.annual,
      expiresInSeconds: CHECKOUT_TTL_MS / 1000,
    });
    brCode = charge.brCode;
    qrCodeImageUrl = charge.qrCodeImageUrl;
    expiresAt = charge.expiresAt ?? expiresAt;
  }

  const payment: PaymentRow = {
    id: crypto.randomUUID(),
    userId: viewer.userId,
    cycle,
    amountCents,
    status: "pending",
    correlationId,
    wooviSubscriptionCorrelationId: cycle === "monthly" ? correlationId : null,
    wooviInstallmentId: null,
    brCode,
    qrCodeImageUrl,
    expiresAt,
    paidAt: null,
    createdAt: now,
  };
  await db.insert(billingPayments).values(payment);

  // Os checkouts pendentes anteriores deixam de ser mostrados. Se um deles ainda for pago, o
  // webhook confirma assim mesmo (o dinheiro manda). A recorrência mensal antiga é cancelada para
  // não haver duas autorizações.
  for (const old of pending) {
    await db
      .update(billingPayments)
      .set({ status: "expired" })
      .where(and(eq(billingPayments.id, old.id), eq(billingPayments.status, "pending")));
    if (old.wooviSubscriptionCorrelationId) {
      try {
        await cancelRecurrence(env, old.wooviSubscriptionCorrelationId);
      } catch (error) {
        captureException(error);
      }
    }
  }

  return { ok: true, body: checkoutResponse(payment) };
}

/** Estado de um pagamento da própria conta, ou `null` (inexistente ou de outra conta). */
export async function getPaymentStatus(env: AppEnv, userId: string, paymentId: string) {
  const rows = await createDb(env.DB)
    .select({ status: billingPayments.status })
    .from(billingPayments)
    .where(and(eq(billingPayments.id, paymentId), eq(billingPayments.userId, userId)))
    .limit(1);
  return rows[0]?.status ?? null;
}

/**
 * Cancelamento pedido pela pessoa: cancela a recorrência na Woovi e registra o pedido. O plano
 * continua valendo até o fim do período pago; a rotina diária confirma o cancelamento na Woovi (e
 * tenta de novo se a chamada de agora falhar). O anual não renova: devolve o plano como está.
 */
export async function requestCancel(env: AppEnv, userId: string, now: number): Promise<Plan> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await loadSubscription(env, userId);
    const state = stateOf(previous);
    const result = transition(state, { type: "cancel_requested", at: now });
    if (!previous || !result.changed) return planFromState(state, now);

    if (previous.wooviCorrelationId && attempt === 0) {
      try {
        await cancelRecurrence(env, previous.wooviCorrelationId);
      } catch (error) {
        captureException(error);
      }
    }
    const outcome = await writeSubscription(
      env,
      userId,
      previous,
      result.state,
      { cancelRequestedAt: now },
      now,
    ).run();
    if (outcome.meta.changes === 1) return planFromState(result.state, now);
    // Um webhook mudou a assinatura entre a leitura e a escrita: lê de novo.
  }
  throw new Error("cancelamento não gravado: assinatura mudando sem parar");
}
