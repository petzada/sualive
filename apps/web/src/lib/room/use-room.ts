import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createRoomApi, type ApiFailure } from "./api";
import { RoomClient } from "./client";
import type { RoomDeps } from "./deps";
import { saveOwnerToken } from "./owner-token";
import type { CreateRoom, CreateRoomFailure, UseRoom } from "./types";

/** Hook fino sobre o `RoomClient`. `getDeps` é chamado uma vez por sala aberta. */
export function createUseRoom(getDeps: () => RoomDeps): UseRoom {
  return function useRoom(code) {
    // Sem efeitos no construtor: o StrictMode pode criar e descartar um cliente à toa.
    const client = useMemo(() => new RoomClient(code, getDeps()), [code]);
    useEffect(() => {
      client.retain();
      return () => client.release();
    }, [client]);
    const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
    return useMemo(() => ({ state, actions: client.actions }), [state, client]);
  };
}

/** Código da API → motivo que a tela entende. */
function createFailure(error: ApiFailure): CreateRoomFailure {
  switch (error) {
    case "turnstile_failed":
      return "turnstileFailed";
    case "rate_limited":
      return "rateLimited";
    case "plus_required":
      return "plusRequired";
    case "insufficient_funds":
      return "insufficientFunds";
    case "protected_unavailable":
      return "protectedUnavailable";
    case "unauthorized":
    case "onboarding_required":
      return "unauthorized";
    default:
      return "error";
  }
}

export function createRoomWith(getDeps: () => Pick<RoomDeps, "fetch" | "storage">): CreateRoom {
  return async (turnstileToken, options) => {
    const deps = getDeps();
    const body = options?.protected ? { turnstileToken, protected: true } : { turnstileToken };
    const result = await createRoomApi(deps.fetch).createRoom(body);
    if (!result.ok) return { ok: false, reason: createFailure(result.error) };
    saveOwnerToken(deps.storage, result.data.code, result.data.ownerToken);
    return { ok: true, code: result.data.code };
  };
}
