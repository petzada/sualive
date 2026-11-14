import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { apiError } from "../errors";

export { apiError };

export type Env = { Bindings: AppEnv };
export type Ctx = Context<Env>;

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
