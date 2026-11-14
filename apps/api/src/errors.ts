import type { ApiErrorCode } from "@sualive/protocol";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";

/** Status HTTP de cada erro da API. Único mapa: um erro tem o mesmo status em toda a API. */
export const ERROR_STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
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

/** Resposta de erro da API: `{ error }` com o status do mapa. */
export function apiError(c: Context<{ Bindings: AppEnv }>, error: ApiErrorCode): Response {
  return c.json({ error }, ERROR_STATUS[error]);
}
