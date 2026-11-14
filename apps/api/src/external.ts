import { captureException } from "@sentry/cloudflare";
import { TURN_CREDENTIAL_TTL_SECONDS } from "@sualive/config";
import { iceServersResponseSchema, type IceServersResponse } from "@sualive/protocol";
import type { AppEnv } from "./env";

/** Chamadas a serviços da Cloudflare fora do Worker: Turnstile e TURN. */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURN_API_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys";
/** STUN público da Cloudflare: usado sozinho quando não há chave de TURN. */
export const CLOUDFLARE_STUN_URL = "stun:stun.cloudflare.com:3478";

/** Valida o token do Turnstile no servidor. `false` se recusado ou se o serviço falhar. */
export async function verifyTurnstile(env: AppEnv, token: string, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) throw new Error("TURNSTILE_SECRET_KEY ausente");
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return (
      typeof result === "object" && result !== null && (result as { success?: unknown }).success === true
    );
  } catch (error) {
    captureException(error);
    return false;
  }
}

function stunOnly(): IceServersResponse {
  return {
    iceServers: [{ urls: CLOUDFLARE_STUN_URL }],
    ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS,
    relayOnly: false,
  };
}

/** A porta alternativa 53 é bloqueada pelos navegadores (só faz o ICE esperar o tempo limite). */
function withoutPort53(urls: string | string[]): string[] {
  return (Array.isArray(urls) ? urls : [urls]).filter((url) => !/:53(\?|$)/.test(url));
}

/**
 * Servidores ICE: credenciais de TURN de curta duração geradas pela API Realtime TURN da
 * Cloudflare (a chave nunca sai do Worker). Sem a chave configurada, ou se a API falhar, devolve
 * só o STUN público.
 */
export async function generateIceServers(env: AppEnv): Promise<IceServersResponse> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return stunOnly();
  try {
    const response = await fetch(
      `${TURN_API_BASE}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
      },
    );
    if (!response.ok) throw new Error(`TURN API respondeu ${response.status}`);
    const parsed = iceServersResponseSchema.shape.iceServers.parse(
      ((await response.json()) as { iceServers?: unknown }).iceServers,
    );
    const iceServers = parsed
      .map((server) => ({ ...server, urls: withoutPort53(server.urls) }))
      .filter((server) => server.urls.length > 0);
    return iceServersResponseSchema.parse({
      iceServers,
      ttlSeconds: TURN_CREDENTIAL_TTL_SECONDS,
      relayOnly: false,
    });
  } catch (error) {
    captureException(error);
    return stunOnly();
  }
}
