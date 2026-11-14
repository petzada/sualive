import { authProviderSchema, type AuthProvider } from "@sualive/protocol";
import { generateCodeVerifier, generateState } from "arctic";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { captureMessage } from "@sentry/cloudflare";
import { recordAccess } from "../access/log";
import { apiError, clientIp, type Ctx, type Env } from "../account/http";
import { findOrCreateUser } from "../account/users";
import { safeEqual } from "../crypto";
import { sameOriginOnly } from "./csrf";
import { fetchProviderProfile, oauthClient } from "./providers";
import { clearAccountCookie, createAccountSession, deleteAccountSession, setAccountCookie } from "./session";
import { isOnboarded } from "./viewer";

/** Para onde vai quem falhou no login (state inválido, pessoa negou, erro do provedor). */
export const LOGIN_FAILURE_PATH = "/entrar?erro=login";
/** Primeiro acesso ainda não concluído. */
export const ONBOARDING_PATH = "/boas-vindas";

/** Cookie de curta duração com o state, o code_verifier (PKCE) e o returnTo, entre start e callback. */
export const OAUTH_COOKIE_NAME = "sualive_oauth";
export const OAUTH_COOKIE_HEADER_NAME = `__Host-${OAUTH_COOKIE_NAME}`;
const OAUTH_COOKIE_TTL_SECONDS = 10 * 60;
const RETURN_TO_MAX_LENGTH = 512;

interface OAuthFlow {
  provider: AuthProvider;
  state: string;
  codeVerifier: string;
  returnTo: string;
  issuedAt: number;
}

/**
 * Só caminho local: começa com "/" e não com "//" nem "/\". Caracteres de controle e espaços são
 * recusados (o navegador ignora tab e quebra de linha, e "/\t/x" viraria "//x"). Senão, "/".
 */
export function safeReturnTo(value: string | undefined | null): string {
  if (!value || value.length > RETURN_TO_MAX_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\s\p{Cc}\\]/u.test(value)) return "/";
  return value;
}

function sessionSecret(c: Ctx): string {
  if (!c.env.SESSION_SECRET) throw new Error("SESSION_SECRET ausente");
  return c.env.SESSION_SECRET;
}

function redirectUri(c: Ctx, provider: AuthProvider): string {
  return `${new URL(c.req.url).origin}/api/auth/${provider}/callback`;
}

async function readOAuthFlow(c: Ctx): Promise<OAuthFlow | null> {
  const raw = await getSignedCookie(c, sessionSecret(c), OAUTH_COOKIE_NAME, "host");
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { provider, state, codeVerifier, returnTo, issuedAt } = value as Record<string, unknown>;
  const parsedProvider = authProviderSchema.safeParse(provider);
  if (!parsedProvider.success) return null;
  if (typeof state !== "string" || typeof codeVerifier !== "string") return null;
  if (typeof returnTo !== "string" || typeof issuedAt !== "number") return null;
  const age = Date.now() - issuedAt;
  if (age < 0 || age > OAUTH_COOKIE_TTL_SECONDS * 1000) return null;
  return { provider: parsedProvider.data, state, codeVerifier, returnTo: safeReturnTo(returnTo), issuedAt };
}

function clearOAuthFlow(c: Ctx): void {
  deleteCookie(c, OAUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    prefix: "host",
  });
}

export const auth = new Hono<Env>();

auth.get("/:provider/start", async (c) => {
  const provider = authProviderSchema.safeParse(c.req.param("provider"));
  if (!provider.success) return apiError(c, "provider_unavailable");
  const client = oauthClient(c.env, provider.data, redirectUri(c, provider.data));
  if (!client) return apiError(c, "provider_unavailable");

  const flow: OAuthFlow = {
    provider: provider.data,
    state: generateState(),
    codeVerifier: generateCodeVerifier(),
    returnTo: safeReturnTo(c.req.query("returnTo")),
    issuedAt: Date.now(),
  };
  // SameSite=Lax: o cookie volta na navegação de topo vinda do provedor para o callback.
  await setSignedCookie(c, OAUTH_COOKIE_NAME, JSON.stringify(flow), sessionSecret(c), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: OAUTH_COOKIE_TTL_SECONDS,
    prefix: "host",
  });
  c.header("Cache-Control", "no-store");
  return c.redirect(client.createAuthorizationURL(flow.state, flow.codeVerifier).toString(), 302);
});

auth.get("/:provider/callback", async (c) => {
  c.header("Cache-Control", "no-store");
  const flow = await readOAuthFlow(c);
  clearOAuthFlow(c);
  const fail = () => c.redirect(LOGIN_FAILURE_PATH, 302);

  const provider = authProviderSchema.safeParse(c.req.param("provider"));
  if (!provider.success || !flow || flow.provider !== provider.data) return fail();
  const state = c.req.query("state");
  const code = c.req.query("code");
  // Pessoa negou ou o provedor devolveu erro: vem `error` e não vem `code`.
  if (!state || !code || c.req.query("error") || !safeEqual(state, flow.state)) return fail();
  const client = oauthClient(c.env, provider.data, redirectUri(c, provider.data));
  if (!client) return fail();

  let profile;
  try {
    const tokens = await client.validateAuthorizationCode(code, flow.codeVerifier);
    profile = await fetchProviderProfile(provider.data, tokens);
  } catch (error) {
    // Só o tipo do erro: nada de código, token ou resposta do provedor no registro.
    console.warn("login recusado pelo provedor", provider.data, error instanceof Error ? error.name : "erro");
    return fail();
  }

  const user = await findOrCreateUser(c.env, provider.data, profile);
  // Sessão nova a cada login; a anterior deste navegador (se houver) deixa de valer.
  await deleteAccountSession(c);
  setAccountCookie(c, await createAccountSession(c.env, user.id));
  // Registro de acesso (Marco Civil): conta, IP, data e hora do login. Não impede o login.
  try {
    await recordAccess(c.env, {
      kind: "login",
      userId: user.id,
      sessionId: null,
      ip: clientIp(c),
      now: Date.now(),
    });
  } catch {
    captureMessage("registro de acesso: falha ao gravar o login", "error");
  }

  if (!isOnboarded(user)) {
    return c.redirect(`${ONBOARDING_PATH}?returnTo=${encodeURIComponent(flow.returnTo)}`, 302);
  }
  return c.redirect(flow.returnTo, 302);
});

auth.post("/logout", sameOriginOnly, async (c) => {
  await deleteAccountSession(c);
  clearAccountCookie(c);
  return c.body(null, 204);
});
