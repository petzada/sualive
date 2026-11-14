/**
 * A carteira da aplicação inteira: um só `WalletStore`, criado no primeiro uso (não ao importar, para
 * os testes das telas não abrirem nada), ligado ao store compartilhado da conta.
 */
import { getAccountStore } from "../account/shared";
import { browserWalletDeps } from "./deps";
import { WalletStore } from "./store";

let store: WalletStore | null = null;

export function getWalletStore(): WalletStore {
  store ??= new WalletStore(browserWalletDeps(getAccountStore()));
  return store;
}
