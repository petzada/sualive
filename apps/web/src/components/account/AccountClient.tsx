import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAccount } from "../../lib/account";
import type { UseAccount } from "../../lib/account";

/**
 * The account client the screens talk to. Defaults to the real one from `lib/account`; tests and
 * the dev-only demo swap it for a fake through the provider (same idea as `RoomClientProvider`).
 */
export interface AccountClient {
  useAccount: UseAccount;
}

const AccountClientContext = createContext<AccountClient>({ useAccount });

export function AccountClientProvider({ client, children }: { client: AccountClient; children: ReactNode }) {
  return <AccountClientContext value={client}>{children}</AccountClientContext>;
}

export function useAccountClient(): AccountClient {
  return useContext(AccountClientContext);
}
