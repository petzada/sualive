import { env as workerEnv } from "cloudflare:workers";
import { expect } from "vitest";
import type { AppEnv } from "../src/env";
import { creditStatements, getWallet, runLedger, type Movement } from "../src/wallet/ledger";
import { accountRequest, type AccountRequestInit, type TestUser } from "./account";
import { WOOVI_SECRETS } from "./billing-helpers";

/** Ajudantes de teste da carteira (entrega 3). A Woovi é sempre simulada (billing-helpers). */

export const walletEnv = workerEnv as unknown as AppEnv;

/** Credita moeda direto no livro-razão (só para preparar cenários de teste). */
export async function grant(
  userId: string,
  amount: number,
  overrides: Partial<Movement> = {},
): Promise<void> {
  const outcome = await runLedger(
    walletEnv,
    creditStatements(walletEnv, {
      userId,
      currency: "gold",
      amount,
      reason: "gold_purchase",
      reference: `test-grant:${crypto.randomUUID()}`,
      now: Date.now(),
      ...overrides,
    }),
  );
  expect(outcome).toBe("ok");
}

/** A soma do livro-razão de cada moeda da conta. */
export async function ledgerSum(userId: string) {
  const { results } = await walletEnv.DB.prepare(
    "SELECT currency, SUM(amount) AS total FROM wallet_ledger WHERE user_id = ?1 GROUP BY currency",
  )
    .bind(userId)
    .all<{ currency: string; total: number }>();
  const sum = { silver: 0, gold: 0 };
  for (const row of results) sum[row.currency as "silver" | "gold"] = row.total;
  return sum;
}

/** Confere que o saldo bate com a soma do livro-razão; devolve a carteira. */
export async function expectConsistent(userId: string) {
  const wallet = await getWallet(walletEnv, userId, Date.now());
  expect({ silver: wallet.silver, gold: wallet.gold }).toEqual(await ledgerSum(userId));
  return wallet;
}

/** Linhas do livro-razão da conta, mais antigas primeiro. */
export async function ledgerRows(userId: string) {
  const { results } = await walletEnv.DB.prepare(
    `SELECT currency, amount, reason, reference, counterpart_user_id AS counterpartUserId
     FROM wallet_ledger WHERE user_id = ?1 ORDER BY created_at, id`,
  )
    .bind(userId)
    .all<{
      currency: string;
      amount: number;
      reason: string;
      reference: string;
      counterpartUserId: string | null;
    }>();
  return results;
}

/** Chamada à API da carteira como o navegador da conta (mesma origem, Woovi ligada). */
export function walletRequest(user: TestUser | null, path: string, init: AccountRequestInit = {}) {
  return accountRequest(`/api/wallet${path}`, {
    ...init,
    cookie: user?.cookie,
    env: { ...WOOVI_SECRETS, ...init.env },
  });
}

export function walletPost(
  user: TestUser | null,
  path: string,
  body: unknown,
  init: AccountRequestInit = {},
) {
  return walletRequest(user, path, { ...init, method: "POST", body });
}
