import { captureException } from "@sentry/cloudflare";
import { PLUS_ANNUAL_EXPIRY_NOTICE_DAYS } from "@sualive/config";
import { asc, inArray, sql } from "drizzle-orm";
import { createDb } from "../db";
import { billingSubscriptions } from "../db/schema";
import type { AppEnv } from "../env";
import { DAY_MS, transition, type SubscriptionState } from "./state";
import { stateOf, writeSubscription, type SubscriptionExtras, type SubscriptionRow } from "./store";
import { cancelRecurrence, getRecurrenceStatus } from "./woovi";
import { isBillingEnabled } from "./plan";

/**
 * Rotina diária (cron). A Woovi não avisa cancelamento, então a rotina consulta cada recorrência
 * ativa, em atraso ou cancelada e corrige o estado local; encerra o que venceu (anual, cancelada,
 * atraso esgotado) e marca o aviso de vencimento do anual.
 *
 * Limites: no máximo MAX_ROWS_PER_RUN assinaturas por execução (as menos recentemente conferidas
 * primeiro, então o resto fica para o dia seguinte), em grupos de CONCURRENCY consultas
 * simultâneas (o Worker abre no máximo 6 conexões de saída por vez). Falha num item não para os
 * outros.
 */

export const MAX_ROWS_PER_RUN = 500;
const CONCURRENCY = 5;
const NOTICE_MS = PLUS_ANNUAL_EXPIRY_NOTICE_DAYS * DAY_MS;

export interface DailyReport {
  checked: number;
  changed: number;
  failed: number;
}

async function reconcile(env: AppEnv, row: SubscriptionRow, now: number): Promise<boolean> {
  let state: SubscriptionState = stateOf(row);
  let changed = false;
  const extras: SubscriptionExtras = { checkedAt: now };

  const apply = (event: Parameters<typeof transition>[1]) => {
    const result = transition(state, event);
    if (result.changed) {
      state = result.state;
      changed = true;
    }
  };

  const remoteMatters =
    row.cycle === "monthly" &&
    row.wooviCorrelationId !== null &&
    row.cancelConfirmedAt === null &&
    (row.status === "active" || row.status === "past_due" || row.status === "canceled");
  if (remoteMatters && isBillingEnabled(env)) {
    const remote = await getRecurrenceStatus(env, row.wooviCorrelationId!);
    if (remote === "stopped") {
      extras.cancelConfirmedAt = now;
      apply({ type: "recurrence_stopped", at: now });
    } else if (row.cancelRequestedAt !== null) {
      // O pedido de cancelamento ainda não pegou na Woovi: tenta de novo.
      await cancelRecurrence(env, row.wooviCorrelationId!);
    }
  }

  apply({ type: "tick", at: now });

  if (
    state.status === "active" &&
    state.cycle === "annual" &&
    state.periodEnd !== null &&
    now >= state.periodEnd - NOTICE_MS &&
    row.expiryNoticeAt === null
  ) {
    extras.expiryNoticeAt = now;
  }

  const outcome = await writeSubscription(env, row.userId, row, state, extras, now).run();
  // `changes` = 0: um webhook mexeu na assinatura agora há pouco; fica para amanhã.
  return changed && outcome.meta.changes === 1;
}

export async function runDailyBilling(env: AppEnv, now: number): Promise<DailyReport> {
  const rows = await createDb(env.DB)
    .select()
    .from(billingSubscriptions)
    .where(inArray(billingSubscriptions.status, ["active", "past_due", "canceled"]))
    .orderBy(sql`${billingSubscriptions.checkedAt} IS NOT NULL`, asc(billingSubscriptions.checkedAt))
    .limit(MAX_ROWS_PER_RUN);

  const report: DailyReport = { checked: 0, changed: 0, failed: 0 };
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const results = await Promise.allSettled(
      rows.slice(i, i + CONCURRENCY).map((row) => reconcile(env, row, now)),
    );
    for (const result of results) {
      report.checked++;
      if (result.status === "fulfilled") {
        if (result.value) report.changed++;
      } else {
        report.failed++;
        captureException(result.reason);
      }
    }
  }
  console.log(
    `[billing] rotina diária: ${report.checked} conferidas, ${report.changed} mudaram, ${report.failed} falharam`,
  );
  return report;
}
