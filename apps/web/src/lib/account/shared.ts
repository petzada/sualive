/**
 * A conta da aplicação inteira: um só `AccountStore`, criado no primeiro uso (não ao importar, para
 * os testes das telas não abrirem nada). O cliente da sala recebe este mesmo store como fonte da
 * conta, sem importar React nem o hook.
 */
import { browserAccountDeps } from "./deps";
import { AccountStore } from "./store";

let store: AccountStore | null = null;

export function getAccountStore(): AccountStore {
  store ??= new AccountStore(browserAccountDeps());
  return store;
}
