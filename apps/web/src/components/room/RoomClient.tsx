import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { createRoom, useRoom } from "../../lib/room";
import type { CreateRoom, UseRoom } from "../../lib/room";

/**
 * The room client the screens talk to. Defaults to the real one from `lib/room`; tests and the
 * dev-only demo swap it for a fake through the provider.
 */
export interface RoomClient {
  useRoom: UseRoom;
  createRoom: CreateRoom;
}

const RoomClientContext = createContext<RoomClient>({ useRoom, createRoom });

export function RoomClientProvider({ client, children }: { client: RoomClient; children: ReactNode }) {
  return <RoomClientContext value={client}>{children}</RoomClientContext>;
}

export function useRoomClient(): RoomClient {
  return useContext(RoomClientContext);
}
