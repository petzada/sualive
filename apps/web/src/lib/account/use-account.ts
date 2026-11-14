import { useMemo, useSyncExternalStore } from "react";
import type { AccountStore } from "./store";
import type { UseAccount } from "./types";

/** Hook fino sobre o `AccountStore` compartilhado. */
export function createUseAccount(getStore: () => AccountStore): UseAccount {
  return function useAccount() {
    const store = getStore();
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(() => ({ state, actions: store.actions }), [state, store]);
  };
}
