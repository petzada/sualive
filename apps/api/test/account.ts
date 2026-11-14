import { ACCOUNT_SESSION_TTL_SECONDS, TERMS_VERSION } from "@sualive/config";
import type { AuthProvider } from "@sualive/protocol";
import { env } from "cloudflare:workers";
import { createDb } from "../src/db";
import { oauthAccounts, sessions, users } from "../src/db/schema";
import type { AppEnv } from "../src/env";
import { DISCORD_USER_URL, GOOGLE_USERINFO_URL } from "../src/auth/providers";
import { ACCOUNT_COOKIE_HEADER_NAME, sessionIdFor } from "../src/auth/session";
import { randomToken } from "../src/crypto";
import { fetchWithEnv, ORIGIN, randomIp } from "./helpers";

/**
 * Ajudantes de teste da conta, para esta e as próximas tarefas: conta pronta com sessão, chamadas
 * com cookie e mesma origem, e o login do Google e do Discord simulado (nunca chama a rede).
 */

/** Credenciais falsas dos dois logins. Entram pelo env da chamada, nunca pelo vitest.config.ts. */
export const OAUTH_TEST_ENV: Partial<AppEnv> = {
  GOOGLE_CLIENT_ID: "google-client-id-falso",
  GOOGLE_CLIENT_SECRET: "google-client-secret-falso",
  DISCORD_CLIENT_ID: "discord-client-id-falso",
  DISCORD_CLIENT_SECRET: "discord-client-secret-falso",
};

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

export function testDb() {
  return createDb((env as unknown as AppEnv).DB);
}

let counter = 0;
/** @nome único entre testes (letras minúsculas, números e sublinhado). */
export function uniqueHandle(prefix = "u"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`.slice(0, 20);
}

export interface TestUserOptions {
  /** Padrão: um @nome único se `onboarded`, senão nulo. */
  handle?: string | null;
  nickname?: string;
  avatarUrl?: string | null;
  /** Primeiro acesso concluído. Padrão: true. */
  onboarded?: boolean;
  handleChangedAt?: number | null;
  /** Versão dos termos aceita no primeiro acesso. Padrão: TERMS_VERSION se `onboarded`. */
  termsVersion?: string | null;
  /** Versão dos termos já vista na faixa de aviso. Padrão: nula. */
  termsSeenVersion?: string | null;
  /** E-mail guardado na conta. Padrão: nulo. */
  email?: string | null;
  /** Vencimento da sessão (ms). Padrão: agora + ACCOUNT_SESSION_TTL_SECONDS. */
  sessionExpiresAt?: number;
  /** Liga também um login externo a esta conta. */
  oauth?: { provider: AuthProvider; providerUserId: string };
}

export interface TestUser {
  userId: string;
  handle: string | null;
  /** Valor pronto para o cabeçalho `Cookie`, com uma sessão válida desta conta. */
  cookie: string;
  token: string;
}

/** Cria uma conta direto no D1, com uma sessão, e devolve o cabeçalho `Cookie` dela. */
export async function createTestUser(options: TestUserOptions = {}): Promise<TestUser> {
  const onboarded = options.onboarded ?? true;
  const handle = options.handle !== undefined ? options.handle : onboarded ? uniqueHandle() : null;
  const now = Date.now();
  const userId = crypto.randomUUID();
  const db = testDb();
  await db.insert(users).values({
    id: userId,
    handle,
    handleChangedAt: options.handleChangedAt ?? null,
    nickname: options.nickname ?? "Pessoa Teste",
    avatarUrl: options.avatarUrl ?? null,
    adultConfirmedAt: onboarded ? now : null,
    termsAcceptedAt: onboarded ? now : null,
    termsVersion:
      options.termsVersion !== undefined ? options.termsVersion : onboarded ? TERMS_VERSION : null,
    termsSeenVersion: options.termsSeenVersion ?? null,
    email: options.email ?? null,
    createdAt: now,
  });
  if (options.oauth) {
    await db.insert(oauthAccounts).values({ ...options.oauth, userId, createdAt: now });
  }
  const token = randomToken(32);
  await db.insert(sessions).values({
    id: await sessionIdFor(token),
    userId,
    createdAt: now,
    expiresAt: options.sessionExpiresAt ?? now + ACCOUNT_SESSION_TTL_SECONDS * 1000,
  });
  return { userId, handle, cookie: `${ACCOUNT_COOKIE_HEADER_NAME}=${token}`, token };
}

export interface AccountRequestInit {
  method?: string;
  /** Vai como JSON. */
  body?: unknown;
  cookie?: string;
  /** Origem enviada nos métodos que mudam estado. Padrão: a do Worker; `null` = sem cabeçalho. */
  origin?: string | null;
  headers?: Record<string, string>;
  ip?: string;
  /** Ambiente extra (ex.: OAUTH_TEST_ENV). */
  env?: Partial<AppEnv>;
}

/** Chamada à API como o navegador faria (mesma origem nos métodos que mudam estado). */
export function accountRequest(path: string, init: AccountRequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip ?? randomIp());
  if (init.cookie) headers.set("Cookie", init.cookie);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (method !== "GET" && origin !== null && !headers.has("Origin")) headers.set("Origin", origin);
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.body);
  }
  const request = new Request(`${ORIGIN}${path}`, { method, headers, body, redirect: "manual" });
  return fetchWithEnv(request, init.env ?? {});
}

/** Todos os `nome=valor` dos Set-Cookie da resposta, por nome. */
export function setCookies(response: Response): Map<string, { value: string; raw: string }> {
  const result = new Map<string, { value: string; raw: string }>();
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const index = pair!.indexOf("=");
    result.set(pair!.slice(0, index), { value: pair!.slice(index + 1), raw });
  }
  return result;
}

// ---------- Login simulado ----------

export interface FakeProfile {
  /** Corpo devolvido pelo endpoint de perfil do provedor. */
  body: Record<string, unknown>;
  /** Status do endpoint de token (padrão 200). */
  tokenStatus?: number;
}

/**
 * Simula os endpoints de token e de perfil do Google e do Discord. O `code` do callback escolhe o
 * perfil em `profiles`; o token de acesso devolvido é `at-<code>`. Guarda as requisições recebidas.
 */
export function fakeOAuthProviders(profiles: Record<string, FakeProfile>) {
  const calls: { url: string; body: string; authorization: string | null }[] = [];
  const handler = async (url: string, init: RequestInit | undefined, request?: Request) => {
    const body = request
      ? new TextDecoder().decode(await request.clone().arrayBuffer())
      : typeof init?.body === "string"
        ? init.body
        : "";
    const headers = new Headers(request?.headers ?? init?.headers);
    calls.push({ url, body, authorization: headers.get("Authorization") });
    if (url === GOOGLE_TOKEN_URL || url === DISCORD_TOKEN_URL) {
      const code = new URLSearchParams(body).get("code") ?? "";
      const profile = profiles[code];
      if (!profile) return Response.json({ error: "invalid_grant" }, { status: 400 });
      if (profile.tokenStatus && profile.tokenStatus !== 200) {
        return Response.json({ error: "invalid_grant" }, { status: profile.tokenStatus });
      }
      return Response.json({ access_token: `at-${code}`, token_type: "Bearer", expires_in: 3600 });
    }
    if (url === GOOGLE_USERINFO_URL || url === DISCORD_USER_URL) {
      const code = (headers.get("Authorization") ?? "").replace(/^Bearer at-/, "");
      const profile = profiles[code];
      if (!profile) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json(profile.body);
    }
    throw new Error(`fetch inesperado nos testes: ${url}`);
  };
  return { handler, calls };
}

/** Começa o login: devolve a URL do provedor e o cookie do fluxo (state + PKCE + returnTo). */
export async function startLogin(provider: AuthProvider, returnTo?: string) {
  const query = returnTo === undefined ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  const response = await accountRequest(`/api/auth/${provider}/start${query}`, { env: OAUTH_TEST_ENV });
  const location = new URL(response.headers.get("Location") ?? "about:blank");
  const flowCookie = [...setCookies(response)].map(([name, { value }]) => `${name}=${value}`).join("; ");
  return { response, location, state: location.searchParams.get("state") ?? "", flowCookie };
}

/** Faz o login completo com o `code` dado (o perfil vem de `fakeOAuthProviders`). */
export async function completeLogin(
  provider: AuthProvider,
  code: string,
  options: { returnTo?: string; state?: string; cookie?: string } = {},
) {
  const start = await startLogin(provider, options.returnTo);
  const state = options.state ?? start.state;
  const cookie = [start.flowCookie, options.cookie].filter(Boolean).join("; ");
  const response = await accountRequest(
    `/api/auth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { cookie, env: OAUTH_TEST_ENV },
  );
  const account = setCookies(response).get(ACCOUNT_COOKIE_HEADER_NAME);
  return {
    response,
    location: response.headers.get("Location"),
    accountCookie: account?.value ? `${ACCOUNT_COOKIE_HEADER_NAME}=${account.value}` : null,
  };
}
