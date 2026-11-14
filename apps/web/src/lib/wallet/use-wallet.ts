import { useMemo, useSyncExternalStore } from "react";
import type { WalletStore } from "./store";
import type { UseWallet } from "./types";

/** Hook fino sobre o `WalletStore` compartilhado. */
export function createUseWallet(getStore: () => WalletStore): UseWallet {
  return function useWallet() {
    const store = getStore();
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return useMemo(() => ({ state, actions: store.actions }), [state, store]);
  };
}
