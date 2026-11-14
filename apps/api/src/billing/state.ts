import {
  PLUS_ANNUAL_PERIOD_DAYS,
  PLUS_MONTHLY_PERIOD_DAYS,
  PLUS_RETRY_ATTEMPTS,
  PLUS_RETRY_WINDOW_DAYS,
} from "@sualive/config";
import type { Plan, PlanCycle, PlusCycle, PlusStatus } from "@sualive/protocol";

/**
 * Máquina de estados da assinatura do Plus. Módulo puro: sem rede, sem banco, sem relógio (o
 * instante vem no evento). Não conhece o formato da Woovi: `billing/woovi.ts` traduz os webhooks
 * para os eventos daqui.
 *
 *   none ──pagamento──▶ active ──falha na renovação──▶ past_due ──pagamento──▶ active
 *                         │                               └──tentativas esgotadas / 7 dias──▶ ended
 *                         ├──cancelamento──▶ canceled ──fim do período──▶ ended
 *                         └──(anual) fim dos 365 dias──▶ ended
 *
 * Plus de presente (ciclo `gift`): sem Plus valendo, vira `active` com os dias dados e acaba
 * sozinho no fim do período (como o anual), sem renovação; com Plus valendo, só soma os dias ao
 * período. Um pagamento confirmado sobre um plano `gift` troca o ciclo pelo pago e soma o período.
 *
 * Transição inválida não lança: devolve o estado igual e o motivo, para registro sem dado pessoal.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionState {
  status: PlusStatus;
  /** `gift`: Plus recebido de presente (sem pagamento, sem renovação). */
  cycle: PlanCycle | null;
  /** Fim do período pago (ms). */
  periodEnd: number | null;
  /** Início do atraso (ms). */
  pastDueSince: number | null;
  /** Tentativas da renovação atual que falharam. */
  failedAttempts: number;
}

export const INITIAL_STATE: SubscriptionState = {
  status: "none",
  cycle: null,
  periodEnd: null,
  pastDueSince: null,
  failedAttempts: 0,
};

export type SubscriptionEvent =
  /** A Woovi confirmou um pagamento (primeiro, renovação ou nova tentativa). */
  | { type: "payment_confirmed"; at: number; cycle: PlusCycle }
  /** Uma tentativa de cobrança da renovação mensal falhou (haverá novas tentativas). */
  | { type: "charge_failed"; at: number }
  /** A cobrança da renovação foi recusada de vez: tentativas esgotadas. */
  | { type: "charge_rejected"; at: number }
  /** A pessoa pediu o cancelamento aqui. */
  | { type: "cancel_requested"; at: number }
  /** A recorrência não cobra mais na Woovi (autorização revogada no banco ou cancelada). */
  | { type: "recurrence_stopped"; at: number }
  /** Outra conta presenteou dias de Plus (pagos em ouro). */
  | { type: "gift_received"; at: number; days: number }
  /** Passagem do tempo (rotina diária e leitura do plano). */
  | { type: "tick"; at: number };

export interface TransitionResult {
  state: SubscriptionState;
  changed: boolean;
  /** Motivo de uma transição ignorada (sem dado pessoal). */
  ignored?: string;
}

/** Duração do período pago de cada ciclo. */
export function periodMs(cycle: PlusCycle): number {
  return (cycle === "annual" ? PLUS_ANNUAL_PERIOD_DAYS : PLUS_MONTHLY_PERIOD_DAYS) * DAY_MS;
}

/** Janela das novas tentativas da renovação mensal. */
export const RETRY_WINDOW_MS = PLUS_RETRY_WINDOW_DAYS * DAY_MS;

/**
 * Folga do mensal ativo depois do fim do período: a Woovi cobra no mesmo dia do mês (28 a 31 dias
 * depois), o webhook pode atrasar e as novas tentativas duram a janela. Se nada chegar nem a rotina
 * diária confirmar nada nesse prazo, a assinatura acaba.
 */
export const MONTHLY_GRACE_MS = RETRY_WINDOW_MS + 2 * DAY_MS;

function same(state: SubscriptionState, ignored?: string): TransitionResult {
  return ignored ? { state, changed: false, ignored } : { state, changed: false };
}

function to(state: SubscriptionState, next: Partial<SubscriptionState>): TransitionResult {
  return { state: { ...state, ...next }, changed: true };
}

function ended(state: SubscriptionState): TransitionResult {
  return to(state, { status: "ended", pastDueSince: null, failedAttempts: 0 });
}

export function transition(state: SubscriptionState, event: SubscriptionEvent): TransitionResult {
  switch (event.type) {
    case "payment_confirmed": {
      const length = periodMs(event.cycle);
      if (state.status === "none" || state.status === "ended") {
        return to(state, {
          status: "active",
          cycle: event.cycle,
          periodEnd: event.at + length,
          pastDueSince: null,
          failedAttempts: 0,
        });
      }
      // Renovação, tentativa paga ou pagamento que chegou depois do cancelamento: o período pago
      // sempre é respeitado. Cancelada continua cancelada (não renova), só com o período maior.
      const base = Math.max(state.periodEnd ?? event.at, event.at);
      const status = state.status === "canceled" ? "canceled" : "active";
      return to(state, {
        status,
        // Plano de presente que recebe um pagamento passa a ser do ciclo pago.
        cycle: state.cycle === null || state.cycle === "gift" ? event.cycle : state.cycle,
        periodEnd: base + length,
        pastDueSince: null,
        failedAttempts: 0,
      });
    }

    case "charge_failed": {
      if (state.cycle !== "monthly") return same(state, "charge_failed fora do mensal");
      if (state.status === "active") {
        return to(state, { status: "past_due", pastDueSince: event.at, failedAttempts: 1 });
      }
      if (state.status === "past_due") {
        const failedAttempts = state.failedAttempts + 1;
        // A primeira falha mais PLUS_RETRY_ATTEMPTS novas tentativas.
        if (failedAttempts > PLUS_RETRY_ATTEMPTS) return ended(state);
        return to(state, { failedAttempts });
      }
      return same(state, `charge_failed em ${state.status}`);
    }

    case "charge_rejected": {
      if (state.cycle !== "monthly") return same(state, "charge_rejected fora do mensal");
      if (state.status === "past_due" || state.status === "active") return ended(state);
      return same(state, `charge_rejected em ${state.status}`);
    }

    case "cancel_requested": {
      if (state.cycle !== "monthly") return same(state, "cancel_requested fora do mensal");
      if (state.status === "active") return to(state, { status: "canceled" });
      // Em atraso o período pago já acabou: cancelar encerra.
      if (state.status === "past_due") return ended(state);
      return same(state, `cancel_requested em ${state.status}`);
    }

    case "recurrence_stopped": {
      if (state.cycle !== "monthly") return same(state, "recurrence_stopped fora do mensal");
      if (state.status === "active") return to(state, { status: "canceled" });
      if (state.status === "past_due") return ended(state);
      return same(state, `recurrence_stopped em ${state.status}`);
    }

    case "gift_received": {
      const length = event.days * DAY_MS;
      const { state: current } = transition(state, { type: "tick", at: event.at });
      if (isPlus(current) && current.periodEnd !== null) {
        // Plus valendo: os dias somam ao período atual e o resto não muda.
        return to(current, { periodEnd: current.periodEnd + length });
      }
      return to(current, {
        status: "active",
        cycle: "gift",
        periodEnd: event.at + length,
        pastDueSince: null,
        failedAttempts: 0,
      });
    }

    case "tick": {
      const periodEnd = state.periodEnd ?? 0;
      if (state.status === "canceled" && event.at >= periodEnd) return ended(state);
      if (
        state.status === "active" &&
        (state.cycle === "annual" || state.cycle === "gift") &&
        event.at >= periodEnd
      ) {
        return ended(state);
      }
      if (
        state.status === "active" &&
        state.cycle === "monthly" &&
        event.at >= periodEnd + MONTHLY_GRACE_MS
      ) {
        return ended(state);
      }
      if (state.status === "past_due" && event.at >= (state.pastDueSince ?? 0) + RETRY_WINDOW_MS) {
        return ended(state);
      }
      return same(state);
    }
  }
}

/** Os benefícios do Plus valem neste estado (sem aplicar a passagem do tempo). */
function isPlus(state: SubscriptionState): boolean {
  return state.status === "active" || state.status === "past_due" || state.status === "canceled";
}

/** Plano mostrado ao navegador, já com a passagem do tempo aplicada. */
export function planFromState(stored: SubscriptionState, now: number): Plan {
  const { state } = transition(stored, { type: "tick", at: now });
  return {
    status: state.status,
    plus: isPlus(state),
    cycle: state.cycle,
    periodEnd: state.periodEnd,
    renews: state.status === "active" && state.cycle === "monthly",
  };
}
