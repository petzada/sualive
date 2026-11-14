/**
 * Ponto único que as telas importam para conta, perfil e Plus. A implementação é da tarefa
 * "cliente do front" da entrega 2; até ela entrar, a função existe só para as telas compilarem.
 */
import type { UseAccount } from "./types";

export type * from "./types";

export const useAccount: UseAccount = () => {
  throw new Error("useAccount is not implemented yet");
};
