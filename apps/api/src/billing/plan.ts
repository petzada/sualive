import type { Badge, Plan } from "@sualive/protocol";
import type { AppEnv } from "../env";

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
// Implementação: tarefa de Plus e cobrança da entrega 2.
export async function getPlanStatus(_env: AppEnv, _userId: string): Promise<PlanStatus> {
  return NO_PLAN;
}

/** A assinatura está ligada neste ambiente (credenciais da Woovi presentes). */
export function isBillingEnabled(env: AppEnv): boolean {
  return Boolean(env.WOOVI_APP_ID && env.WOOVI_WEBHOOK_SECRET);
}

/**
 * Apaga os dados de cobrança ligados à conta, na exclusão da conta (guardando só o que a lei
 * exigir, sem dado pessoal).
 */
// Implementação: tarefa de Plus e cobrança da entrega 2.
export async function deleteBillingData(_env: AppEnv, _userId: string): Promise<void> {}
