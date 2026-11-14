import { GOLD_GIFT_DAILY_LIMIT, WALLET_LEDGER_PAGE_SIZE, WELCOME_SILVER } from "@sualive/config";
import { ledgerResponseSchema, walletResponseSchema, type LedgerEntry } from "@sualive/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findOrCreateUser } from "../src/account/users";
import { debitStatements, runLedger, transferGold } from "../src/wallet/ledger";
import { createTestUser, uniqueHandle } from "./account";
import { useD1 } from "./d1";
import { expectConsistent, grant, ledgerRows, walletEnv, walletPost, walletRequest } from "./wallet-helpers";

useD1();

afterEach(() => {
  vi.restoreAllMocks();
});

async function walletOf(response: Response) {
  expect(response.status, await response.clone().text()).toBe(200);
  return walletResponseSchema.parse(await response.json());
}

async function errorOf(response: Response) {
  return { status: response.status, ...((await response.json()) as { error: string }) };
}

describe("acesso às rotas da carteira", () => {
  const routes: [string, string, unknown?][] = [
    ["GET", ""],
    ["GET", "/ledger"],
    ["POST", "/gold/checkout", { packId: "gold_990", taxId: "52998224725" }],
    ["GET", "/gold/payments/x"],
    ["POST", "/gifts/gold", { to: "alguem", amount: 10 }],
    ["POST", "/gifts/plus", { to: "alguem" }],
  ];

  it("sem sessão: 401", async () => {
    for (const [method, path, body] of routes) {
      const response = await walletRequest(null, path, { method, body });
      expect(await errorOf(response), `${method} ${path}`).toEqual({ status: 401, error: "unauthorized" });
    }
  });

  it("sem primeiro acesso: 403", async () => {
    const user = await createTestUser({ onboarded: false });
    for (const [method, path, body] of routes) {
      const response = await walletRequest(user, path, { method, body });
      expect(await errorOf(response), `${method} ${path}`).toEqual({
        status: 403,
        error: "onboarding_required",
      });
    }
  });

  it("de outra origem: recusa as que mudam estado e não move nada", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 500);
    for (const [method, path, body] of routes.filter(([method]) => method === "POST")) {
      const response = await walletRequest(sender, path, { method, body, origin: "https://outro.site" });
      expect(response.status, `${method} ${path}`).toBe(400);
    }
    const response = await walletPost(
      sender,
      "/gifts/gold",
      { to: recipient.handle, amount: 100 },
      { origin: null },
    );
    expect(response.status).toBe(400);
    expect((await expectConsistent(sender.userId)).gold).toBe(500);
    expect((await expectConsistent(recipient.userId)).gold).toBe(0);
  });
});

describe("saldo", () => {
  it("conta sem movimento: zero, com o limite diário", async () => {
    const user = await createTestUser();
    expect(await walletOf(await walletRequest(user, ""))).toEqual({
      silver: 0,
      gold: 0,
      goldSentToday: 0,
      goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
    });
  });

  it("mostra prata e ouro do banco", async () => {
    const user = await createTestUser();
    await grant(user.userId, 120, { currency: "silver", reason: "welcome" });
    await grant(user.userId, 990);
    expect(await walletOf(await walletRequest(user, ""))).toMatchObject({ silver: 120, gold: 990 });
    await expectConsistent(user.userId);
  });
});

describe("prata de boas-vindas", () => {
  it("conta nova recebe uma vez; o login seguinte não credita de novo", async () => {
    const profile = {
      providerUserId: `g-${crypto.randomUUID()}`,
      names: ["Ana"],
      avatarUrl: null,
      email: null,
    };
    const created = await findOrCreateUser(walletEnv, "google", profile);
    const again = await findOrCreateUser(walletEnv, "google", profile);
    expect(again.id).toBe(created.id);
    const wallet = await expectConsistent(created.id);
    expect(wallet).toMatchObject({ silver: WELCOME_SILVER, gold: 0 });
    expect(await ledgerRows(created.id)).toEqual([
      {
        currency: "silver",
        amount: WELCOME_SILVER,
        reason: "welcome",
        reference: `welcome:${created.id}`,
        counterpartUserId: null,
      },
    ]);
  });

  it("dois retornos simultâneos do mesmo login novo: uma conta e uma prata", async () => {
    const profile = {
      providerUserId: `g-${crypto.randomUUID()}`,
      names: ["Bia"],
      avatarUrl: null,
      email: null,
    };
    const [a, b] = await Promise.all([
      findOrCreateUser(walletEnv, "google", profile),
      findOrCreateUser(walletEnv, "google", profile),
    ]);
    expect(a.id).toBe(b.id);
    expect((await expectConsistent(a.id)).silver).toBe(WELCOME_SILVER);
    expect(await ledgerRows(a.id)).toHaveLength(1);
  });
});

describe("extrato", () => {
  async function page(user: Awaited<ReturnType<typeof createTestUser>>, before?: string) {
    const response = await walletRequest(
      user,
      before ? `/ledger?before=${encodeURIComponent(before)}` : "/ledger",
    );
    expect(response.status, await response.clone().text()).toBe(200);
    return ledgerResponseSchema.parse(await response.json());
  }

  it("pagina do mais recente ao mais antigo, com cursor estável e sem repetir linhas", async () => {
    const user = await createTestUser();
    const base = Date.now() - 1_000_000;
    const total = WALLET_LEDGER_PAGE_SIZE + 7;
    for (let i = 0; i < total; i++) {
      // Pares de linhas no mesmo instante: o desempate é pelo id.
      await grant(user.userId, i + 1, { now: base + Math.floor(i / 2) * 1000 });
    }
    const first = await page(user);
    expect(first.entries).toHaveLength(WALLET_LEDGER_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await page(user, first.nextCursor!);
    expect(second.entries).toHaveLength(total - WALLET_LEDGER_PAGE_SIZE);
    expect(second.nextCursor).toBeNull();

    const all: LedgerEntry[] = [...first.entries, ...second.entries];
    expect(new Set(all.map((entry) => entry.id)).size).toBe(total);
    for (let i = 1; i < all.length; i++) {
      const [prev, cur] = [all[i - 1]!, all[i]!];
      expect(prev.createdAt > cur.createdAt || (prev.createdAt === cur.createdAt && prev.id > cur.id)).toBe(
        true,
      );
    }
    expect(all.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, i) => i + 1),
    );
    await expectConsistent(user.userId);
  });

  it("cursor inválido: 400", async () => {
    const user = await createTestUser();
    expect((await walletRequest(user, "/ledger?before=%%%")).status).toBe(400);
    expect((await walletRequest(user, `/ledger?before=${btoa("abc")}`)).status).toBe(400);
  });

  it("mostra só as linhas da própria conta", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await grant(other.userId, 50);
    expect((await page(user)).entries).toEqual([]);
  });

  it("contraparte pelo @nome (nula se a conta foi excluída) e nome do item da loja", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 300, { currency: "silver", reason: "welcome" });
    await grant(sender.userId, 1000, { now: Date.now() - 10_000 });
    expect(
      await transferGold(walletEnv, {
        fromUserId: sender.userId,
        toUserId: recipient.userId,
        amount: 200,
        now: Date.now(),
      }),
    ).toBe("ok");
    expect(
      await runLedger(
        walletEnv,
        debitStatements(walletEnv, {
          userId: sender.userId,
          currency: "silver",
          amount: 100,
          reason: "shop_purchase",
          reference: `shop:${crypto.randomUUID()}`,
          itemId: "color_red",
          now: Date.now() + 1,
        }),
      ),
    ).toBe("ok");

    const before = await page(sender);
    expect(before.entries.find((entry) => entry.reason === "gift_sent")).toMatchObject({
      amount: -200,
      currency: "gold",
      counterpartHandle: recipient.handle,
      itemName: null,
    });
    expect(before.entries.find((entry) => entry.reason === "shop_purchase")).toMatchObject({
      amount: -100,
      currency: "silver",
      itemName: "Vermelho",
      counterpartHandle: null,
    });
    expect((await page(recipient)).entries[0]).toMatchObject({
      reason: "gift_received",
      amount: 200,
      counterpartHandle: sender.handle,
    });

    await walletEnv.DB.prepare("DELETE FROM users WHERE id = ?1").bind(recipient.userId).run();
    const after = await page(sender);
    expect(after.entries.find((entry) => entry.reason === "gift_sent")).toMatchObject({
      amount: -200,
      counterpartHandle: null,
    });
    await expectConsistent(sender.userId);
  });
});

describe("enviar ouro", () => {
  it("move o ouro, responde a carteira de quem enviou e lança as duas linhas", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 1000);
    const wallet = await walletOf(
      await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 300 }),
    );
    expect(wallet).toMatchObject({ gold: 700, goldSentToday: 300 });
    expect((await expectConsistent(recipient.userId)).gold).toBe(300);
    await expectConsistent(sender.userId);
    const [line] = (await ledgerRows(recipient.userId)).filter((row) => row.reason === "gift_received");
    expect(line).toMatchObject({ amount: 300, counterpartUserId: sender.userId });
  });

  it("saldo insuficiente: 409 e nada muda", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 100);
    expect(
      await errorOf(await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 101 })),
    ).toEqual({
      status: 409,
      error: "insufficient_funds",
    });
    expect(await expectConsistent(sender.userId)).toMatchObject({ gold: 100, goldSentToday: 0 });
    expect((await expectConsistent(recipient.userId)).gold).toBe(0);
  });

  it("limite de 2.000 por dia: o envio que passaria é recusado", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 5000);
    await walletOf(await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 1500 }));
    expect(
      await errorOf(await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 501 })),
    ).toEqual({
      status: 409,
      error: "daily_limit",
    });
    const wallet = await walletOf(
      await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 500 }),
    );
    expect(wallet).toMatchObject({ gold: 3000, goldSentToday: GOLD_GIFT_DAILY_LIMIT });
    expect((await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 1 })).status).toBe(409);
    expect((await expectConsistent(recipient.userId)).gold).toBe(2000);
    await expectConsistent(sender.userId);
  });

  it("valor acima do limite ou inválido: 400", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 5000);
    for (const amount of [0, -5, 1.5, GOLD_GIFT_DAILY_LIMIT + 1, "10"]) {
      expect((await walletPost(sender, "/gifts/gold", { to: recipient.handle, amount })).status).toBe(400);
    }
    expect((await expectConsistent(sender.userId)).gold).toBe(5000);
  });

  it("para a própria conta: recusado", async () => {
    const sender = await createTestUser();
    await grant(sender.userId, 500);
    expect(await errorOf(await walletPost(sender, "/gifts/gold", { to: sender.handle, amount: 10 }))).toEqual(
      {
        status: 400,
        error: "self_gift",
      },
    );
    expect((await expectConsistent(sender.userId)).gold).toBe(500);
  });

  it("@nome inexistente ou conta sem primeiro acesso: 404", async () => {
    const sender = await createTestUser();
    const pending = await createTestUser({ onboarded: false, handle: uniqueHandle("p") });
    await grant(sender.userId, 500);
    for (const to of [uniqueHandle("nada"), pending.handle]) {
      expect(await errorOf(await walletPost(sender, "/gifts/gold", { to, amount: 10 }))).toEqual({
        status: 404,
        error: "recipient_not_found",
      });
    }
    expect((await expectConsistent(sender.userId)).gold).toBe(500);
    expect((await expectConsistent(pending.userId)).gold).toBe(0);
  });

  it("dois envios simultâneos que juntos passam do saldo: um falha e o saldo não fica negativo", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 1000);
    const responses = await Promise.all([
      walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 700 }),
      walletPost(sender, "/gifts/gold", { to: recipient.handle, amount: 700 }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await expectConsistent(sender.userId)).gold).toBe(300);
    expect((await expectConsistent(recipient.userId)).gold).toBe(700);
  });

  it("não existe rota para enviar prata", async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await grant(sender.userId, 300, { currency: "silver", reason: "welcome" });
    const response = await walletPost(sender, "/gifts/silver", { to: recipient.handle, amount: 10 });
    expect(response.status).toBe(404);
    const extra = await walletPost(sender, "/gifts/gold", {
      to: recipient.handle,
      amount: 10,
      currency: "silver",
    });
    expect(extra.status).toBe(409); // ignora o campo extra: é ouro, e não há ouro
    expect((await expectConsistent(sender.userId)).silver).toBe(300);
    expect((await expectConsistent(recipient.userId)).silver).toBe(0);
  });
});
