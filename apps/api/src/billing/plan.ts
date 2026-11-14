import { captureException } from "@sentry/cloudflare";
import type { Badge, Plan } from "@sualive/protocol";
import { and, eq, isNotNull } from "drizzle-orm";
import { createDb } from "../db";
import { billingEarlySupporters, billingPayments } from "../db/schema";
import type { AppEnv } from "../env";
import { planFromState } from "./state";
import { loadSubscription, stateOf } from "./store";
import { cancelRecurrence } from "./woovi";

/**
 * Plano e selos de uma conta. Contrato entre a cobrança (que implementa) e o resto do Worker
 * (perfil, salas), que só conhece estas funções. O estado só muda pelo webhook da Woovi.
 */
export interface PlanStatus {
  plan: Plan;
  /** `plus` enquanto o plano vale; `early_supporter` é permanente. */
  badges: Badge[];
}

export const NO_PLAN: PlanStatus = {
  plan: { status: "none", plus: false, cycle: null, periodEnd: null, renews: false },
  badges: [],
};

/** Plano e selos atuais da conta. */
export async function getPlanStatus(env: AppEnv, userId: string): Promise<PlanStatus> {
  return planStatusAt(env, userId, Date.now());
}

/** `getPlanStatus` num instante dado (rotas e testes). */
export async function planStatusAt(env: AppEnv, userId: string, now: number): Promise<PlanStatus> {
  const [subscription, supporter] = await Promise.all([
    loadSubscription(env, userId),
    createDb(env.DB)
      .select({ position: billingEarlySupporters.position })
      .from(billingEarlySupporters)
      .where(eq(billingEarlySupporters.userId, userId))
      .limit(1),
  ]);
  // A passagem do tempo é aplicada na leitura: o plano para de valer na hora certa mesmo antes de
  // a rotina diária gravar o novo estado.
  const plan = subscription ? planFromState(stateOf(subscription), now) : NO_PLAN.plan;
  const badges: Badge[] = [];
  if (plan.plus) badges.push("plus");
  if (supporter.length > 0) badges.push("early_supporter");
  return { plan, badges };
}

/** A assinatura está ligada neste ambiente (credenciais da Woovi presentes). */
export function isBillingEnabled(env: AppEnv): boolean {
  return Boolean(env.WOOVI_APP_ID && env.WOOVI_WEBHOOK_SECRET);
}

/**
 * Apaga os dados de cobrança ligados à conta, na exclusão da conta (guardando só o que a lei
 * exigir, sem dado pessoal).
 *
 * Cancela na Woovi (melhor esforço) a recorrência em vigor e as pendentes, para não haver cobrança
 * depois da exclusão. Apaga a assinatura e os checkouts não pagos; os pagamentos feitos ficam como
 * registro contábil anônimo (sem conta e sem QR Code); o selo de apoiador fica anônimo e a posição
 * continua ocupada. CPF nunca é guardado aqui.
 */
export async function deleteBillingData(env: AppEnv, userId: string): Promise<void> {
  const db = createDb(env.DB);
  const subscription = await loadSubscription(env, userId);
  const pendingRecurrences = await db
    .select({ recurrence: billingPayments.wooviSubscriptionCorrelationId })
    .from(billingPayments)
    .where(
      and(
        eq(billingPayments.userId, userId),
        eq(billingPayments.status, "pending"),
        isNotNull(billingPayments.wooviSubscriptionCorrelationId),
      ),
    );

  const toCancel = new Set<string>();
  if (
    subscription?.wooviCorrelationId &&
    subscription.cancelConfirmedAt === null &&
    subscription.status !== "ended"
  ) {
    toCancel.add(subscription.wooviCorrelationId);
  }
  for (const { recurrence } of pendingRecurrences) if (recurrence) toCancel.add(recurrence);
  if (isBillingEnabled(env)) {
    for (const recurrence of toCancel) {
      try {
        await cancelRecurrence(env, recurrence);
      } catch (error) {
        captureException(error);
      }
    }
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM billing_subscriptions WHERE user_id = ?1").bind(userId),
    env.DB.prepare("DELETE FROM billing_payments WHERE user_id = ?1 AND status != 'paid'").bind(userId),
    env.DB.prepare(
      "UPDATE billing_payments SET user_id = NULL, br_code = NULL, qr_code_image_url = NULL WHERE user_id = ?1",
    ).bind(userId),
    env.DB.prepare("UPDATE billing_early_supporters SET user_id = NULL WHERE user_id = ?1").bind(userId),
  ]);
}
