import { EARLY_SUPPORTER_LIMIT, PLUS_MONTHLY_PRICE_CENTS } from "@sualive/config";
import type { PlusCycle } from "@sualive/protocol";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { billingPayments, billingSubscriptions, billingWebhookEvents } from "../db/schema";
import type { AppEnv } from "../env";
import { transition, type SubscriptionEvent } from "./state";
import {
  grantEarlySupporter,
  loadSubscription,
  recordEvent,
  stateOf,
  writeSubscription,
  type SubscriptionExtras,
  type SubscriptionRow,
} from "./store";
import type { BillingEvent } from "./woovi";

/**
 * Aplica um evento da Woovi (já autenticado e traduzido). Única origem de mudança de estado de
 * pagamento e de assinatura, além da rotina diária. Idempotente: a chave do evento e as escritas
 * vão no mesmo `batch` do D1, então o mesmo fato entregue duas vezes só tem efeito uma vez.
 */

type PaymentRow = typeof billingPayments.$inferSelect;
export type ApplyResult = "applied" | "duplicate" | "ignored";

function log(message: string) {
  // Sem dado pessoal: só o tipo do evento e o motivo.
  console.warn(`[billing] ${message}`);
}

async function alreadyProcessed(env: AppEnv, key: string): Promise<boolean> {
  const rows = await createDb(env.DB)
    .select({ key: billingWebhookEvents.eventKey })
    .from(billingWebhookEvents)
    .where(eq(billingWebhookEvents.eventKey, key))
    .limit(1);
  return rows.length > 0;
}

async function paymentByCorrelation(env: AppEnv, correlationId: string): Promise<PaymentRow | null> {
  const rows = await createDb(env.DB)
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.correlationId, correlationId))
    .limit(1);
  return rows[0] ?? null;
}

async function paymentByInstallment(env: AppEnv, installmentId: string): Promise<PaymentRow | null> {
  const rows = await createDb(env.DB)
    .select()
    .from(billingPayments)
    .where(eq(billingPayments.wooviInstallmentId, installmentId))
    .limit(1);
  return rows[0] ?? null;
}

async function subscriptionByRecurrence(env: AppEnv, recurrenceId: string): Promise<SubscriptionRow | null> {
  const rows = await createDb(env.DB)
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.wooviCorrelationId, recurrenceId))
    .limit(1);
  return rows[0] ?? null;
}

function markPaid(env: AppEnv, payment: PaymentRow, installmentId: string | null, now: number) {
  return env.DB.prepare(
    `UPDATE billing_payments SET status = 'paid', paid_at = ?2,
       woovi_installment_id = COALESCE(woovi_installment_id, ?3), br_code = NULL, qr_code_image_url = NULL
     WHERE id = ?1 AND status != 'paid'`,
  ).bind(payment.id, now, installmentId);
}

/** Instruções de uma transição da assinatura da conta, com a trava do evento na frente. */
async function subscriptionChange(
  env: AppEnv,
  key: string,
  userId: string,
  previous: SubscriptionRow | null,
  event: SubscriptionEvent,
  now: number,
  extras: SubscriptionExtras = {},
): Promise<{ statements: D1PreparedStatement[]; changed: boolean }> {
  const result = transition(stateOf(previous), event);
  if (result.ignored) log(`transição ignorada: ${result.ignored}`);
  const statements = [recordEvent(env, key, now, { userId, previous })];
  const extrasChanged = Object.keys(extras).length > 0 && previous !== null;
  if (result.changed || extrasChanged) {
    statements.push(writeSubscription(env, userId, previous, result.state, extras, now));
  }
  return { statements, changed: result.changed };
}

/** Pagamento confirmado pela Woovi: marca pago, ativa ou estende o Plus e tenta o selo. */
async function confirmPayment(
  env: AppEnv,
  key: string,
  payment: PaymentRow,
  installmentId: string | null,
  now: number,
): Promise<D1PreparedStatement[]> {
  if (payment.status === "paid") {
    // Já confirmado por outro evento do mesmo pagamento: só liga a parcela, sem estender de novo.
    const statements = [recordEvent(env, key, now)];
    if (installmentId && !payment.wooviInstallmentId) {
      statements.push(
        env.DB.prepare(
          "UPDATE billing_payments SET woovi_installment_id = ?2 WHERE id = ?1 AND woovi_installment_id IS NULL",
        ).bind(payment.id, installmentId),
      );
    }
    return statements;
  }
  if (!payment.userId) {
    // Conta excluída: guarda o pagamento (anônimo), sem plano.
    return [recordEvent(env, key, now), markPaid(env, payment, installmentId, now)];
  }

  const previous = await loadSubscription(env, payment.userId);
  const cycle = payment.cycle as PlusCycle;
  const fresh = !previous || previous.status === "ended";
  const extras: SubscriptionExtras = fresh
    ? {
        wooviCorrelationId: cycle === "monthly" ? payment.wooviSubscriptionCorrelationId : null,
        cancelRequestedAt: null,
        cancelConfirmedAt: null,
        expiryNoticeAt: null,
      }
    : {};
  if (
    !fresh &&
    cycle === "monthly" &&
    payment.wooviSubscriptionCorrelationId &&
    previous.wooviCorrelationId !== payment.wooviSubscriptionCorrelationId
  ) {
    log("pagamento de outra recorrência com assinatura em vigor: período estendido, conferir na Woovi");
  }
  const result = transition(stateOf(previous), { type: "payment_confirmed", at: now, cycle });
  return [
    recordEvent(env, key, now, { userId: payment.userId, previous }),
    markPaid(env, payment, installmentId, now),
    writeSubscription(env, payment.userId, previous, result.state, extras, now),
    grantEarlySupporter(env, payment.userId, EARLY_SUPPORTER_LIMIT, now),
  ];
}

async function planStatements(env: AppEnv, event: Exclude<BillingEvent, { kind: "ignored" }>, now: number) {
  switch (event.kind) {
    case "charge_paid": {
      const payment = await paymentByCorrelation(env, event.correlationId);
      if (!payment) {
        log("cobrança paga sem pagamento correspondente");
        return [recordEvent(env, event.key, now)];
      }
      return confirmPayment(env, event.key, payment, null, now);
    }

    case "charge_expired": {
      const payment = await paymentByCorrelation(env, event.correlationId);
      const statements = [recordEvent(env, event.key, now)];
      if (payment?.status === "pending") {
        statements.push(
          env.DB.prepare(
            "UPDATE billing_payments SET status = 'expired' WHERE id = ?1 AND status = 'pending'",
          ).bind(payment.id),
        );
      }
      return statements;
    }

    case "recurrence_approved":
      // Na jornada 3 a primeira parcela já foi paga, mas o plano só é concedido pela confirmação do
      // pagamento (PIX_AUTOMATIC_COBR_COMPLETED), que a Woovi também envia.
      return [recordEvent(env, event.key, now)];

    case "recurrence_rejected": {
      // Pagador recusou a autorização (checkout pendente vira `failed`) ou a revogou no banco depois
      // (a assinatura vale até o fim do período pago).
      const [first, subscription] = await Promise.all([
        paymentByCorrelation(env, event.recurrenceId),
        subscriptionByRecurrence(env, event.recurrenceId),
      ]);
      const statements: D1PreparedStatement[] = [];
      if (subscription) {
        const change = await subscriptionChange(
          env,
          event.key,
          subscription.userId,
          subscription,
          { type: "recurrence_stopped", at: now },
          now,
          { cancelConfirmedAt: now },
        );
        statements.push(...change.statements);
      } else {
        statements.push(recordEvent(env, event.key, now));
      }
      if (first && (first.status === "pending" || first.status === "expired")) {
        statements.push(
          env.DB.prepare(
            "UPDATE billing_payments SET status = 'failed' WHERE id = ?1 AND status IN ('pending', 'expired')",
          ).bind(first.id),
        );
      }
      return statements;
    }

    case "installment_paid": {
      if (await paymentByInstallment(env, event.installmentId)) return [recordEvent(env, event.key, now)];
      const first = await paymentByCorrelation(env, event.recurrenceId);
      if (!first) {
        log("parcela paga de recorrência desconhecida");
        return [recordEvent(env, event.key, now)];
      }
      const isFirst =
        event.installmentNumber !== null ? event.installmentNumber <= 1 : first.status !== "paid";
      if (isFirst) return confirmPayment(env, event.key, first, event.installmentId, now);

      // Renovação: nova linha paga (histórico) e período estendido.
      const insertRenewal = env.DB.prepare(
        `INSERT INTO billing_payments (id, user_id, cycle, amount_cents, status, correlation_id,
           woovi_subscription_correlation_id, woovi_installment_id, paid_at, created_at)
         VALUES (?1, ?2, 'monthly', ?3, 'paid', ?4, ?5, ?6, ?7, ?7)`,
      ).bind(
        crypto.randomUUID(),
        first.userId,
        PLUS_MONTHLY_PRICE_CENTS,
        `${event.recurrenceId}:${event.installmentId}`,
        event.recurrenceId,
        event.installmentId,
        now,
      );
      const subscription = await subscriptionByRecurrence(env, event.recurrenceId);
      if (!subscription || subscription.userId !== first.userId) {
        log(
          "renovação paga de recorrência que não é a assinatura atual: pagamento guardado, conferir na Woovi",
        );
        return [recordEvent(env, event.key, now), insertRenewal];
      }
      const change = await subscriptionChange(
        env,
        event.key,
        subscription.userId,
        subscription,
        { type: "payment_confirmed", at: now, cycle: "monthly" },
        now,
      );
      return [...change.statements, insertRenewal];
    }

    case "installment_failed":
    case "installment_rejected": {
      const subscription = await subscriptionByRecurrence(env, event.recurrenceId);
      if (!subscription) {
        log(`${event.kind} de recorrência sem assinatura`);
        return [recordEvent(env, event.key, now)];
      }
      const change = await subscriptionChange(
        env,
        event.key,
        subscription.userId,
        subscription,
        event.kind === "installment_failed"
          ? { type: "charge_failed", at: now }
          : { type: "charge_rejected", at: now },
        now,
      );
      return change.statements;
    }
  }
}

export async function applyBillingEvent(env: AppEnv, event: BillingEvent, now: number): Promise<ApplyResult> {
  if (event.kind === "ignored") return "ignored";
  if (await alreadyProcessed(env, event.key)) return "duplicate";
  const statements = await planStatements(env, event, now);
  try {
    await env.DB.batch(statements);
    return "applied";
  } catch (error) {
    // Chave repetida (entrega simultânea do mesmo evento) é duplicata; qualquer outra falha
    // (inclusive a trava de concorrência) desfaz tudo e a Woovi reenvia depois.
    if (await alreadyProcessed(env, event.key)) return "duplicate";
    throw error;
  }
}
