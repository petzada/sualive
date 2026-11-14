import type { MiddlewareHandler } from "hono";
import { apiError, type Env } from "../account/http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF nas rotas que mudam estado com o cookie de conta, além do SameSite=Lax.
 * O navegador manda `Sec-Fetch-Site` e/ou `Origin` em todo POST/PATCH/DELETE: os que vierem precisam
 * dizer "mesma origem", e pelo menos um precisa vir. Requisição sem nenhum dos dois não vem de
 * navegador moderno e é recusada.
 */
export const sameOriginOnly: MiddlewareHandler<Env> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const fetchSite = c.req.header("Sec-Fetch-Site");
  const origin = c.req.header("Origin");
  if (fetchSite === undefined && origin === undefined) return apiError(c, "invalid_request");
  if (fetchSite !== undefined && fetchSite !== "same-origin") return apiError(c, "invalid_request");
  if (origin !== undefined && origin !== new URL(c.req.url).origin) {
    return apiError(c, "invalid_request");
  }
  await next();
};
