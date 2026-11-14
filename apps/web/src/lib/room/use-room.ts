import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createRoomApi } from "./api";
import { RoomClient } from "./client";
import type { RoomDeps } from "./deps";
import { saveOwnerToken } from "./owner-token";
import type { CreateRoom, UseRoom } from "./types";

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

export function createRoomWith(getDeps: () => Pick<RoomDeps, "fetch" | "storage">): CreateRoom {
  return async (turnstileToken) => {
    const deps = getDeps();
    const result = await createRoomApi(deps.fetch).createRoom({ turnstileToken });
    if (!result.ok) {
      if (result.error === "turnstile_failed") return { ok: false, reason: "turnstileFailed" };
      if (result.error === "rate_limited") return { ok: false, reason: "rateLimited" };
      return { ok: false, reason: "error" };
    }
    saveOwnerToken(deps.storage, result.data.code, result.data.ownerToken);
    return { ok: true, code: result.data.code };
  };
}
