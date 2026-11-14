import type { AuthProvider } from "@sualive/protocol";
import { Discord, Google, type OAuth2Tokens } from "arctic";
import type { AppEnv } from "../env";

/** Endpoints de perfil (sem e-mail: os escopos pedidos não dão acesso a ele). */
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const DISCORD_USER_URL = "https://discord.com/api/users/@me";
export const DISCORD_AVATAR_BASE = "https://cdn.discordapp.com/avatars";

/** Escopos mínimos para identificar a pessoa e obter nome e avatar. Nada de e-mail. */
const SCOPES: Record<AuthProvider, string[]> = {
  google: ["openid", "profile"],
  discord: ["identify"],
};

const PROVIDERS: readonly AuthProvider[] = ["google", "discord"];

function credentials(env: AppEnv, provider: AuthProvider): { id: string; secret: string } | null {
  const id = provider === "google" ? env.GOOGLE_CLIENT_ID : env.DISCORD_CLIENT_ID;
  const secret = provider === "google" ? env.GOOGLE_CLIENT_SECRET : env.DISCORD_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Logins com credenciais neste ambiente. */
export function enabledProviders(env: AppEnv): AuthProvider[] {
  return PROVIDERS.filter((provider) => credentials(env, provider) !== null);
}

export interface OAuthClient {
  createAuthorizationURL(state: string, codeVerifier: string): URL;
  validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
}

/** Cliente OAuth (Arctic, com PKCE S256) do provedor, ou `null` se não houver credenciais. */
export function oauthClient(env: AppEnv, provider: AuthProvider, redirectUri: string): OAuthClient | null {
  const creds = credentials(env, provider);
  if (!creds) return null;
  const client =
    provider === "google"
      ? new Google(creds.id, creds.secret, redirectUri)
      : new Discord(creds.id, creds.secret, redirectUri);
  return {
    createAuthorizationURL: (state, codeVerifier) =>
      client.createAuthorizationURL(state, codeVerifier, SCOPES[provider]),
    validateAuthorizationCode: (code, codeVerifier) => client.validateAuthorizationCode(code, codeVerifier),
  };
}

/** O que se guarda do perfil do provedor: identificador, nome e avatar. Nunca e-mail. */
export interface ProviderProfile {
  providerUserId: string;
  /** Nomes candidatos ao apelido, na ordem de preferência. */
  names: string[];
  avatarUrl: string | null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function strings(...values: unknown[]): string[] {
  return values.filter((value): value is string => typeof value === "string");
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`perfil do provedor respondeu ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("perfil do provedor inválido");
  return body as Record<string, unknown>;
}

/** Lê o perfil no provedor com o token de acesso. Lança se a resposta não servir. */
export async function fetchProviderProfile(
  provider: AuthProvider,
  tokens: OAuth2Tokens,
): Promise<ProviderProfile> {
  const accessToken = tokens.accessToken();
  if (provider === "google") {
    const body = await getJson(GOOGLE_USERINFO_URL, accessToken);
    if (typeof body.sub !== "string" || !body.sub) throw new Error("perfil do Google sem sub");
    return {
      providerUserId: body.sub,
      names: strings(body.name, body.given_name),
      avatarUrl: httpsUrl(body.picture),
    };
  }
  const body = await getJson(DISCORD_USER_URL, accessToken);
  if (typeof body.id !== "string" || !/^\d{1,32}$/.test(body.id)) {
    throw new Error("perfil do Discord sem id");
  }
  const avatar =
    typeof body.avatar === "string" && /^(a_)?[0-9a-f]{1,64}$/.test(body.avatar)
      ? `${DISCORD_AVATAR_BASE}/${body.id}/${body.avatar}.png`
      : null;
  return {
    providerUserId: body.id,
    names: strings(body.global_name, body.username),
    avatarUrl: avatar,
  };
}
