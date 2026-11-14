import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useWallet } from "../../lib/wallet";
import type { UseWallet } from "../../lib/wallet";

/**
 * The wallet client the screens talk to (balances, statement, shop, gifts). Defaults to the real one
 * from `lib/wallet`; tests and the dev-only demo swap it for a fake through the provider (same idea
 * as `AccountClientProvider`).
 */
export interface WalletClient {
  useWallet: UseWallet;
}

const WalletClientContext = createContext<WalletClient>({ useWallet });

export function WalletClientProvider({ client, children }: { client: WalletClient; children: ReactNode }) {
  return <WalletClientContext value={client}>{children}</WalletClientContext>;
}

export function useWalletClient(): WalletClient {
  return useContext(WalletClientContext);
}
