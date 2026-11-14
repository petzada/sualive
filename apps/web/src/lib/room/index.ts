/**
 * Ponto único que as telas importam: `useRoom`, `createRoom` e os tipos do contrato. WebSocket,
 * API e mídia ficam no `RoomClient`; as peças do navegador vêm de `browserRoomDeps`.
 */
import { browserRoomDeps, type RoomDeps } from "./deps";
import type { CreateRoom, UseRoom } from "./types";
import { createRoomWith, createUseRoom } from "./use-room";

export type * from "./types";

let deps: RoomDeps | null = null;

/** Criadas na primeira sala, não ao importar (os testes das telas não abrem nada). */
function getBrowserDeps(): RoomDeps {
  deps ??= browserRoomDeps();
  return deps;
}

export const useRoom: UseRoom = createUseRoom(getBrowserDeps);

export const createRoom: CreateRoom = createRoomWith(getBrowserDeps);
