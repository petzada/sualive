import type { Currency } from "@sualive/config";
import { apiErrorSchema } from "@sualive/protocol";
import { env as workerEnv } from "cloudflare:workers";
import { expect } from "vitest";
import type { AppEnv } from "../src/env";
import { creditStatements, getWallet, runLedger } from "../src/wallet/ledger";
import { accountRequest, type AccountRequestInit } from "./account";

/** Ajudantes de teste da loja e do envio de ouro pela sala. */

export const env = workerEnv as unknown as AppEnv;

/** Dá saldo a uma conta pelo livro-razão (como um pacote de ouro confirmado faria). */
export async function giveBalance(userId: string, currency: Currency, amount: number): Promise<void> {
  const outcome = await runLedger(
    env,
    creditStatements(env, {
      userId,
      currency,
      amount,
      reason: currency === "gold" ? "gold_purchase" : "welcome",
      reference: `test-credit:${crypto.randomUUID()}`,
      now: Date.now(),
    }),
  );
  expect(outcome).toBe("ok");
}

/** A soma do livro-razão de cada moeda. */
export async function ledgerSum(userId: string): Promise<{ silver: number; gold: number }> {
  const { results } = await env.DB.prepare(
    "SELECT currency, SUM(amount) AS total FROM wallet_ledger WHERE user_id = ?1 GROUP BY currency",
  )
    .bind(userId)
    .all<{ currency: string; total: number }>();
  const sum = { silver: 0, gold: 0 };
  for (const row of results) sum[row.currency as Currency] = row.total;
  return sum;
}

/** Confere que o saldo bate com o livro-razão e devolve o saldo. */
export async function expectConsistent(userId: string): Promise<{ silver: number; gold: number }> {
  const wallet = await getWallet(env, userId, Date.now());
  const balance = { silver: wallet.silver, gold: wallet.gold };
  expect(balance).toEqual(await ledgerSum(userId));
  return balance;
}

export interface LedgerRow {
  currency: string;
  amount: number;
  reason: string;
  reference: string;
  item_id: string | null;
  counterpart_user_id: string | null;
}

export async function ledgerRows(userId: string, reason?: string): Promise<LedgerRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT currency, amount, reason, reference, item_id, counterpart_user_id FROM wallet_ledger
     WHERE user_id = ?1 AND (?2 IS NULL OR reason = ?2) ORDER BY created_at, id`,
  )
    .bind(userId, reason ?? null)
    .all<LedgerRow>();
  return results;
}

/** Linhas de `user_items` da conta. */
export async function ownedItems(userId: string): Promise<{ item_id: string; equipped: number }[]> {
  const { results } = await env.DB.prepare(
    "SELECT item_id, equipped FROM user_items WHERE user_id = ?1 ORDER BY item_id",
  )
    .bind(userId)
    .all<{ item_id: string; equipped: number }>();
  return results;
}

/** Chamada à loja com a sessão da conta. */
export function shopRequest(
  path: string,
  cookie: string | undefined,
  init: Omit<AccountRequestInit, "cookie"> = {},
): Promise<Response> {
  return accountRequest(`/api/shop${path}`, { ...init, cookie });
}

export function buy(cookie: string, itemId: string, body: unknown = { currency: "silver" }) {
  return shopRequest(`/items/${itemId}/buy`, cookie, { method: "POST", body });
}

export function equip(cookie: string, itemId: string, equipped = true) {
  return shopRequest(`/items/${itemId}/equip`, cookie, { method: "POST", body: { equipped } });
}

export async function errorOf(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error;
}

/** Compra e equipa direto no banco (para testes da sala que não testam a loja). */
export async function grantItem(userId: string, itemId: string, equipped = true): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO user_items (user_id, item_id, equipped, acquired_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(userId, itemId, equipped ? 1 : 0, Date.now())
    .run();
}
