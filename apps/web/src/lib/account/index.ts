/**
 * Ponto único que as telas importam para conta, perfil e Plus: `useAccount` e os tipos do contrato.
 * Um só carregamento de /api/me para a aplicação inteira (sem provedor de contexto).
 */
import { getAccountStore } from "./shared";
import type { UseAccount } from "./types";
import { createUseAccount } from "./use-account";

export type * from "./types";

export const useAccount: UseAccount = createUseAccount(getAccountStore);
