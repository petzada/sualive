/**
 * Cliente HTTP da sala. Toda resposta passa pelos esquemas de `@sualive/protocol`; nada chega ao
 * resto do código sem validação.
 */
import {
  apiErrorSchema,
  createRoomResponseSchema,
  iceServersResponseSchema,
  joinRoomResponseSchema,
  roomInfoResponseSchema,
  type ApiErrorCode,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type IceServersResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type RoomInfoResponse,
} from "@sualive/protocol";

/**
 * Motivo da falha: um código da API ou um problema do lado do cliente (`network` = sem resposta,
 * `invalid_response` = resposta fora do esquema, `aborted` = cancelado por quem pediu).
 */
export type ApiFailure = ApiErrorCode | "network" | "invalid_response" | "aborted";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

/** O pedaço de um esquema do zod que o cliente usa (o web não depende do zod diretamente). */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RoomApi {
  createRoom(body: CreateRoomRequest, signal?: AbortSignal): Promise<ApiResult<CreateRoomResponse>>;
  getRoom(code: string, signal?: AbortSignal): Promise<ApiResult<RoomInfoResponse>>;
  joinRoom(code: string, body: JoinRoomRequest, signal?: AbortSignal): Promise<ApiResult<JoinRoomResponse>>;
  getIceServers(code: string, signal?: AbortSignal): Promise<ApiResult<IceServersResponse>>;
}

const ROOMS_PATH = "/api/rooms";

function roomPath(code: string, suffix = ""): string {
  return `${ROOMS_PATH}/${encodeURIComponent(code)}${suffix}`;
}

export function createRoomApi(fetchImpl: FetchLike): RoomApi {
  async function request<T>(
    path: string,
    schema: Schema<T>,
    init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
  ): Promise<ApiResult<T>> {
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

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (init.signal?.aborted) return { ok: false, error: "aborted" };
      body = undefined;
    }

    if (response.ok) {
      const parsed = schema.safeParse(body);
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "invalid_response" };
    }
    const error = apiErrorSchema.safeParse(body);
    return { ok: false, error: error.success ? error.data.error : "invalid_response" };
  }

  return {
    createRoom: (body, signal) =>
      request(ROOMS_PATH, createRoomResponseSchema, { method: "POST", body, signal }),
    getRoom: (code, signal) => request(roomPath(code), roomInfoResponseSchema, { method: "GET", signal }),
    joinRoom: (code, body, signal) =>
      request(roomPath(code, "/join"), joinRoomResponseSchema, { method: "POST", body, signal }),
    getIceServers: (code, signal) =>
      request(roomPath(code, "/ice"), iceServersResponseSchema, { method: "GET", signal }),
  };
}
