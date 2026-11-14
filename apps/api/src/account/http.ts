import type { ApiErrorCode } from "@sualive/protocol";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";

export type Env = { Bindings: AppEnv };
export type Ctx = Context<Env>;

// Mesmo mapa de `rooms.ts` (que esta tarefa não altera): um erro tem o mesmo status em toda a API.
const ERROR_STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  turnstile_failed: 403,
  rate_limited: 429,
  room_ended: 410,
  room_full: 409,
  banned: 403,
  unauthorized: 401,
  not_found: 404,
  internal_error: 500,
  onboarding_required: 403,
  handle_taken: 409,
  handle_reserved: 409,
  handle_change_too_soon: 409,
  provider_unavailable: 404,
  plus_required: 403,
  billing_unavailable: 503,
  already_subscribed: 409,
};

export function apiError(c: Ctx, error: ApiErrorCode): Response {
  return c.json({ error }, ERROR_STATUS[error]);
}

export function clientIp(c: Ctx): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

export async function readJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Limite de requisições por IP com o mesmo binding das salas. O prefixo separa a cota: consultar
 * @nome não gasta a cota de criar ou entrar em sala.
 */
export function rateLimitByIp(prefix: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const { success } = await c.env.API_RATE_LIMITER.limit({ key: `${prefix}:ip:${clientIp(c)}` });
    if (!success) return apiError(c, "rate_limited");
    await next();
  };
}

/** O erro (ou a causa dele, como no DrizzleQueryError) é violação de índice único do SQLite. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      if (current.message.includes("UNIQUE constraint failed")) return true;
      current = current.cause;
    } else {
      return false;
    }
  }
  return false;
}
