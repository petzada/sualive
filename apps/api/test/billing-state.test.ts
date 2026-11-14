import { PLUS_RETRY_ATTEMPTS } from "@sualive/config";
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  INITIAL_STATE,
  MONTHLY_GRACE_MS,
  periodMs,
  planFromState,
  RETRY_WINDOW_MS,
  transition,
  type SubscriptionEvent,
  type SubscriptionState,
} from "../src/billing/state";

const T0 = Date.UTC(2026, 10, 14, 12);
const MONTH = periodMs("monthly");
const YEAR = periodMs("annual");

function state(partial: Partial<SubscriptionState>): SubscriptionState {
  return { ...INITIAL_STATE, ...partial };
}

const activeMonthly = state({ status: "active", cycle: "monthly", periodEnd: T0 + MONTH });
const activeAnnual = state({ status: "active", cycle: "annual", periodEnd: T0 + YEAR });
const pastDue = state({
  status: "past_due",
  cycle: "monthly",
  periodEnd: T0 + MONTH,
  pastDueSince: T0 + MONTH,
  failedAttempts: 1,
});
const canceled = state({ status: "canceled", cycle: "monthly", periodEnd: T0 + MONTH });
const ended = state({ status: "ended", cycle: "monthly", periodEnd: T0 - DAY_MS });

describe("máquina de estados: transições válidas", () => {
  it("none → active com o primeiro pagamento mensal (30 dias)", () => {
    const result = transition(INITIAL_STATE, { type: "payment_confirmed", at: T0, cycle: "monthly" });
    expect(result.changed).toBe(true);
    expect(result.state).toEqual(state({ status: "active", cycle: "monthly", periodEnd: T0 + 30 * DAY_MS }));
  });

  it("none → active com o anual (365 dias)", () => {
    const result = transition(INITIAL_STATE, { type: "payment_confirmed", at: T0, cycle: "annual" });
    expect(result.state).toEqual(state({ status: "active", cycle: "annual", periodEnd: T0 + 365 * DAY_MS }));
  });

  it("active → active: a renovação estende a partir do fim do período", () => {
    const at = T0 + MONTH - DAY_MS;
    const result = transition(activeMonthly, { type: "payment_confirmed", at, cycle: "monthly" });
    expect(result.state.periodEnd).toBe(T0 + 2 * MONTH);
    expect(result.state.status).toBe("active");
  });

  it("active → past_due quando a cobrança da renovação falha", () => {
    const at = T0 + MONTH;
    const result = transition(activeMonthly, { type: "charge_failed", at });
    expect(result.state).toMatchObject({ status: "past_due", pastDueSince: at, failedAttempts: 1 });
  });

  it("past_due → past_due a cada nova tentativa que falha, dentro do limite", () => {
    let current = pastDue;
    for (let i = 2; i <= PLUS_RETRY_ATTEMPTS; i++) {
      current = transition(current, { type: "charge_failed", at: T0 + MONTH + i * DAY_MS }).state;
      expect(current).toMatchObject({ status: "past_due", failedAttempts: i, pastDueSince: T0 + MONTH });
    }
  });

  it("past_due → ended quando as novas tentativas se esgotam", () => {
    let current = pastDue;
    for (let i = 0; i < PLUS_RETRY_ATTEMPTS; i++) {
      current = transition(current, { type: "charge_failed", at: T0 + MONTH + (i + 1) * DAY_MS }).state;
    }
    expect(current.status).toBe("ended");
  });

  it("past_due → ended com a recusa definitiva da Woovi", () => {
    expect(transition(pastDue, { type: "charge_rejected", at: T0 + MONTH + 7 * DAY_MS }).state.status).toBe(
      "ended",
    );
  });

  it("past_due → ended quando a janela de 7 dias vence", () => {
    const at = (pastDue.pastDueSince ?? 0) + RETRY_WINDOW_MS;
    expect(transition(pastDue, { type: "tick", at }).state.status).toBe("ended");
    expect(transition(pastDue, { type: "tick", at: at - 1 }).changed).toBe(false);
  });

  it("past_due → active quando uma nova tentativa é paga", () => {
    const at = T0 + MONTH + 2 * DAY_MS;
    const result = transition(pastDue, { type: "payment_confirmed", at, cycle: "monthly" });
    expect(result.state).toEqual(state({ status: "active", cycle: "monthly", periodEnd: at + MONTH }));
  });

  it("active → canceled mantém o período pago", () => {
    const result = transition(activeMonthly, { type: "cancel_requested", at: T0 + DAY_MS });
    expect(result.state).toEqual({ ...activeMonthly, status: "canceled" });
  });

  it("active → canceled quando a recorrência para na Woovi (autorização revogada no banco)", () => {
    expect(transition(activeMonthly, { type: "recurrence_stopped", at: T0 }).state.status).toBe("canceled");
  });

  it("canceled → ended quando o período acaba", () => {
    expect(transition(canceled, { type: "tick", at: T0 + MONTH }).state.status).toBe("ended");
    expect(transition(canceled, { type: "tick", at: T0 + MONTH - 1 }).changed).toBe(false);
  });

  it("anual: active → ended ao fim dos 365 dias, sem renovação", () => {
    expect(transition(activeAnnual, { type: "tick", at: T0 + YEAR - 1 }).changed).toBe(false);
    expect(transition(activeAnnual, { type: "tick", at: T0 + YEAR }).state.status).toBe("ended");
  });

  it("ended → active com novo pagamento", () => {
    const result = transition(ended, { type: "payment_confirmed", at: T0, cycle: "annual" });
    expect(result.state).toEqual(state({ status: "active", cycle: "annual", periodEnd: T0 + YEAR }));
  });

  it("mensal ativo sem nenhuma notícia além da folga encerra", () => {
    expect(transition(activeMonthly, { type: "tick", at: T0 + MONTH + MONTHLY_GRACE_MS - 1 }).changed).toBe(
      false,
    );
    expect(transition(activeMonthly, { type: "tick", at: T0 + MONTH + MONTHLY_GRACE_MS }).state.status).toBe(
      "ended",
    );
  });

  it("pagamento depois do cancelamento estende o período sem voltar a renovar", () => {
    const result = transition(canceled, {
      type: "payment_confirmed",
      at: T0 + MONTH - DAY_MS,
      cycle: "monthly",
    });
    expect(result.state).toMatchObject({ status: "canceled", periodEnd: T0 + 2 * MONTH });
  });

  it("em atraso, cancelar encerra (o período pago já acabou)", () => {
    expect(transition(pastDue, { type: "cancel_requested", at: T0 + MONTH + DAY_MS }).state.status).toBe(
      "ended",
    );
  });
});

describe("máquina de estados: transições inválidas são ignoradas sem lançar", () => {
  const invalid: [string, SubscriptionState, SubscriptionEvent][] = [
    ["falha sem assinatura", INITIAL_STATE, { type: "charge_failed", at: T0 }],
    ["recusa sem assinatura", INITIAL_STATE, { type: "charge_rejected", at: T0 }],
    ["cancelar sem assinatura", INITIAL_STATE, { type: "cancel_requested", at: T0 }],
    ["falha no anual", activeAnnual, { type: "charge_failed", at: T0 }],
    ["recusa no anual", activeAnnual, { type: "charge_rejected", at: T0 }],
    ["cancelar o anual", activeAnnual, { type: "cancel_requested", at: T0 }],
    ["recorrência parada no anual", activeAnnual, { type: "recurrence_stopped", at: T0 }],
    ["falha em cancelada", canceled, { type: "charge_failed", at: T0 }],
    ["recusa em cancelada", canceled, { type: "charge_rejected", at: T0 }],
    ["cancelar de novo", canceled, { type: "cancel_requested", at: T0 }],
    ["recorrência parada em cancelada", canceled, { type: "recurrence_stopped", at: T0 }],
    ["falha em encerrada", ended, { type: "charge_failed", at: T0 }],
    ["recusa em encerrada", ended, { type: "charge_rejected", at: T0 }],
    ["cancelar encerrada", ended, { type: "cancel_requested", at: T0 }],
    ["recorrência parada em encerrada", ended, { type: "recurrence_stopped", at: T0 }],
  ];

  it.each(invalid)("%s", (_name, before, event) => {
    const result = transition(before, event);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(before);
    expect(result.ignored).toEqual(expect.any(String));
  });

  it("tick sem nada vencido não muda nada", () => {
    for (const before of [INITIAL_STATE, activeMonthly, activeAnnual, pastDue, canceled, ended]) {
      const result = transition(before, { type: "tick", at: T0 });
      expect(result.changed).toBe(false);
      expect(result.ignored).toBeUndefined();
    }
  });
});

describe("plano mostrado", () => {
  it("plus vale em active, past_due e canceled dentro do período; renova só mensal ativo", () => {
    expect(planFromState(activeMonthly, T0)).toEqual({
      status: "active",
      plus: true,
      cycle: "monthly",
      periodEnd: T0 + MONTH,
      renews: true,
    });
    expect(planFromState(pastDue, T0 + MONTH + DAY_MS)).toMatchObject({ plus: true, renews: false });
    expect(planFromState(canceled, T0)).toMatchObject({ status: "canceled", plus: true, renews: false });
    expect(planFromState(activeAnnual, T0)).toMatchObject({ plus: true, renews: false });
  });

  it("aplica a passagem do tempo: cancelada e anual vencidas aparecem encerradas", () => {
    expect(planFromState(canceled, T0 + MONTH)).toMatchObject({ status: "ended", plus: false });
    expect(planFromState(activeAnnual, T0 + YEAR)).toMatchObject({ status: "ended", plus: false });
    expect(planFromState(INITIAL_STATE, T0)).toMatchObject({ status: "none", plus: false, cycle: null });
  });
});
