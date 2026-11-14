/**
 * Ponto único que as telas importam. A implementação (WebSocket, API e mídia) é da tarefa
 * "cliente da sala"; até ela entrar, as funções existem só para as telas compilarem.
 */
import type { CreateRoom, UseRoom } from "./types";

export type * from "./types";

export const useRoom: UseRoom = () => {
  throw new Error("useRoom is not implemented yet");
};

export const createRoom: CreateRoom = () => {
  throw new Error("createRoom is not implemented yet");
};
