/**
 * Tudo o que o núcleo da carteira usa do navegador e da conta, injetado. Os testes trocam cada peça
 * por um dublê; `browserWalletDeps` liga as peças reais.
 */
import { browserAccountDeps, type AccountDeps } from "../account/deps";
import type { AccountState } from "../account/types";

/** A conta logada, vista pela carteira (o `AccountStore` compartilhado serve). */
export interface WalletAccountSource {
  getSnapshot(): AccountState;
  /** Avisa a cada mudança da conta. Devolve a função que cancela. */
  subscribe(listener: () => void): () => void;
  /** Consulta a conta de novo (o servidor recusou por sessão perdida ou falta do primeiro acesso). */
  refresh(): Promise<void>;
}

export interface WalletDeps extends AccountDeps {
  account: WalletAccountSource;
}

export function browserWalletDeps(account: WalletAccountSource): WalletDeps {
  return { ...browserAccountDeps(), account };
}
