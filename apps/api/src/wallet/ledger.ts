import { GOLD_GIFT_DAILY_LIMIT, WALLET_TIME_ZONE, WELCOME_SILVER, type Currency } from "@sualive/config";
import type { LedgerReason, WalletResponse } from "@sualive/protocol";
import type { AppEnv } from "../env";

/**
 * Núcleo da carteira: o único lugar que muda saldo. Regras que valem para todo o Worker:
 *
 * - Saldo e livro-razão mudam juntos, no mesmo `batch` do D1 (atômico): use sempre as instruções
 *   daqui (`creditStatements`, `debitStatements`, `giftDailyStatement`) e execute com `runLedger`.
 *   Nunca escreva em `wallets` ou em `wallet_ledger` por outro caminho.
 * - Saldo nunca fica negativo: o CHECK de `wallets` faz o débito maior que o saldo falhar e desfaz
 *   o `batch` inteiro (inclusive o que mais estiver nele: a entrega do item, a extensão do Plus).
 * - `reference` é única no banco: o mesmo fato lançado duas vezes falha e desfaz o `batch`
 *   (idempotência de webhook, de crédito mensal e de boas-vindas).
 * - Outras instruções da mesma operação (marcar pagamento, gravar item, estender o Plus) entram no
 *   mesmo `batch`, para valerem ou falharem juntas.
 */

export interface Movement {
  userId: string;
  currency: Currency;
  /** Sempre positivo; quem diz se entra ou sai é a função chamada. */
  amount: number;
  reason: LedgerReason;
  /** Única no banco. Ex.: `welcome:<conta>`, `gold-purchase:<id>`, `gift:<id>:out`. */
  reference: string;
  counterpartUserId?: string | null;
  itemId?: string | null;
  now: number;
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("valor de movimento inválido");
}

function column(currency: Currency): "silver" | "gold" {
  // Nunca interpolar valor vindo de fora: só estes dois nomes de coluna.
  return currency === "gold" ? "gold" : "silver";
}

function ensureWallet(env: AppEnv, userId: string, now: number): D1PreparedStatement {
  return env.DB.prepare(
    "INSERT OR IGNORE INTO wallets (user_id, silver, gold, updated_at) VALUES (?1, 0, 0, ?2)",
  ).bind(userId, now);
}

function ledgerLine(env: AppEnv, movement: Movement, signedAmount: number): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO wallet_ledger (id, user_id, currency, amount, reason, reference, counterpart_user_id, item_id,
       created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(
    crypto.randomUUID(),
    movement.userId,
    movement.currency,
    signedAmount,
    movement.reason,
    movement.reference,
    movement.counterpartUserId ?? null,
    movement.itemId ?? null,
    movement.now,
  );
}

function changeBalance(env: AppEnv, movement: Movement, signedAmount: number): D1PreparedStatement {
  const col = column(movement.currency);
  return env.DB.prepare(`UPDATE wallets SET ${col} = ${col} + ?2, updated_at = ?3 WHERE user_id = ?1`).bind(
    movement.userId,
    signedAmount,
    movement.now,
  );
}

/** Instruções de um crédito: garante a carteira, lança a linha e soma ao saldo. */
export function creditStatements(env: AppEnv, movement: Movement): D1PreparedStatement[] {
  assertAmount(movement.amount);
  return [
    ensureWallet(env, movement.userId, movement.now),
    ledgerLine(env, movement, movement.amount),
    changeBalance(env, movement, movement.amount),
  ];
}

/** Instruções de um débito. Saldo insuficiente faz o `batch` falhar (`insufficient_funds`). */
export function debitStatements(env: AppEnv, movement: Movement): D1PreparedStatement[] {
  assertAmount(movement.amount);
  return [
    ensureWallet(env, movement.userId, movement.now),
    ledgerLine(env, movement, -movement.amount),
    changeBalance(env, movement, -movement.amount),
  ];
}

/** Dia de calendário em Brasília (AAAA-MM-DD) do instante dado. */
export function walletDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WALLET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Soma ao ouro enviado hoje. Passar do limite diário faz o `batch` falhar (`daily_limit`). */
export function giftDailyStatement(
  env: AppEnv,
  userId: string,
  amount: number,
  now: number,
): D1PreparedStatement {
  assertAmount(amount);
  return env.DB.prepare(
    `INSERT INTO gold_gift_daily (user_id, day, sent) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id, day) DO UPDATE SET sent = sent + excluded.sent`,
  ).bind(userId, walletDay(now), amount);
}

export type LedgerOutcome = "ok" | "insufficient_funds" | "daily_limit" | "duplicate";

/** Motivo de uma falha de `batch` causada pelas travas da carteira, ou `null` se é outro erro. */
export function ledgerFailure(error: unknown): Exclude<LedgerOutcome, "ok"> | null {
  let text = "";
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      text += ` ${current.message}`;
      current = current.cause;
    } else {
      text += ` ${String(current)}`;
      break;
    }
  }
  if (text.includes("wallets_non_negative")) return "insufficient_funds";
  if (text.includes("gold_gift_daily_limit")) return "daily_limit";
  if (text.includes("wallet_ledger.reference")) return "duplicate";
  return null;
}

/**
 * Executa o `batch` de uma operação da carteira. Devolve o motivo quando uma trava da carteira o
 * desfez (nada foi gravado); qualquer outro erro é lançado.
 */
export async function runLedger(env: AppEnv, statements: D1PreparedStatement[]): Promise<LedgerOutcome> {
  try {
    await env.DB.batch(statements);
    return "ok";
  } catch (error) {
    const failure = ledgerFailure(error);
    if (failure) return failure;
    throw error;
  }
}

/** Instruções da prata de boas-vindas (referência `welcome:<conta>`: uma vez por conta). */
export function welcomeStatements(env: AppEnv, userId: string, now: number): D1PreparedStatement[] {
  return creditStatements(env, {
    userId,
    currency: "silver",
    amount: WELCOME_SILVER,
    reason: "welcome",
    reference: `welcome:${userId}`,
    now,
  });
}

export interface GoldTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
  now: number;
}

/**
 * Envia ouro de uma conta a outra: limite diário de quem envia, débito e crédito, tudo junto.
 * Quem chama confere antes que as duas contas existem, concluíram o primeiro acesso e são
 * diferentes (aqui a mesma conta é recusada por segurança).
 */
export async function transferGold(
  env: AppEnv,
  { fromUserId, toUserId, amount, now }: GoldTransfer,
): Promise<LedgerOutcome> {
  if (fromUserId === toUserId) throw new Error("envio de ouro para a própria conta");
  const giftId = crypto.randomUUID();
  return runLedger(env, [
    giftDailyStatement(env, fromUserId, amount, now),
    ...debitStatements(env, {
      userId: fromUserId,
      currency: "gold",
      amount,
      reason: "gift_sent",
      reference: `gift:${giftId}:out`,
      counterpartUserId: toUserId,
      now,
    }),
    ...creditStatements(env, {
      userId: toUserId,
      currency: "gold",
      amount,
      reason: "gift_received",
      reference: `gift:${giftId}:in`,
      counterpartUserId: fromUserId,
      now,
    }),
  ]);
}

/** Saldos e o ouro enviado hoje, como `GET /api/wallet` responde. */
export async function getWallet(env: AppEnv, userId: string, now: number): Promise<WalletResponse> {
  const [wallet, sent] = await env.DB.batch<{ silver?: number; gold?: number; sent?: number }>([
    env.DB.prepare("SELECT silver, gold FROM wallets WHERE user_id = ?1").bind(userId),
    env.DB.prepare("SELECT sent FROM gold_gift_daily WHERE user_id = ?1 AND day = ?2").bind(
      userId,
      walletDay(now),
    ),
  ]);
  return {
    silver: wallet?.results[0]?.silver ?? 0,
    gold: wallet?.results[0]?.gold ?? 0,
    goldSentToday: sent?.results[0]?.sent ?? 0,
    goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
  };
}
