import { API_RATE_LIMIT_MAX, HANDLE_CHANGE_INTERVAL_DAYS, TERMS_VERSION } from "@sualive/config";
import {
  apiErrorSchema,
  handleAvailabilityResponseSchema,
  meResponseSchema,
  meUserSchema,
} from "@sualive/protocol";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findUserByHandle } from "../src/account";
import { deriveNickname } from "../src/account/users";
import { safeReturnTo } from "../src/auth/routes";
import { createAccountSession, sessionIdFor } from "../src/auth/session";
import { NO_PLAN } from "../src/billing/plan";
import { oauthAccounts, sessions, users } from "../src/db/schema";
import type { AppEnv } from "../src/env";
import {
  accountRequest,
  completeLogin,
  createTestUser,
  fakeOAuthProviders,
  OAUTH_TEST_ENV,
  setCookies,
  startLogin,
  testDb,
  uniqueHandle,
} from "./account";
import { useD1 } from "./d1";
import { mockOutboundFetch, ORIGIN, randomIp } from "./helpers";

useD1();

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_COOKIE = "__Host-sualive_account";
const OAUTH_COOKIE = "__Host-sualive_oauth";

afterEach(() => {
  vi.restoreAllMocks();
});

async function errorOf(response: Response) {
  return apiErrorSchema.parse(await response.json()).error;
}

async function getMe(cookie?: string, extraEnv?: Partial<AppEnv>) {
  const response = await accountRequest("/api/me", { cookie, env: extraEnv });
  expect(response.status).toBe(200);
  return meResponseSchema.parse(await response.json());
}

describe("início do login", () => {
  it("redireciona ao Google com state, PKCE S256, escopos mínimos e cookie HttpOnly curto", async () => {
    const { response, location, state } = await startLogin("google", "/s/abc");
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(state.length).toBeGreaterThan(20);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get("scope")).toBe("openid profile");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    const flow = setCookies(response).get(OAUTH_COOKIE);
    expect(flow?.raw).toMatch(/HttpOnly/);
    expect(flow?.raw).toMatch(/Secure/);
    expect(flow?.raw).toMatch(/SameSite=Lax/);
    expect(flow?.raw).toMatch(/Path=\//);
    expect(flow?.raw).toMatch(/Max-Age=600/);
    // O code_verifier fica só no cookie, nunca na URL.
    expect(location.searchParams.get("code_verifier")).toBeNull();
  });

  it("redireciona ao Discord só com o escopo identify", async () => {
    const { response, location } = await startLogin("discord");
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(location.searchParams.get("scope")).toBe("identify");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("recusa provedor sem credenciais e provedor desconhecido", async () => {
    const noDiscord = await accountRequest("/api/auth/discord/start", {
      env: { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" },
    });
    expect(noDiscord.status).toBe(404);
    expect(await errorOf(noDiscord)).toBe("provider_unavailable");
    const unknown = await accountRequest("/api/auth/github/start", { env: OAUTH_TEST_ENV });
    expect(await errorOf(unknown)).toBe("provider_unavailable");
  });

  it("aceita só returnTo local", () => {
    expect(safeReturnTo("/s/abc?x=1")).toBe("/s/abc?x=1");
    expect(safeReturnTo("https://evil.test/")).toBe("/");
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("/\\evil.test")).toBe("/");
    expect(safeReturnTo("/\t/evil.test")).toBe("/");
    expect(safeReturnTo("evil")).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
  });
});

describe("retorno do login", () => {
  it("cria conta nova sem @nome nem e-mail e manda para as boas-vindas", async () => {
    const providerUserId = `g-${crypto.randomUUID()}`;
    const fake = fakeOAuthProviders({
      novo: {
        body: {
          sub: providerUserId,
          name: "  Maria   da Silva Souza Pereira Lima  ",
          picture: "https://lh3.googleusercontent.test/a.png",
          email: "maria@example.test",
          email_verified: true,
        },
      },
    });
    mockOutboundFetch(fake.handler);
    const { response, location, accountCookie } = await completeLogin("google", "novo", {
      returnTo: "/s/abc",
    });
    expect(response.status).toBe(302);
    expect(location).toBe(`/boas-vindas?returnTo=${encodeURIComponent("/s/abc")}`);
    expect(accountCookie).not.toBeNull();

    const cookie = setCookies(response).get(ACCOUNT_COOKIE)!.raw;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    // O cookie do fluxo é apagado.
    expect(setCookies(response).get(OAUTH_COOKIE)?.raw).toMatch(/Max-Age=0/);

    // O token foi trocado com o code_verifier do cookie.
    const tokenCall = fake.calls.find((call) => call.url === "https://oauth2.googleapis.com/token")!;
    expect(new URLSearchParams(tokenCall.body).get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43,}$/);

    const me = await getMe(accountCookie!);
    expect(me.user).toMatchObject({
      handle: null,
      nickname: "Maria da Silva Souza Per",
      avatarUrl: "https://lh3.googleusercontent.test/a.png",
      onboarded: false,
    });

    const [link] = await testDb()
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerUserId, providerUserId));
    expect(link?.provider).toBe("google");
    const [row] = await testDb().select().from(users).where(eq(users.id, link!.userId));
    // Nenhum e-mail gravado em lugar nenhum da conta.
    expect(JSON.stringify(row)).not.toContain("maria@example.test");
    expect(JSON.stringify(row)).not.toContain("@");
    // No D1 fica só o hash do token.
    const token = accountCookie!.split("=")[1]!;
    const [session] = await testDb().select().from(sessions).where(eq(sessions.userId, link!.userId));
    expect(session?.id).toBe(await sessionIdFor(token));
    expect(session?.id).not.toBe(token);
  });

  it("reaproveita a conta existente, atualiza o avatar e volta para returnTo", async () => {
    const discordId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const existing = await createTestUser({
      nickname: "Antigo",
      avatarUrl: "https://cdn.discordapp.com/avatars/x/velho.png",
      oauth: { provider: "discord", providerUserId: discordId },
    });
    mockOutboundFetch(
      fakeOAuthProviders({
        volta: { body: { id: discordId, username: "novo_nome", global_name: "Novo", avatar: "abc123" } },
      }).handler,
    );
    const { location, accountCookie } = await completeLogin("discord", "volta", { returnTo: "/s/xyz" });
    expect(location).toBe("/s/xyz");
    const me = await getMe(accountCookie!);
    expect(me.user?.id).toBe(existing.userId);
    // O apelido escolhido não muda; o avatar segue o do provedor.
    expect(me.user?.nickname).toBe("Antigo");
    expect(me.user?.avatarUrl).toBe(`https://cdn.discordapp.com/avatars/${discordId}/abc123.png`);
    const links = await testDb()
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, existing.userId));
    expect(links).toHaveLength(1);
  });

  it("descarta returnTo externo", async () => {
    const discordId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await createTestUser({ oauth: { provider: "discord", providerUserId: discordId } });
    mockOutboundFetch(fakeOAuthProviders({ ok: { body: { id: discordId, username: "zé" } } }).handler);
    const { location } = await completeLogin("discord", "ok", { returnTo: "https://evil.test/roubo" });
    expect(location).toBe("/");
  });

  it("recusa state errado sem chamar o provedor", async () => {
    const fake = fakeOAuthProviders({ x: { body: { sub: "nunca" } } });
    mockOutboundFetch(fake.handler);
    const { response, location, accountCookie } = await completeLogin("google", "x", {
      state: "state-errado",
    });
    expect(response.status).toBe(302);
    expect(location).toBe("/entrar?erro=login");
    expect(accountCookie).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it("recusa callback sem o cookie do fluxo ou com outro provedor", async () => {
    mockOutboundFetch(fakeOAuthProviders({}).handler);
    const noCookie = await accountRequest("/api/auth/google/callback?code=a&state=b", {
      env: OAUTH_TEST_ENV,
    });
    expect(noCookie.headers.get("Location")).toBe("/entrar?erro=login");
    const start = await startLogin("google");
    const other = await accountRequest(`/api/auth/discord/callback?code=a&state=${start.state}`, {
      cookie: start.flowCookie,
      env: OAUTH_TEST_ENV,
    });
    expect(other.headers.get("Location")).toBe("/entrar?erro=login");
  });

  it("pessoa negou ou provedor falhou: volta para /entrar", async () => {
    mockOutboundFetch(fakeOAuthProviders({ ruim: { body: {}, tokenStatus: 401 } }).handler);
    const start = await startLogin("google");
    const denied = await accountRequest(
      `/api/auth/google/callback?error=access_denied&state=${start.state}`,
      {
        cookie: start.flowCookie,
        env: OAUTH_TEST_ENV,
      },
    );
    expect(denied.headers.get("Location")).toBe("/entrar?erro=login");
    const failed = await completeLogin("google", "ruim");
    expect(failed.location).toBe("/entrar?erro=login");
    expect(failed.accountCookie).toBeNull();
  });

  it("deriva apelido de 2 a 24 caracteres", () => {
    expect(deriveNickname(["A", "bo"])).toBe("bo");
    expect(deriveNickname(["", " "])).toBe("Pessoa");
    expect(deriveNickname(["😀".repeat(30)])).toBe("😀".repeat(12));
    expect(deriveNickname(["a\u0000b​c"])).toBe("abc");
  });
});

describe("sessão", () => {
  it("válida, vencida (apagada) e adulterada", async () => {
    const valid = await createTestUser();
    expect((await getMe(valid.cookie)).user?.id).toBe(valid.userId);

    const expired = await createTestUser({ sessionExpiresAt: Date.now() - 1000 });
    expect((await getMe(expired.cookie)).user).toBeNull();
    const left = await testDb().select().from(sessions).where(eq(sessions.userId, expired.userId));
    expect(left).toEqual([]);

    const tampered = `${valid.cookie.slice(0, -2)}${valid.cookie.endsWith("AA") ? "BB" : "AA"}`;
    expect((await getMe(tampered)).user).toBeNull();
    expect((await getMe(`${ACCOUNT_COOKIE}=lixo`)).user).toBeNull();
    // Sem o prefixo __Host- o cookie não vale.
    expect((await getMe(`sualive_account=${valid.token}`)).user).toBeNull();
  });

  it("createAccountSession grava só o hash", async () => {
    const user = await createTestUser();
    const token = await createAccountSession(env as unknown as AppEnv, user.userId);
    const [row] = await testDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, await sessionIdFor(token)));
    expect(row?.userId).toBe(user.userId);
  });

  it("logout apaga a sessão e o cookie", async () => {
    const user = await createTestUser();
    const response = await accountRequest("/api/auth/logout", { method: "POST", cookie: user.cookie });
    expect(response.status).toBe(204);
    expect(setCookies(response).get(ACCOUNT_COOKIE)?.raw).toMatch(/Max-Age=0/);
    expect(await testDb().select().from(sessions).where(eq(sessions.userId, user.userId))).toEqual([]);
    expect((await getMe(user.cookie)).user).toBeNull();
  });
});

describe("CSRF", () => {
  it("recusa outra origem, Sec-Fetch-Site cross-site e requisição sem nenhum dos dois", async () => {
    const user = await createTestUser();
    const evil = await accountRequest("/api/auth/logout", {
      method: "POST",
      cookie: user.cookie,
      origin: "https://evil.test",
    });
    expect(evil.status).toBe(400);
    const crossSite = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { nickname: "Hacker" },
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(crossSite.status).toBe(400);
    const bare = await accountRequest("/api/me", { method: "DELETE", cookie: user.cookie, origin: null });
    expect(bare.status).toBe(400);
    // Nada mudou.
    const me = await getMe(user.cookie);
    expect(me.user?.nickname).toBe("Pessoa Teste");
    const sameOrigin = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { nickname: "Nova" },
      origin: null,
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(sameOrigin.status).toBe(200);
  });
});

describe("GET /api/me", () => {
  it("sem login: user nulo, logins configurados e assinatura", async () => {
    expect(await getMe()).toEqual({ user: null, providers: [], billingEnabled: false });
    expect((await getMe(undefined, OAUTH_TEST_ENV)).providers).toEqual(["google", "discord"]);
    expect(
      (await getMe(undefined, { DISCORD_CLIENT_ID: "a", DISCORD_CLIENT_SECRET: "b", GOOGLE_CLIENT_ID: "c" }))
        .providers,
    ).toEqual(["discord"]);
  });

  it("com login: perfil, plano e selos vindos da cobrança", async () => {
    const user = await createTestUser({ nickname: "Bia" });
    const me = await getMe(user.cookie);
    expect(me.user).toEqual({
      id: user.userId,
      handle: user.handle,
      nickname: "Bia",
      avatarUrl: null,
      onboarded: true,
      badges: [],
      plan: NO_PLAN.plan,
      roomTheme: "default",
      handleChangeAvailableAt: null,
      termsUpdate: null,
    });
  });
});

describe("primeiro acesso", () => {
  it("grava 18 anos, termos e @nome; não conta como troca", async () => {
    const user = await createTestUser({ onboarded: false });
    const handle = uniqueHandle("novo");
    const response = await accountRequest("/api/me/onboarding", {
      method: "POST",
      cookie: user.cookie,
      body: { handle, adult: true, acceptTerms: true },
    });
    expect(response.status).toBe(200);
    const body = meUserSchema.parse(await response.json());
    expect(body).toMatchObject({ handle, onboarded: true, handleChangeAvailableAt: null });
    const [row] = await testDb().select().from(users).where(eq(users.id, user.userId));
    expect(row?.termsVersion).toBe(TERMS_VERSION);
    expect(row?.adultConfirmedAt).toBeTypeOf("number");
    expect(row?.termsAcceptedAt).toBeTypeOf("number");
    expect(row?.handleChangedAt).toBeNull();
    expect(await findUserByHandle(env as unknown as AppEnv, handle)).toMatchObject({
      userId: user.userId,
      handle,
    });
  });

  it("@nome tomado, reservado, inválido, sem aceite e repetido", async () => {
    const owner = await createTestUser();
    const user = await createTestUser({ onboarded: false });
    const post = (body: unknown, cookie = user.cookie) =>
      accountRequest("/api/me/onboarding", { method: "POST", cookie, body });

    const taken = await post({ handle: owner.handle, adult: true, acceptTerms: true });
    expect(taken.status).toBe(409);
    expect(await errorOf(taken)).toBe("handle_taken");
    expect(await errorOf(await post({ handle: "admin", adult: true, acceptTerms: true }))).toBe(
      "handle_reserved",
    );
    expect(await errorOf(await post({ handle: "Maiúsculo", adult: true, acceptTerms: true }))).toBe(
      "invalid_request",
    );
    expect(await errorOf(await post({ handle: uniqueHandle(), adult: false, acceptTerms: true }))).toBe(
      "invalid_request",
    );

    const ok = await post({ handle: uniqueHandle(), adult: true, acceptTerms: true });
    expect(ok.status).toBe(200);
    const again = await post({ handle: uniqueHandle(), adult: true, acceptTerms: true });
    expect(again.status).toBe(400);
    expect(await errorOf(again)).toBe("invalid_request");
  });

  it("sem sessão: unauthorized", async () => {
    const response = await accountRequest("/api/me/onboarding", {
      method: "POST",
      body: { handle: uniqueHandle(), adult: true, acceptTerms: true },
    });
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toBe("unauthorized");
  });
});

describe("PATCH /api/me", () => {
  it("troca apelido; exige primeiro acesso e sessão", async () => {
    const user = await createTestUser();
    const response = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { nickname: "  Novo Apelido " },
    });
    expect(response.status).toBe(200);
    expect(meUserSchema.parse(await response.json()).nickname).toBe("Novo Apelido");

    const pending = await createTestUser({ onboarded: false });
    const blocked = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: pending.cookie,
      body: { nickname: "Outro" },
    });
    expect(await errorOf(blocked)).toBe("onboarding_required");
    const anonymous = await accountRequest("/api/me", { method: "PATCH", body: { nickname: "Outro" } });
    expect(anonymous.status).toBe(401);
    const empty = await accountRequest("/api/me", { method: "PATCH", cookie: user.cookie, body: {} });
    expect(await errorOf(empty)).toBe("invalid_request");
  });

  it("troca de @nome: liberada, depois só após 30 dias", async () => {
    const user = await createTestUser();
    const first = uniqueHandle("troca");
    const response = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: first },
    });
    expect(response.status).toBe(200);
    const body = meUserSchema.parse(await response.json());
    expect(body.handle).toBe(first);
    expect(body.handleChangeAvailableAt).toBeGreaterThan(
      Date.now() + (HANDLE_CHANGE_INTERVAL_DAYS - 1) * DAY_MS,
    );

    const tooSoon = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: uniqueHandle() },
    });
    expect(tooSoon.status).toBe(409);
    expect(await errorOf(tooSoon)).toBe("handle_change_too_soon");
    // Mandar o mesmo @nome não é troca.
    const same = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: first },
    });
    expect(same.status).toBe(200);

    await testDb()
      .update(users)
      .set({ handleChangedAt: Date.now() - (HANDLE_CHANGE_INTERVAL_DAYS * DAY_MS + 1000) })
      .where(eq(users.id, user.userId));
    const second = uniqueHandle("depois");
    const later = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: second },
    });
    expect(later.status).toBe(200);
    expect(meUserSchema.parse(await later.json()).handle).toBe(second);
  });

  it("@nome tomado (índice único) e reservado", async () => {
    const owner = await createTestUser();
    const user = await createTestUser();
    const taken = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: owner.handle },
    });
    expect(await errorOf(taken)).toBe("handle_taken");
    const reserved = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { handle: "suporte" },
    });
    expect(await errorOf(reserved)).toBe("handle_reserved");
  });

  it("tema sem Plus: plus_required", async () => {
    const user = await createTestUser();
    const response = await accountRequest("/api/me", {
      method: "PATCH",
      cookie: user.cookie,
      body: { roomTheme: "ocean" },
    });
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe("plus_required");
  });
});

describe("GET /api/handles/:handle", () => {
  it("livre, tomado, reservado e inválido", async () => {
    const owner = await createTestUser();
    const check = async (handle: string) => {
      const response = await accountRequest(`/api/handles/${encodeURIComponent(handle)}`);
      expect(response.status).toBe(200);
      return handleAvailabilityResponseSchema.parse(await response.json());
    };
    expect(await check(uniqueHandle("livre"))).toEqual({ available: true });
    expect(await check(owner.handle!)).toEqual({ available: false, reason: "taken" });
    expect(await check("plus")).toEqual({ available: false, reason: "reserved" });
    expect(await check("Ab")).toEqual({ available: false, reason: "invalid" });
  });

  it("tem limite por IP", async () => {
    const ip = randomIp();
    for (let i = 0; i < API_RATE_LIMIT_MAX; i++) {
      expect((await accountRequest("/api/handles/qualquer", { ip })).status).toBe(200);
    }
    const limited = await accountRequest("/api/handles/qualquer", { ip });
    expect(limited.status).toBe(429);
    expect(await errorOf(limited)).toBe("rate_limited");
  });
});
