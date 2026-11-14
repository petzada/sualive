import type { MeUser } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore, loginUrl, PAYMENT_POLL_BASE_DELAY_MS, PAYMENT_POLL_MAX_DELAY_MS } from "./store";
import { createAccountHarness, meResponse, meUser, PLUS_PLAN, type AccountHarness } from "./testing/fakes";
import type { PaymentStatus } from "./types";

const flush = () => vi.advanceTimersByTimeAsync(0);

let h: AccountHarness;
let store: AccountStore;

const state = () => store.getSnapshot();

/** Store já carregado com a conta dada (ou anônimo). */
async function loaded(user: MeUser | null = meUser()) {
  h.server.me(meResponse(user));
  store = new AccountStore(h.deps);
  store.subscribe(() => undefined);
  await flush();
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  h = createAccountHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("carregamento", () => {
  it("só consulta ao ser usado, e uma vez para todos", async () => {
    h.server.me(meResponse(null));
    store = new AccountStore(h.deps);
    await flush();
    expect(h.server.calls).toHaveLength(0);
    expect(state().status).toBe("loading");

    store.subscribe(() => undefined);
    store.subscribe(() => undefined);
    const user = store.current();
    await flush();
    expect(await user).toBeNull();
    expect(h.server.callsTo("GET", "/api/me")).toHaveLength(1);
    expect(h.server.calls[0]?.init?.credentials).toBe("same-origin");
  });

  it("anônimo traz os logins e a cobrança do ambiente", async () => {
    await loaded(null);
    expect(state()).toEqual({
      status: "anonymous",
      user: null,
      providers: ["google", "discord"],
      billingEnabled: true,
    });
  });

  it("autenticado traz a conta", async () => {
    const user = meUser();
    await loaded(user);
    expect(state().status).toBe("authenticated");
    expect(state().user).toEqual(user);
    expect(await store.current()).toEqual(user);
  });

  it.each([
    ["erro do servidor", { status: 500, body: { error: "internal_error" } }],
    ["resposta fora do esquema", { status: 200, body: { user: { id: "" } } }],
  ])("%s vira error e refresh tenta de novo", async (_label, reply) => {
    h.server.on("GET", "/api/me", reply);
    store = new AccountStore(h.deps);
    store.subscribe(() => undefined);
    await flush();
    expect(state().status).toBe("error");
    expect(await store.current()).toBeNull();
    expect(h.reports).toHaveLength(1);

    h.server.me(meResponse(meUser()));
    const refreshing = store.refresh();
    expect(state().status).toBe("loading");
    await refreshing;
    expect(state().status).toBe("authenticated");
  });

  it("rede caída vira error sem relato", async () => {
    h.server.offline = true;
    store = new AccountStore(h.deps);
    store.subscribe(() => undefined);
    await flush();
    expect(state().status).toBe("error");
    expect(h.reports).toEqual([]);
  });

  it("falha passageira num refresh não desloga quem já estava logado", async () => {
    await loaded(meUser());
    h.server.offline = true;
    await store.refresh();
    expect(state().status).toBe("authenticated");
  });

  it("current espera a consulta em andamento", async () => {
    h.server.me(meResponse(meUser()));
    store = new AccountStore(h.deps);
    const user = store.current();
    await flush();
    expect(await user).toMatchObject({ id: "u1" });
  });

  it("avisa quem assina a cada mudança", async () => {
    h.server.me(meResponse(null));
    store = new AccountStore(h.deps);
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("loginUrl", () => {
  it("leva o caminho local de volta, codificado", () => {
    expect(loginUrl("google", "/@ana?x=1&y=2")).toBe(
      "/api/auth/google/start?returnTo=%2F%40ana%3Fx%3D1%26y%3D2",
    );
    expect(loginUrl("discord")).toBe("/api/auth/discord/start");
  });

  it.each([
    "https://evil.test/x",
    "//evil.test",
    "/\\evil.test",
    "evil",
    "/a b",
    "/a\tb",
    "",
    "/" + "a".repeat(600),
  ])("descarta returnTo que não é caminho local: %s", (returnTo) => {
    expect(loginUrl("google", returnTo)).toBe("/api/auth/google/start");
  });

  it("é a mesma função nas ações", async () => {
    await loaded(null);
    expect(store.actions.loginUrl("google", "/plus")).toBe("/api/auth/google/start?returnTo=%2Fplus");
  });
});

describe("ações", () => {
  it("logout encerra a sessão e volta a anônimo", async () => {
    await loaded(meUser());
    h.server.on("POST", "/api/auth/logout", { status: 204 });
    await store.actions.logout();
    expect(h.server.callsTo("POST", "/api/auth/logout")).toHaveLength(1);
    expect(state()).toMatchObject({ status: "anonymous", user: null, providers: ["google", "discord"] });
  });

  it("logout que falha consulta o servidor de novo", async () => {
    await loaded(meUser());
    h.server.on("POST", "/api/auth/logout", { status: 500, body: { error: "internal_error" } });
    await store.actions.logout();
    expect(h.server.callsTo("GET", "/api/me")).toHaveLength(2);
    expect(state().status).toBe("authenticated");
  });

  it("primeiro acesso envia a declaração e atualiza a conta", async () => {
    await loaded(meUser({ onboarded: false, handle: null }));
    const done = meUser({ handle: "nova" });
    h.server.on("POST", "/api/me/onboarding", { status: 200, body: done });
    const result = await store.actions.completeOnboarding({ handle: "nova", adult: true, acceptTerms: true });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(h.server.callsTo("POST", "/api/me/onboarding")[0]?.body).toEqual({
      handle: "nova",
      adult: true,
      acceptTerms: true,
    });
    expect(state().user).toEqual(done);
  });

  it("primeiro acesso com @nome inválido não chega ao servidor", async () => {
    await loaded(meUser({ onboarded: false, handle: null }));
    const result = await store.actions.completeOnboarding({ handle: "A!", adult: true, acceptTerms: true });
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(h.server.callsTo("POST", "/api/me/onboarding")).toHaveLength(0);
  });

  it("perfil atualiza só o que foi pedido", async () => {
    await loaded(meUser());
    const updated = meUser({ nickname: "Ana Nova" });
    h.server.on("PATCH", "/api/me", { status: 200, body: updated });
    expect(await store.actions.updateProfile({ nickname: "Ana Nova" })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(h.server.callsTo("PATCH", "/api/me")[0]?.body).toEqual({ nickname: "Ana Nova" });
    expect(state().user?.nickname).toBe("Ana Nova");
  });

  it("perfil sem mudança nenhuma é recusado sem ir ao servidor", async () => {
    await loaded(meUser());
    expect(await store.actions.updateProfile({})).toEqual({ ok: false, reason: "invalid" });
    expect(h.server.callsTo("PATCH", "/api/me")).toHaveLength(0);
  });

  it.each([
    [409, "handle_taken", "handleTaken"],
    [409, "handle_reserved", "handleReserved"],
    [409, "handle_change_too_soon", "handleChangeTooSoon"],
    [403, "plus_required", "plusRequired"],
    [503, "billing_unavailable", "billingUnavailable"],
    [409, "already_subscribed", "alreadySubscribed"],
    [400, "invalid_request", "invalid"],
    [429, "rate_limited", "rateLimited"],
    [403, "onboarding_required", "unauthorized"],
    [401, "unauthorized", "unauthorized"],
    [500, "internal_error", "error"],
    [404, "not_found", "error"],
  ] as const)("erro %i %s vira %s", async (status, error, reason) => {
    await loaded(meUser());
    h.server.on("PATCH", "/api/me", { status, body: { error } });
    expect(await store.actions.updateProfile({ handle: "outra" })).toEqual({ ok: false, reason });
  });

  it("rede caída e resposta fora do esquema viram error", async () => {
    await loaded(meUser());
    h.server.on("PATCH", "/api/me", { status: 200, body: { nickname: "x" } });
    expect(await store.actions.updateProfile({ nickname: "Ana Nova" })).toEqual({
      ok: false,
      reason: "error",
    });
    expect(h.reports).toEqual([
      { message: "account: request failed", extra: { route: "profile", error: "invalid_response" } },
    ]);
    expect(state().user?.nickname).toBe("Ana");

    h.server.offline = true;
    expect(await store.actions.updateProfile({ nickname: "Ana Nova" })).toEqual({
      ok: false,
      reason: "error",
    });
  });

  it("401 numa rota que exige conta volta a anônimo", async () => {
    await loaded(meUser());
    h.server.on("PATCH", "/api/me", { status: 401, body: { error: "unauthorized" } });
    await store.actions.updateProfile({ nickname: "Ana Nova" });
    expect(state()).toMatchObject({ status: "anonymous", user: null });
  });

  it("onboarding_required consulta a conta de novo", async () => {
    await loaded(meUser());
    h.server.on("PATCH", "/api/me", { status: 403, body: { error: "onboarding_required" } });
    h.server.me(meResponse(meUser({ onboarded: false, handle: null })));
    await store.actions.updateProfile({ nickname: "Ana Nova" });
    await flush();
    expect(h.server.callsTo("GET", "/api/me")).toHaveLength(2);
    expect(state().user?.onboarded).toBe(false);
  });

  it("checkHandle consulta a disponibilidade", async () => {
    await loaded(meUser());
    h.server.on("GET", "/api/handles/nova_1", { status: 200, body: { available: false, reason: "taken" } });
    expect(await store.actions.checkHandle("nova_1")).toEqual({
      ok: true,
      value: { available: false, reason: "taken" },
    });
    h.server.on("GET", "/api/handles/nova_1", { status: 429, body: { error: "rate_limited" } });
    expect(await store.actions.checkHandle("nova_1")).toEqual({ ok: false, reason: "rateLimited" });
  });

  it("checkHandle codifica o que foi digitado", async () => {
    await loaded(null);
    h.server.on("GET", "/api/handles/a%2Fb", { status: 200, body: { available: false, reason: "invalid" } });
    expect(await store.actions.checkHandle("a/b")).toEqual({
      ok: true,
      value: { available: false, reason: "invalid" },
    });
  });

  it("excluir a conta volta a anônimo", async () => {
    await loaded(meUser());
    h.server.on("DELETE", "/api/me", { status: 204 });
    expect(await store.actions.deleteAccount()).toEqual({ ok: true, value: undefined });
    expect(state()).toMatchObject({ status: "anonymous", user: null });
  });

  it("checkout do Plus devolve o QR Code e não relata o CPF", async () => {
    await loaded(meUser());
    const checkout = {
      paymentId: "pay_1",
      cycle: "annual",
      amountCents: 15920,
      brCode: "000201...",
      qrCodeImageUrl: "https://woovi.test/qr.png",
      expiresAt: 1_900_000_000_000,
    };
    h.server.on("POST", "/api/plus/checkout", { status: 200, body: checkout });
    const result = await store.actions.startPlusCheckout({ cycle: "annual", taxId: "12345678909" });
    expect(result).toEqual({ ok: true, value: checkout });
    expect(h.server.callsTo("POST", "/api/plus/checkout")[0]?.body).toEqual({
      cycle: "annual",
      taxId: "12345678909",
    });

    h.server.on("POST", "/api/plus/checkout", { status: 500, body: { error: "internal_error" } });
    await store.actions.startPlusCheckout({ cycle: "annual", taxId: "12345678909" });
    expect(JSON.stringify(h.reports)).not.toContain("12345678909");
  });

  it.each([
    [503, "billing_unavailable", "billingUnavailable"],
    [409, "already_subscribed", "alreadySubscribed"],
    [400, "invalid_request", "invalid"],
  ] as const)("checkout com %i %s vira %s", async (status, error, reason) => {
    await loaded(meUser());
    h.server.on("POST", "/api/plus/checkout", { status, body: { error } });
    expect(await store.actions.startPlusCheckout({ cycle: "monthly", taxId: "12345678909" })).toEqual({
      ok: false,
      reason,
    });
  });

  it("CPF malformado não chega ao servidor", async () => {
    await loaded(meUser());
    expect(await store.actions.startPlusCheckout({ cycle: "monthly", taxId: "123.456.789-09" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(h.server.callsTo("POST", "/api/plus/checkout")).toHaveLength(0);
  });

  it("cancelar o Plus atualiza o plano da conta", async () => {
    await loaded(meUser({ plan: PLUS_PLAN, badges: ["plus"] }));
    const canceled = { ...PLUS_PLAN, status: "canceled" as const, renews: false };
    h.server.on("POST", "/api/plus/cancel", { status: 200, body: canceled });
    expect(await store.actions.cancelPlus()).toEqual({ ok: true, value: canceled });
    expect(state().user?.plan).toEqual(canceled);
  });

  it("uma ação vale sobre uma consulta de /api/me que ainda estava no ar", async () => {
    await loaded(meUser());
    let answer: (reply: { status: number; body: unknown }) => void = () => undefined;
    h.server.on("GET", "/api/me", () => new Promise((resolve) => (answer = resolve)));
    const refreshing = store.refresh();
    h.server.on("DELETE", "/api/me", { status: 204 });
    await store.actions.deleteAccount();
    answer({ status: 200, body: meResponse(meUser()) });
    await refreshing;
    expect(state().status).toBe("anonymous");
  });
});

describe("watchPlusPayment", () => {
  const PATH = "/api/plus/payments/pay_1";

  function payment(status: PaymentStatus) {
    h.server.on("GET", PATH, { status: 200, body: { status } });
  }

  async function watching() {
    await loaded(meUser());
    const changes: PaymentStatus[] = [];
    const stop = store.actions.watchPlusPayment("pay_1", (status) => changes.push(status));
    return { changes, stop };
  }

  it("pendente → pago avisa cada mudança, para e atualiza a conta", async () => {
    payment("pending");
    const { changes } = await watching();
    expect(h.server.callsTo("GET", PATH)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
    expect(changes).toEqual(["pending"]);

    // A espera cresce: a próxima consulta não sai no mesmo intervalo.
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(2);
    expect(changes).toEqual(["pending"]);

    payment("paid");
    h.server.me(meResponse(meUser({ plan: PLUS_PLAN, badges: ["plus"] })));
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS);
    expect(changes).toEqual(["pending", "paid"]);
    await flush();
    expect(state().user?.plan.plus).toBe(true);

    const calls = h.server.callsTo("GET", PATH).length;
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a espera tem teto", async () => {
    payment("pending");
    await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 10);
    const before = h.server.callsTo("GET", PATH).length;
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(before + 1);
  });

  it.each(["expired", "failed"] as const)("%s encerra a consulta", async (status) => {
    payment(status);
    const { changes } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual([status]);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
    expect(h.server.callsTo("GET", "/api/me")).toHaveLength(1);
  });

  it("cancelar para de consultar e de avisar", async () => {
    payment("pending");
    const { changes, stop } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    stop();
    payment("paid");
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(changes).toEqual(["pending"]);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
    expect(h.visibility.handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancelar com a consulta no ar ignora a resposta", async () => {
    let answer: (reply: { status: number; body: unknown }) => void = () => undefined;
    h.server.on("GET", PATH, () => new Promise((resolve) => (answer = resolve)));
    const { changes, stop } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    stop();
    answer({ status: 200, body: { status: "paid" } });
    await flush();
    expect(changes).toEqual([]);
  });

  it("pausa com a aba oculta e consulta na hora quando ela volta", async () => {
    payment("pending");
    await watching();
    h.visibility.set(true);
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS * 3);
    expect(h.server.callsTo("GET", PATH)).toHaveLength(0);
    h.visibility.set(false);
    await flush();
    expect(h.server.callsTo("GET", PATH)).toHaveLength(1);
  });

  it("falha passageira tenta de novo", async () => {
    h.server.on("GET", PATH, { status: 500, body: { error: "internal_error" } });
    const { changes } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    payment("paid");
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MAX_DELAY_MS);
    expect(changes).toEqual(["paid"]);
  });

  it("pagamento desconhecido encerra como failed", async () => {
    h.server.on("GET", PATH, { status: 404, body: { error: "not_found" } });
    const { changes } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual(["failed"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sessão perdida encerra e volta a anônimo", async () => {
    h.server.on("GET", PATH, { status: 401, body: { error: "unauthorized" } });
    const { changes } = await watching();
    await vi.advanceTimersByTimeAsync(PAYMENT_POLL_BASE_DELAY_MS);
    expect(changes).toEqual(["failed"]);
    expect(state().status).toBe("anonymous");
  });
});
