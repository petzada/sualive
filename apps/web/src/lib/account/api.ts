/**
 * Cliente HTTP da conta, do login e do Plus. Toda resposta passa pelos esquemas de
 * `@sualive/protocol`; nada chega ao resto do código sem validação.
 */
import {
  apiErrorSchema,
  handleAvailabilityResponseSchema,
  meResponseSchema,
  meUserSchema,
  planSchema,
  plusCheckoutResponseSchema,
  plusPaymentResponseSchema,
  type ApiErrorCode,
  type HandleAvailabilityResponse,
  type MeResponse,
  type MeUser,
  type OnboardingRequest,
  type Plan,
  type PlusCheckoutRequest,
  type PlusCheckoutResponse,
  type PlusPaymentResponse,
  type UpdateMeRequest,
} from "@sualive/protocol";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Motivo da falha: um código da API ou um problema do lado do cliente (`network` = sem resposta,
 * `invalid_response` = resposta fora do esquema, `aborted` = cancelado por quem pediu).
 */
export type AccountApiFailure = ApiErrorCode | "network" | "invalid_response" | "aborted";

export type AccountApiResult<T> = { ok: true; data: T } | { ok: false; error: AccountApiFailure };

/** O pedaço de um esquema do zod que o cliente usa. */
export interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Resposta sem corpo (204). */
export const NO_CONTENT = Symbol("no content");

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type JsonRequest = <T>(
  path: string,
  schema: Schema<T> | typeof NO_CONTENT,
  init: { method: Method; body?: unknown; signal?: AbortSignal },
) => Promise<AccountApiResult<T>>;

/**
 * Pedido JSON à API do mesmo site: valida a resposta pelo esquema e traduz o erro para o código da
 * API (também usado pelo cliente da carteira).
 */
export function createJsonRequest(fetchImpl: FetchLike): JsonRequest {
  return async function request<T>(
    path: string,
    schema: Schema<T> | typeof NO_CONTENT,
    init: { method: Method; body?: unknown; signal?: AbortSignal },
  ): Promise<AccountApiResult<T>> {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        method: init.method,
        credentials: "same-origin",
        headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch {
      return { ok: false, error: init.signal?.aborted ? "aborted" : "network" };
    }

    if (response.ok && schema === NO_CONTENT) return { ok: true, data: undefined as T };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (init.signal?.aborted) return { ok: false, error: "aborted" };
      body = undefined;
    }

    if (response.ok && schema !== NO_CONTENT) {
      const parsed = schema.safeParse(body);
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "invalid_response" };
    }
    const error = apiErrorSchema.safeParse(body);
    return { ok: false, error: error.success ? error.data.error : "invalid_response" };
  };
}

export interface AccountApi {
  getMe(signal?: AbortSignal): Promise<AccountApiResult<MeResponse>>;
  logout(): Promise<AccountApiResult<void>>;
  completeOnboarding(body: OnboardingRequest): Promise<AccountApiResult<MeUser>>;
  updateMe(body: UpdateMeRequest): Promise<AccountApiResult<MeUser>>;
  markTermsSeen(): Promise<AccountApiResult<MeUser>>;
  deleteMe(): Promise<AccountApiResult<void>>;
  checkHandle(handle: string): Promise<AccountApiResult<HandleAvailabilityResponse>>;
  startCheckout(body: PlusCheckoutRequest): Promise<AccountApiResult<PlusCheckoutResponse>>;
  getPayment(paymentId: string, signal?: AbortSignal): Promise<AccountApiResult<PlusPaymentResponse>>;
  cancelPlus(): Promise<AccountApiResult<Plan>>;
}

export function createAccountApi(fetchImpl: FetchLike): AccountApi {
  const request = createJsonRequest(fetchImpl);

  return {
    getMe: (signal) => request("/api/me", meResponseSchema, { method: "GET", signal }),
    logout: () => request("/api/auth/logout", NO_CONTENT, { method: "POST" }),
    completeOnboarding: (body) => request("/api/me/onboarding", meUserSchema, { method: "POST", body }),
    updateMe: (body) => request("/api/me", meUserSchema, { method: "PATCH", body }),
    markTermsSeen: () => request("/api/me/terms-seen", meUserSchema, { method: "POST" }),
    deleteMe: () => request("/api/me", NO_CONTENT, { method: "DELETE" }),
    checkHandle: (handle) =>
      request(`/api/handles/${encodeURIComponent(handle)}`, handleAvailabilityResponseSchema, {
        method: "GET",
      }),
    startCheckout: (body) =>
      request("/api/plus/checkout", plusCheckoutResponseSchema, { method: "POST", body }),
    getPayment: (paymentId, signal) =>
      request(`/api/plus/payments/${encodeURIComponent(paymentId)}`, plusPaymentResponseSchema, {
        method: "GET",
        signal,
      }),
    cancelPlus: () => request("/api/plus/cancel", planSchema, { method: "POST" }),
  };
}
