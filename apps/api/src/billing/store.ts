import type { PlusCycle, PlusStatus } from "@sualive/protocol";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { billingSubscriptions } from "../db/schema";
import type { AppEnv } from "../env";
import { INITIAL_STATE, type SubscriptionState } from "./state";

/**
 * Leitura e escrita da assinatura no D1. As escritas são instruções preparadas para ir num
 * `batch` do D1 (atômico): ou tudo é aplicado, ou nada.
 */

export type SubscriptionRow = typeof billingSubscriptions.$inferSelect;

/** Campos fora da máquina de estados, atualizados junto com ela. */
export interface SubscriptionExtras {
  wooviCorrelationId?: string | null;
  cancelRequestedAt?: number | null;
  cancelConfirmedAt?: number | null;
  expiryNoticeAt?: number | null;
  checkedAt?: number | null;
}

export async function loadSubscription(env: AppEnv, userId: string): Promise<SubscriptionRow | null> {
  const rows = await createDb(env.DB)
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export function stateOf(row: SubscriptionRow | null): SubscriptionState {
  if (!row) return INITIAL_STATE;
  return {
    status: row.status as PlusStatus,
    cycle: row.cycle as PlusCycle,
    periodEnd: row.periodEnd,
    pastDueSince: row.pastDueSince,
    failedAttempts: row.failedAttempts,
  };
}

/**
 * Grava o novo estado. Linha existente: atualiza só se `version` não mudou desde a leitura (trava
 * otimista; `meta.changes` = 0 indica que outra escrita chegou antes). Sem linha: insere (falha se
 * outra escrita inseriu antes, o que desfaz o `batch`).
 */
export function writeSubscription(
  env: AppEnv,
  userId: string,
  previous: SubscriptionRow | null,
  state: SubscriptionState,
  extras: SubscriptionExtras,
  now: number,
): D1PreparedStatement {
  if (state.status === "none" || state.cycle === null || state.periodEnd === null) {
    throw new Error("estado sem assinatura não é gravado");
  }
  const merged = {
    wooviCorrelationId: previous?.wooviCorrelationId ?? null,
    cancelRequestedAt: previous?.cancelRequestedAt ?? null,
    cancelConfirmedAt: previous?.cancelConfirmedAt ?? null,
    expiryNoticeAt: previous?.expiryNoticeAt ?? null,
    checkedAt: previous?.checkedAt ?? null,
    ...extras,
  };
  if (!previous) {
    return env.DB.prepare(
      `INSERT INTO billing_subscriptions (user_id, cycle, status, period_end, past_due_since, failed_attempts,
         woovi_correlation_id, cancel_requested_at, cancel_confirmed_at, expiry_notice_at, checked_at, version,
         created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?12)`,
    ).bind(
      userId,
      state.cycle,
      state.status,
      state.periodEnd,
      state.pastDueSince,
      state.failedAttempts,
      merged.wooviCorrelationId,
      merged.cancelRequestedAt,
      merged.cancelConfirmedAt,
      merged.expiryNoticeAt,
      merged.checkedAt,
      now,
    );
  }
  return env.DB.prepare(
    `UPDATE billing_subscriptions SET cycle = ?2, status = ?3, period_end = ?4, past_due_since = ?5,
       failed_attempts = ?6, woovi_correlation_id = ?7, cancel_requested_at = ?8, cancel_confirmed_at = ?9,
       expiry_notice_at = ?10, checked_at = ?11, version = version + 1, updated_at = ?12
     WHERE user_id = ?1 AND version = ?13`,
  ).bind(
    userId,
    state.cycle,
    state.status,
    state.periodEnd,
    state.pastDueSince,
    state.failedAttempts,
    merged.wooviCorrelationId,
    merged.cancelRequestedAt,
    merged.cancelConfirmedAt,
    merged.expiryNoticeAt,
    merged.checkedAt,
    now,
    previous.version,
  );
}

/**
 * Registra a chave do evento de webhook. É a primeira instrução do `batch`: chave repetida falha
 * (idempotência) e, quando `guard` é passado, `processed_at` fica nulo e a inserção falha se a
 * assinatura mudou desde a leitura (concorrência). Qualquer falha desfaz o `batch` inteiro.
 */
export function recordEvent(
  env: AppEnv,
  eventKey: string,
  now: number,
  guard?: { userId: string; previous: SubscriptionRow | null },
): D1PreparedStatement {
  if (!guard) {
    return env.DB.prepare(
      "INSERT INTO billing_webhook_events (event_key, processed_at) VALUES (?1, ?2)",
    ).bind(eventKey, now);
  }
  if (guard.previous) {
    return env.DB.prepare(
      `INSERT INTO billing_webhook_events (event_key, processed_at)
       VALUES (?1, (SELECT ?2 FROM billing_subscriptions WHERE user_id = ?3 AND version = ?4))`,
    ).bind(eventKey, now, guard.userId, guard.previous.version);
  }
  return env.DB.prepare(
    `INSERT INTO billing_webhook_events (event_key, processed_at)
     VALUES (?1, (SELECT ?2 WHERE NOT EXISTS (SELECT 1 FROM billing_subscriptions WHERE user_id = ?3)))`,
  ).bind(eventKey, now, guard.userId);
}

/**
 * Concede o selo de apoiador inicial se ainda houver posição. Uma única instrução: a próxima
 * posição é calculada e gravada dentro da mesma escrita (o D1 serializa as escritas), e a chave
 * primária mais o CHECK impedem posição repetida ou acima do limite.
 */
export function grantEarlySupporter(
  env: AppEnv,
  userId: string,
  limit: number,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO billing_early_supporters (position, user_id, granted_at)
     SELECT COALESCE(MAX(position), 0) + 1, ?1, ?2 FROM billing_early_supporters
     HAVING COALESCE(MAX(position), 0) < ?3
       AND NOT EXISTS (SELECT 1 FROM billing_early_supporters WHERE user_id = ?1)`,
  ).bind(userId, now, limit);
}
