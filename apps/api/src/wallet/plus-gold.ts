import { captureException } from "@sentry/cloudflare";
import {
  PLUS_GOLD_AMOUNT,
  PLUS_GOLD_CREDITS_ANNUAL,
  PLUS_GOLD_CREDITS_MONTHLY,
  PLUS_GOLD_INTERVAL_DAYS,
} from "@sualive/config";
import type { AppEnv } from "../env";
import { creditStatements, runLedger } from "./ledger";

/**
 * Ouro do Plus pago. Cada linha paga de `billing_payments` com conta rende créditos de
 * PLUS_GOLD_AMOUNT: o mensal, PLUS_GOLD_CREDITS_MONTHLY; o anual, PLUS_GOLD_CREDITS_ANNUAL, o
 * k-ésimo (k = 0, 1, ...) vencendo em `paidAt + k × PLUS_GOLD_INTERVAL_DAYS` dias. A referência
 * `plus-gold:<pagamento>:<k>` é única: o webhook e a rotina diária podem rodar juntos sem creditar
 * duas vezes. Plus de presente não tem linha de pagamento, então não rende ouro.
 */

export const PLUS_GOLD_INTERVAL_MS = PLUS_GOLD_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
/** Pagamentos com crédito vencido tratados por execução (o resto fica para a próxima). */
export const PLUS_GOLD_MAX_PAYMENTS_PER_RUN = 500;

export function plusGoldCredits(cycle: string): number {
  return cycle === "annual" ? PLUS_GOLD_CREDITS_ANNUAL : PLUS_GOLD_CREDITS_MONTHLY;
}

/** Quantos créditos de um pagamento já venceram no instante dado. */
export function dueCredits(cycle: string, paidAt: number, now: number): number {
  if (now < paidAt) return 0;
  return Math.min(plusGoldCredits(cycle), Math.floor((now - paidAt) / PLUS_GOLD_INTERVAL_MS) + 1);
}

export function plusGoldReference(paymentId: string, k: number): string {
  return `plus-gold:${paymentId}:${k}`;
}

export interface PlusGoldReport {
  payments: number;
  credited: number;
  failed: number;
}

interface PendingPayment {
  id: string;
  user_id: string;
  cycle: string;
  paid_at: number;
}

/**
 * Credita o ouro do Plus já vencido e ainda não lançado. Com `userId`, só os pagamentos dessa
 * conta (logo depois do webhook); sem, todos (rotina diária, que também cobre a estreia: os
 * pagamentos feitos desde a entrega 2 recebem os créditos vencidos na primeira execução).
 * Falha num crédito não para os outros.
 */
export async function creditPlusGold(env: AppEnv, now: number, userId?: string): Promise<PlusGoldReport> {
  // Créditos já lançados de cada pagamento: faixa de referências `plus-gold:<id>:` (o índice único
  // de `reference` atende; ";" é o caractere seguinte a ":").
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, cycle, paid_at FROM (
       SELECT p.id, p.user_id, p.cycle, p.paid_at,
         MIN(CASE WHEN p.cycle = 'annual' THEN ?2 ELSE ?3 END, CAST((?1 - p.paid_at) / ?4 AS INTEGER) + 1) AS due,
         (SELECT COUNT(*) FROM wallet_ledger l
           WHERE l.reference >= 'plus-gold:' || p.id || ':' AND l.reference < 'plus-gold:' || p.id || ';') AS credited
       FROM billing_payments p
       WHERE p.status = 'paid' AND p.user_id IS NOT NULL AND p.paid_at IS NOT NULL AND p.paid_at <= ?1
         AND (?5 IS NULL OR p.user_id = ?5)
     )
     WHERE credited < due
     ORDER BY paid_at
     LIMIT ?6`,
  )
    .bind(
      now,
      PLUS_GOLD_CREDITS_ANNUAL,
      PLUS_GOLD_CREDITS_MONTHLY,
      PLUS_GOLD_INTERVAL_MS,
      userId ?? null,
      PLUS_GOLD_MAX_PAYMENTS_PER_RUN,
    )
    .all<PendingPayment>();

  const report: PlusGoldReport = { payments: results.length, credited: 0, failed: 0 };
  for (const payment of results) {
    const due = dueCredits(payment.cycle, payment.paid_at, now);
    let done: Set<string>;
    try {
      const existing = await env.DB.prepare(
        "SELECT reference FROM wallet_ledger WHERE reference >= ?1 AND reference < ?2",
      )
        .bind(`plus-gold:${payment.id}:`, `plus-gold:${payment.id};`)
        .all<{ reference: string }>();
      done = new Set(existing.results.map((row) => row.reference));
    } catch (error) {
      report.failed++;
      captureException(error);
      continue;
    }
    for (let k = 0; k < due; k++) {
      if (done.has(plusGoldReference(payment.id, k))) continue;
      try {
        const outcome = await runLedger(
          env,
          creditStatements(env, {
            userId: payment.user_id,
            currency: "gold",
            amount: PLUS_GOLD_AMOUNT,
            reason: "plus_gold",
            reference: plusGoldReference(payment.id, k),
            now,
          }),
        );
        // `duplicate`: já creditado (agora há pouco, por outra execução). Nada a fazer.
        if (outcome === "ok") report.credited++;
      } catch (error) {
        report.failed++;
        captureException(error);
      }
    }
  }
  return report;
}
