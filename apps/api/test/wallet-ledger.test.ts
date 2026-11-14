import { GOLD_GIFT_DAILY_LIMIT, WELCOME_SILVER } from "@sualive/config";
import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import {
  creditStatements,
  debitStatements,
  getWallet,
  runLedger,
  transferGold,
  walletDay,
  welcomeStatements,
  type Movement,
} from "../src/wallet/ledger";
import { createTestUser } from "./account";
import { useD1 } from "./d1";

useD1();

const env = workerEnv as unknown as AppEnv;
const NOW = Date.UTC(2026, 10, 20, 15, 0, 0);

let seq = 0;
function gold(userId: string, amount: number, overrides: Partial<Movement> = {}): Movement {
  seq += 1;
  return {
    userId,
    currency: "gold",
    amount,
    reason: "gold_purchase",
    reference: `test:${seq}:${crypto.randomUUID()}`,
    now: NOW,
    ...overrides,
  };
}

/** A soma do livro-razão de cada moeda, para comparar com o saldo. */
async function ledgerSum(userId: string) {
  const { results } = await env.DB.prepare(
    "SELECT currency, SUM(amount) AS total FROM wallet_ledger WHERE user_id = ?1 GROUP BY currency",
  )
    .bind(userId)
    .all<{ currency: string; total: number }>();
  const sum = { silver: 0, gold: 0 };
  for (const row of results) sum[row.currency as "silver" | "gold"] = row.total;
  return sum;
}

async function expectConsistent(userId: string) {
  const wallet = await getWallet(env, userId, NOW);
  expect({ silver: wallet.silver, gold: wallet.gold }).toEqual(await ledgerSum(userId));
  return wallet;
}

describe("livro-razão da carteira", () => {
  it("conta sem movimento tem saldo zero", async () => {
    const user = await createTestUser();
    expect(await getWallet(env, user.userId, NOW)).toEqual({
      silver: 0,
      gold: 0,
      goldSentToday: 0,
      goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
    });
  });

  it("crédito e débito mudam saldo e livro-razão juntos", async () => {
    const user = await createTestUser();
    expect(await runLedger(env, creditStatements(env, gold(user.userId, 500)))).toBe("ok");
    expect(
      await runLedger(env, debitStatements(env, gold(user.userId, 120, { reason: "shop_purchase" }))),
    ).toBe("ok");
    const wallet = await expectConsistent(user.userId);
    expect(wallet.gold).toBe(380);
  });

  it("débito maior que o saldo falha e não grava nada", async () => {
    const user = await createTestUser();
    await runLedger(env, creditStatements(env, gold(user.userId, 100)));
    const marker = env.DB.prepare("UPDATE users SET nickname = 'Mudou' WHERE id = ?1").bind(user.userId);
    expect(await runLedger(env, [...debitStatements(env, gold(user.userId, 101)), marker])).toBe(
      "insufficient_funds",
    );
    expect((await expectConsistent(user.userId)).gold).toBe(100);
    // O resto do batch também foi desfeito.
    const row = await env.DB.prepare("SELECT nickname FROM users WHERE id = ?1").bind(user.userId).first();
    expect(row?.nickname).not.toBe("Mudou");
  });

  it("débito sem carteira falha como saldo insuficiente", async () => {
    const user = await createTestUser();
    expect(await runLedger(env, debitStatements(env, gold(user.userId, 1)))).toBe("insufficient_funds");
    expect(await ledgerSum(user.userId)).toEqual({ silver: 0, gold: 0 });
  });

  it("dois gastos simultâneos que juntos passam do saldo: um falha e o saldo não fica negativo", async () => {
    const user = await createTestUser();
    await runLedger(env, creditStatements(env, gold(user.userId, 100)));
    const outcomes = await Promise.all([
      runLedger(env, debitStatements(env, gold(user.userId, 70))),
      runLedger(env, debitStatements(env, gold(user.userId, 70))),
    ]);
    expect(outcomes.sort()).toEqual(["insufficient_funds", "ok"]);
    expect((await expectConsistent(user.userId)).gold).toBe(30);
  });

  it("a mesma referência não é lançada duas vezes", async () => {
    const user = await createTestUser();
    const movement = gold(user.userId, 990, { reference: `gold-purchase:${crypto.randomUUID()}` });
    expect(await runLedger(env, creditStatements(env, movement))).toBe("ok");
    expect(await runLedger(env, creditStatements(env, movement))).toBe("duplicate");
    expect((await expectConsistent(user.userId)).gold).toBe(990);
  });

  it("prata de boas-vindas entra uma vez só", async () => {
    const user = await createTestUser();
    expect(await runLedger(env, welcomeStatements(env, user.userId, NOW))).toBe("ok");
    expect(await runLedger(env, welcomeStatements(env, user.userId, NOW))).toBe("duplicate");
    expect((await expectConsistent(user.userId)).silver).toBe(WELCOME_SILVER);
  });

  it("valor zero, negativo ou fracionário é recusado antes de chegar ao banco", async () => {
    const user = await createTestUser();
    for (const amount of [0, -5, 1.5, Number.NaN]) {
      expect(() => creditStatements(env, gold(user.userId, amount))).toThrow();
      expect(() => debitStatements(env, gold(user.userId, amount))).toThrow();
    }
  });
});

describe("envio de ouro", () => {
  async function pair(balance: number) {
    const [from, to] = await Promise.all([createTestUser(), createTestUser()]);
    await runLedger(env, creditStatements(env, gold(from.userId, balance)));
    return { from: from.userId, to: to.userId };
  }

  it("debita de quem envia, credita a quem recebe e conta no limite do dia", async () => {
    const { from, to } = await pair(1000);
    expect(await transferGold(env, { fromUserId: from, toUserId: to, amount: 300, now: NOW })).toBe("ok");
    const sender = await expectConsistent(from);
    expect(sender.gold).toBe(700);
    expect(sender.goldSentToday).toBe(300);
    expect((await expectConsistent(to)).gold).toBe(300);
    const lines = await env.DB.prepare(
      "SELECT user_id, amount, reason, counterpart_user_id FROM wallet_ledger WHERE reason LIKE 'gift_%' AND user_id IN (?1, ?2) ORDER BY amount",
    )
      .bind(from, to)
      .all();
    expect(lines.results).toEqual([
      { user_id: from, amount: -300, reason: "gift_sent", counterpart_user_id: to },
      { user_id: to, amount: 300, reason: "gift_received", counterpart_user_id: from },
    ]);
  });

  it("sem saldo, nada muda e o limite do dia não é consumido", async () => {
    const { from, to } = await pair(50);
    expect(await transferGold(env, { fromUserId: from, toUserId: to, amount: 51, now: NOW })).toBe(
      "insufficient_funds",
    );
    expect(await getWallet(env, from, NOW)).toMatchObject({ gold: 50, goldSentToday: 0 });
    expect((await getWallet(env, to, NOW)).gold).toBe(0);
  });

  it("o envio que passaria do limite diário é recusado; no dia seguinte o limite zera", async () => {
    const { from, to } = await pair(GOLD_GIFT_DAILY_LIMIT * 3);
    const send = (amount: number, now = NOW) =>
      transferGold(env, { fromUserId: from, toUserId: to, amount, now });
    expect(await send(GOLD_GIFT_DAILY_LIMIT - 1)).toBe("ok");
    expect(await send(2)).toBe("daily_limit");
    expect(await send(1)).toBe("ok");
    expect(await send(1)).toBe("daily_limit");
    expect((await expectConsistent(from)).gold).toBe(GOLD_GIFT_DAILY_LIMIT * 2);
    expect((await expectConsistent(to)).gold).toBe(GOLD_GIFT_DAILY_LIMIT);

    const tomorrow = NOW + 24 * 60 * 60 * 1000;
    expect(await send(GOLD_GIFT_DAILY_LIMIT, tomorrow)).toBe("ok");
    expect((await getWallet(env, from, tomorrow)).goldSentToday).toBe(GOLD_GIFT_DAILY_LIMIT);
  });

  it("o dia do limite é o de Brasília", () => {
    // 02:30 UTC do dia 21 ainda é dia 20 em Brasília (UTC-3).
    expect(walletDay(Date.UTC(2026, 10, 21, 2, 30))).toBe("2026-11-20");
    expect(walletDay(Date.UTC(2026, 10, 21, 3, 0))).toBe("2026-11-21");
  });

  it("envio para a própria conta é recusado", async () => {
    const { from } = await pair(100);
    await expect(
      transferGold(env, { fromUserId: from, toUserId: from, amount: 10, now: NOW }),
    ).rejects.toThrow();
  });

  it("excluir a conta apaga carteira e extrato, e a outra ponta fica sem a referência", async () => {
    const { from, to } = await pair(100);
    await transferGold(env, { fromUserId: from, toUserId: to, amount: 40, now: NOW });
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(from).run();
    expect(await ledgerSum(from)).toEqual({ silver: 0, gold: 0 });
    const line = await env.DB.prepare(
      "SELECT amount, counterpart_user_id FROM wallet_ledger WHERE user_id = ?1",
    )
      .bind(to)
      .first();
    expect(line).toEqual({ amount: 40, counterpart_user_id: null });
    expect((await expectConsistent(to)).gold).toBe(40);
  });
});

describe("catálogo inicial da loja", () => {
  it("tem 8 cores, 6 degradês, 6 molduras e 3 pacotes com os preços da entrega 4 (migration 0006)", async () => {
    const { results } = await env.DB.prepare(
      "SELECT kind, COUNT(*) AS items, MIN(price) AS low, MAX(price) AS high FROM shop_items WHERE active = 1 GROUP BY kind ORDER BY kind",
    ).all();
    expect(results).toEqual([
      { kind: "avatar_frame", items: 6, low: 200, high: 400 },
      { kind: "name_color", items: 8, low: 70, high: 70 },
      { kind: "name_gradient", items: 6, low: 200, high: 200 },
      { kind: "reaction_pack", items: 3, low: 280, high: 280 },
    ]);
  });
});
