import { GOLD_PACKS } from "@sualive/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_POLL_BASE_DELAY_MS, PAYMENT_POLL_MAX_DELAY_MS } from "../account/watch-payment";
import { WalletStore } from "./store";
import {
  createWalletHarness,
  FakeAccount,
  ledgerEntry,
  meUser,
  shopItem,
  walletBody,
  type WalletHarness,
} from "./testing/fakes";
import type { PaymentStatus, WalletErrorReason } from "./types";

const flush = () => vi.advanceTimersByTimeAsync(0);

const TAX_ID = "12345678909";

let h: WalletHarness;
let store: WalletStore;

const state = () => store.getSnapshot();

function create(account?: FakeAccount): WalletStore {
  h = createWalletHarness(account);
  store = new WalletStore(h.deps);
  store.subscribe(() => undefined);
  return store;
}

/** Resposta que só sai quando o teste manda. */
function deferred(method: string, path: string) {
  const answers: Array<(reply: { status: number; body?: unknown }) => void> = [];
  h.server.on(method, path, () => new Promise((resolve) => answers.push(resolve)));
  return answers;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  store?.dispose();
  vi.useRealTimers();
});

describe("carregamento", () => {
  it("nada é pedido antes de uma tela pedir", async () => {
    create();
    await flush();
    expect(h.server.calls).toHaveLength(0);
    expect(state()).toMatchObject({ status: "idle", wallet: null, goldPacks: GOLD_PACKS });
    expect(state().ledger.status).toBe("idle");
    expect(state().shop.status).toBe("idle");
  });

  it("load traz os saldos", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    const loading = store.actions.load();
    expect(state().status).toBe("loading");
    await loading;
    expect(state()).toMatchObject({ status: "ready", wallet: walletBody() });
    expect(h.server.calls[0]?.init?.credentials).toBe("same-origin");
  });

  it("falha na primeira carga vira error e relata sem dado pessoal; com dado na mão, segue com ele", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 500, body: { error: "internal_error" } });
    await store.actions.load();
    expect(state().status).toBe("error");
    expect(h.reports).toEqual([
      { message: "wallet: request failed", extra: { route: "wallet", error: "internal_error" } },
    ]);

    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    await store.actions.load();
    expect(state().status).toBe("ready");

    h.server.offline = true;
    await store.actions.load();
    expect(state()).toMatchObject({ status: "ready", wallet: walletBody() });
  });

  it("resposta fora do esquema é relatada", async () => {
    create();
    h.server.on("GET", "/api/shop", { status: 200, body: { items: [{ id: "x" }] } });
    await store.actions.loadShop();
    expect(state().shop.status).toBe("error");
    expect(h.reports[0]?.extra).toEqual({ route: "shop", error: "invalid_response" });
  });

  it("sessão perdida consulta a conta de novo", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 401, body: { error: "unauthorized" } });
    await store.actions.load();
    expect(h.account.refreshes).toBe(1);
    expect(state().status).toBe("error");
  });

  it("loadShop traz o catálogo", async () => {
    create();
    h.server.on("GET", "/api/shop", { status: 200, body: { items: [shopItem()] } });
    await store.actions.loadShop();
    expect(state().shop).toEqual({ status: "ready", items: [shopItem()] });
  });

  it("refresh recarrega só o que já foi pedido", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    await store.actions.load();
    await store.actions.refresh();
    expect(h.server.callsTo("GET", "/api/wallet")).toHaveLength(2);
    expect(h.server.callsTo("GET", "/api/shop")).toHaveLength(0);
    expect(h.server.callsTo("GET", "/api/wallet/ledger")).toHaveLength(0);
  });
});

describe("extrato", () => {
  const page1 = [ledgerEntry({ id: "a" }), ledgerEntry({ id: "b" })];
  const page2 = [ledgerEntry({ id: "b" }), ledgerEntry({ id: "c" })];

  it("pagina com o cursor até acabar, sem repetir linhas", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", { status: 200, body: { entries: page1, nextCursor: "cur 1" } });
    h.server.on("GET", "/api/wallet/ledger?before=cur%201", {
      status: 200,
      body: { entries: page2, nextCursor: null },
    });
    await store.actions.loadLedger();
    expect(state().ledger).toEqual({ status: "ready", entries: page1, hasMore: true, loadingMore: false });

    const more = store.actions.loadMoreLedger();
    expect(state().ledger.loadingMore).toBe(true);
    // Pedir de novo com a página no ar não pede outra.
    void store.actions.loadMoreLedger();
    await more;
    expect(h.server.callsTo("GET", "/api/wallet/ledger?before=cur%201")).toHaveLength(1);
    expect(state().ledger.entries.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(state().ledger).toMatchObject({ hasMore: false, loadingMore: false });

    await store.actions.loadMoreLedger();
    expect(h.server.calls).toHaveLength(2);
  });

  it("falha na página seguinte mantém o que já veio", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", { status: 200, body: { entries: page1, nextCursor: "c1" } });
    await store.actions.loadLedger();
    h.server.offline = true;
    await store.actions.loadMoreLedger();
    expect(state().ledger).toEqual({ status: "ready", entries: page1, hasMore: true, loadingMore: false });
  });

  it("recarregar a primeira página descarta a página seguinte que estava no ar", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", { status: 200, body: { entries: page1, nextCursor: "c1" } });
    await store.actions.loadLedger();
    const answers = deferred("GET", "/api/wallet/ledger?before=c1");
    const more = store.actions.loadMoreLedger();
    await flush();
    await store.actions.loadLedger();
    answers[0]?.({ status: 200, body: { entries: page2, nextCursor: null } });
    await more;
    expect(state().ledger).toEqual({ status: "ready", entries: page1, hasMore: true, loadingMore: false });
  });
});

describe("respostas fora de ordem", () => {
  it("a resposta mais velha não sobrescreve a mais nova", async () => {
    create();
    const answers = deferred("GET", "/api/wallet");
    const first = store.actions.load();
    const second = store.actions.load();
    await flush();
    answers[1]?.({ status: 200, body: walletBody({ gold: 2 }) });
    answers[0]?.({ status: 200, body: walletBody({ gold: 1 }) });
    await Promise.all([first, second]);
    expect(state().wallet?.gold).toBe(2);
  });

  it("saldo trazido por uma ação vale sobre a consulta que já estava no ar", async () => {
    create();
    const answers = deferred("GET", "/api/wallet");
    const loading = store.actions.load();
    await flush();
    h.server.on("POST", "/api/wallet/gifts/gold", { status: 200, body: walletBody({ gold: 900 }) });
    await store.actions.sendGold({ to: "caio", amount: 100 });
    answers[0]?.({ status: 200, body: walletBody({ gold: 1000 }) });
    await loading;
    expect(state().wallet?.gold).toBe(900);
  });
});

describe("conta", () => {
  it("pedido feito com a conta carregando espera por ela", async () => {
    create(new FakeAccount(null, "loading"));
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    await store.actions.load();
    expect(state().status).toBe("loading");
    expect(h.server.calls).toHaveLength(0);

    h.account.set(meUser());
    await flush();
    expect(state().status).toBe("ready");
  });

  it("sem conta ou sem primeiro acesso não pede nada", async () => {
    create(new FakeAccount(null, "loading"));
    await store.actions.load();
    h.account.set(null);
    expect(state().status).toBe("idle");

    h.account.set(meUser({ onboarded: false, handle: null }));
    await store.actions.loadShop();
    await expect(store.actions.sendGold({ to: "caio", amount: 1 })).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
    expect(h.server.calls).toHaveLength(0);
    expect(state().shop.status).toBe("idle");
  });

  it("troca de conta zera o estado, descarta respostas no ar e recarrega o que foi pedido", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody({ gold: 1 }) });
    h.server.on("GET", "/api/shop", { status: 200, body: { items: [shopItem({ owned: true })] } });
    await store.actions.load();
    await store.actions.loadShop();

    const answers = deferred("GET", "/api/wallet");
    void store.actions.load();
    await flush();

    h.server.on("GET", "/api/shop", { status: 200, body: { items: [shopItem()] } });
    h.account.set(meUser({ id: "u2", handle: "bia" }));
    expect(state().wallet).toBeNull();
    expect(state().shop.items).toEqual([]);
    await flush();
    expect(state().shop.items).toEqual([shopItem()]);

    // A resposta velha (da conta anterior) e a nova chegam: só a da conta nova vale.
    answers[0]?.({ status: 200, body: walletBody({ gold: 1 }) });
    answers[1]?.({ status: 200, body: walletBody({ gold: 2 }) });
    await flush();
    expect(state().wallet?.gold).toBe(2);
  });

  it("sair da conta zera o estado e não pede nada", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    await store.actions.load();
    h.account.set(null);
    await flush();
    expect(state()).toMatchObject({ status: "idle", wallet: null });
    expect(h.server.callsTo("GET", "/api/wallet")).toHaveLength(1);
  });

  it("mudança na conta que não troca a pessoa não mexe na carteira", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody() });
    await store.actions.load();
    h.account.set(meUser({ nickname: "Outro apelido" }));
    await flush();
    expect(state().wallet).toEqual(walletBody());
    expect(h.server.callsTo("GET", "/api/wallet")).toHaveLength(1);
  });

  it("resultado de ação que volta com outra conta não entra no estado", async () => {
    create();
    const answers = deferred("POST", "/api/wallet/gifts/gold");
    const sending = store.actions.sendGold({ to: "caio", amount: 10 });
    await flush();
    h.account.set(meUser({ id: "u2" }));
    answers[0]?.({ status: 200, body: walletBody({ gold: 5 }) });
    await expect(sending).resolves.toEqual({ ok: true, value: undefined });
    expect(state().wallet).toBeNull();
  });
});

describe("sendGold e giftPlus", () => {
  it("envia pelo @nome, atualiza o saldo e recarrega o extrato já carregado", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", {
      status: 200,
      body: { entries: [ledgerEntry()], nextCursor: null },
    });
    await store.actions.loadLedger();
    h.server.on("POST", "/api/wallet/gifts/gold", {
      status: 200,
      body: walletBody({ gold: 900, goldSentToday: 100 }),
    });
    await expect(store.actions.sendGold({ to: " @caio ", amount: 100 })).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(h.server.callsTo("POST", "/api/wallet/gifts/gold")[0]?.body).toEqual({ to: "caio", amount: 100 });
    expect(state()).toMatchObject({ status: "ready", wallet: { gold: 900, goldSentToday: 100 } });
    await flush();
    expect(h.server.callsTo("GET", "/api/wallet/ledger")).toHaveLength(2);
  });

  it("sem o extrato carregado, não pede extrato", async () => {
    create();
    h.server.on("POST", "/api/wallet/gifts/plus", { status: 200, body: walletBody({ gold: 10 }) });
    await expect(store.actions.giftPlus({ to: "bia" })).resolves.toEqual({ ok: true, value: undefined });
    expect(h.server.callsTo("POST", "/api/wallet/gifts/plus")[0]?.body).toEqual({ to: "bia" });
    expect(state().wallet?.gold).toBe(10);
    await flush();
    expect(h.server.callsTo("GET", "/api/wallet/ledger")).toHaveLength(0);
  });

  it.each<[string, WalletErrorReason]>([
    ["insufficient_funds", "insufficientFunds"],
    ["daily_limit", "dailyLimit"],
    ["recipient_not_found", "recipientNotFound"],
    ["self_gift", "selfGift"],
    ["invalid_request", "invalid"],
    ["rate_limited", "rateLimited"],
    ["unauthorized", "unauthorized"],
    ["onboarding_required", "unauthorized"],
    ["internal_error", "error"],
  ])("erro %s vira %s", async (error, reason) => {
    create();
    h.server.on("POST", "/api/wallet/gifts/gold", { status: 400, body: { error } });
    await expect(store.actions.sendGold({ to: "caio", amount: 10 })).resolves.toEqual({ ok: false, reason });
  });

  it("falha de rede vira error, sem relato", async () => {
    create();
    h.server.offline = true;
    await expect(store.actions.giftPlus({ to: "caio" })).resolves.toEqual({ ok: false, reason: "error" });
    expect(h.reports).toEqual([]);
  });

  it("recusa por saldo recarrega os saldos já carregados", async () => {
    create();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody({ gold: 1000 }) });
    await store.actions.load();
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody({ gold: 5 }) });
    h.server.on("POST", "/api/wallet/gifts/gold", { status: 400, body: { error: "insufficient_funds" } });
    await store.actions.sendGold({ to: "caio", amount: 10 });
    await flush();
    expect(state().wallet?.gold).toBe(5);
  });

  it("dados inválidos não saem", async () => {
    create();
    await expect(store.actions.sendGold({ to: "caio", amount: 0 })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(store.actions.sendGold({ to: "não vale", amount: 1 })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(store.actions.giftPlus({ to: "" })).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(h.server.calls).toHaveLength(0);
  });
});

describe("loja", () => {
  it("compra atualiza saldo, loja e extrato", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", { status: 200, body: { entries: [], nextCursor: null } });
    await store.actions.loadLedger();
    const bought = shopItem({ owned: true });
    h.server.on("POST", "/api/shop/items/color_red/buy", {
      status: 200,
      body: { wallet: walletBody({ silver: 200 }), items: [bought] },
    });
    await expect(store.actions.buyItem("color_red", "silver")).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(h.server.callsTo("POST", "/api/shop/items/color_red/buy")[0]?.body).toEqual({
      currency: "silver",
    });
    expect(state().wallet?.silver).toBe(200);
    expect(state().shop).toEqual({ status: "ready", items: [bought] });
    await flush();
    expect(h.server.callsTo("GET", "/api/wallet/ledger")).toHaveLength(2);
  });

  it("o id do item vai codificado no caminho", async () => {
    create();
    await store.actions.buyItem("a/b", "gold");
    expect(h.server.calls[0]?.path).toBe("/api/shop/items/a%2Fb/buy");
  });

  it.each<[string, WalletErrorReason]>([
    ["already_owned", "alreadyOwned"],
    ["insufficient_funds", "insufficientFunds"],
    ["not_found", "notFound"],
  ])("compra recusada por %s vira %s", async (error, reason) => {
    create();
    h.server.on("POST", "/api/shop/items/x/buy", { status: 409, body: { error } });
    await expect(store.actions.buyItem("x", "gold")).resolves.toEqual({ ok: false, reason });
  });

  it("moeda inválida não sai", async () => {
    create();
    await expect(store.actions.buyItem("x", "bronze" as "gold")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(h.server.calls).toHaveLength(0);
  });

  it("equipar atualiza a loja; item que não é da conta vira notOwned", async () => {
    create();
    const equipped = shopItem({ owned: true, equipped: true });
    h.server.on("POST", "/api/shop/items/color_red/equip", { status: 200, body: { items: [equipped] } });
    await expect(store.actions.setEquipped("color_red", true)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(h.server.calls[0]?.body).toEqual({ equipped: true });
    expect(state().shop.items).toEqual([equipped]);

    h.server.on("POST", "/api/shop/items/x/equip", { status: 409, body: { error: "not_owned" } });
    await expect(store.actions.setEquipped("x", true)).resolves.toEqual({ ok: false, reason: "notOwned" });
  });
});

describe("compra de ouro", () => {
  const checkout = {
    paymentId: "gp_1",
    packId: "gold_990",
    gold: 990,
    amountCents: 990,
    brCode: "000201",
    qrCodeImageUrl: "https://example.test/qr.png",
    expiresAt: 1,
  };

  it("cria a cobrança com o CPF só no corpo", async () => {
    create();
    h.server.on("POST", "/api/wallet/gold/checkout", { status: 200, body: checkout });
    await expect(store.actions.startGoldCheckout({ packId: "gold_990", taxId: TAX_ID })).resolves.toEqual({
      ok: true,
      value: checkout,
    });
    const [call] = h.server.callsTo("POST", "/api/wallet/gold/checkout");
    expect(call?.body).toEqual({ packId: "gold_990", taxId: TAX_ID });
    expect(JSON.stringify(state())).not.toContain(TAX_ID);
  });

  it("o CPF nunca vai para o relato", async () => {
    create();
    h.server.on("POST", "/api/wallet/gold/checkout", { status: 500, body: { error: "internal_error" } });
    await expect(store.actions.startGoldCheckout({ packId: "gold_990", taxId: TAX_ID })).resolves.toEqual({
      ok: false,
      reason: "error",
    });
    h.server.on("POST", "/api/wallet/gold/checkout", { status: 200, body: { nada: true } });
    await store.actions.startGoldCheckout({ packId: "gold_990", taxId: TAX_ID });
    expect(h.reports).toHaveLength(2);
    expect(JSON.stringify(h.reports)).not.toContain(TAX_ID);
    expect(h.server.calls.every((c) => !c.path.includes(TAX_ID))).toBe(true);
  });

  it("pacote ou CPF inválido não saem; venda desligada vira billingUnavailable", async () => {
    create();
    await expect(store.actions.startGoldCheckout({ packId: "gold_1", taxId: TAX_ID })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(store.actions.startGoldCheckout({ packId: "gold_990", taxId: "123" })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(h.server.calls).toHaveLength(0);
    h.server.on("POST", "/api/wallet/gold/checkout", { status: 503, body: { error: "billing_unavailable" } });
    await expect(store.actions.startGoldCheckout({ packId: "gold_990", taxId: TAX_ID })).resolves.toEqual({
      ok: false,
      reason: "billingUnavailable",
    });
  });
});

describe("watchGoldPayment", () => {
  const PATH = "/api/wallet/gold/payments/gp_1";

  function payment(status: PaymentStatus) {
    h.server.on("GET", PATH, { status: 200, body: { status } });
  }

  function watching() {
    const changes: PaymentStatus[] = [];
    const stop = store.actions.watchGoldPayment("gp_1", (status) => changes.push(status));
    return { changes, stop };
  }

  it("pendente → pago avisa, para e recarrega saldo e extrato", async () => {
    create();
    h.server.on("GET", "/api/wallet/ledger", { status: 200, body: { entries: [], nextCursor: null } });
    await store.actions.loadLedger();
    payment("pending");
    const { changes } = watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual(["pending"]);
    expect(h.server.callsTo("GET", "/api/wallet")).toHaveLength(0);

    payment("paid");
    h.server.on("GET", "/api/wallet", { status: 200, body: walletBody({ gold: 1990 }) });
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS);
    expect(changes).toEqual(["pending", "paid"]);
    await flush();
    expect(state().wallet?.gold).toBe(1990);
    expect(h.server.callsTo("GET", "/api/wallet/ledger")).toHaveLength(2);

    const calls = h.server.callsTo("GET", PATH).length;
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(calls);
  });

  it("expirado encerra sem recarregar nada", async () => {
    create();
    payment("expired");
    const { changes } = watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual(["expired"]);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
    expect(h.server.callsTo("GET", "/api/wallet")).toHaveLength(0);
  });

  it("cancelar para de consultar e de avisar", async () => {
    create();
    payment("pending");
    const { changes, stop } = watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    stop();
    payment("paid");
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(changes).toEqual(["pending"]);
    expect(h.visibility.handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pausa com a aba oculta e consulta na hora quando ela volta", async () => {
    create();
    payment("pending");
    watching();
    h.visibility.set(true);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(0);
    h.visibility.set(false);
    await flush();
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
  });

  it("troca de conta para a consulta", async () => {
    create();
    payment("pending");
    const { changes } = watching();
    h.account.set(meUser({ id: "u2" }));
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(changes).toEqual([]);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(0);
  });

  it("pagamento desconhecido encerra como failed", async () => {
    create();
    h.server.on("GET", PATH, { status: 404, body: { error: "not_found" } });
    const { changes } = watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual(["failed"]);
  });
});
