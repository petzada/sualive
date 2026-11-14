/**
 * Ponto único que as telas importam para carteira, loja e presentes: `useWallet` e os tipos do
 * contrato. Um só estado para a aplicação inteira, que segue a conta logada.
 */
import { getWalletStore } from "./shared";
import type { UseWallet } from "./types";
import { createUseWallet } from "./use-wallet";

export type * from "./types";

export const useWallet: UseWallet = createUseWallet(getWalletStore);
