/** Dublês para os testes da carteira: o servidor e o navegador da conta, mais uma conta controlável. */
import type { LedgerEntry, MeUser, ShopItem, WalletResponse } from "@sualive/protocol";
import { createAccountHarness, meUser, type AccountHarness } from "../../account/testing/fakes";
import type { AccountState } from "../../account/types";
import type { WalletAccountSource, WalletDeps } from "../deps";

export { meUser } from "../../account/testing/fakes";

/** Conta que o teste muda à mão (`set`), avisando quem assina, como o `AccountStore`. */
export class FakeAccount implements WalletAccountSource {
  state: AccountState;
  readonly listeners = new Set<() => void>();
  refreshes = 0;

  constructor(user: MeUser | null = meUser(), status?: AccountState["status"]) {
    this.state = FakeAccount.stateOf(user, status);
  }

  static stateOf(user: MeUser | null, status?: AccountState["status"]): AccountState {
    return {
      status: status ?? (user ? "authenticated" : "anonymous"),
      user,
      providers: ["google"],
      billingEnabled: true,
    };
  }

  set(user: MeUser | null, status?: AccountState["status"]): void {
    this.state = FakeAccount.stateOf(user, status);
    for (const listener of [...this.listeners]) listener();
  }

  readonly getSnapshot = (): AccountState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly refresh = (): Promise<void> => {
    this.refreshes += 1;
    return Promise.resolve();
  };
}

export interface WalletHarness extends Omit<AccountHarness, "deps"> {
  deps: WalletDeps;
  account: FakeAccount;
}

/** Usa os timers globais (os testes ligam `vi.useFakeTimers`). */
export function createWalletHarness(account: FakeAccount = new FakeAccount()): WalletHarness {
  const harness = createAccountHarness();
  return { ...harness, account, deps: { ...harness.deps, account } };
}

export function walletBody(overrides: Partial<WalletResponse> = {}): WalletResponse {
  return { silver: 300, gold: 1000, goldSentToday: 0, goldGiftDailyLimit: 2000, ...overrides };
}

export function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "l1",
    currency: "silver",
    amount: 300,
    reason: "welcome",
    counterpartHandle: null,
    itemName: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function shopItem(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: "color_red",
    kind: "name_color",
    name: "Vermelho",
    price: 100,
    data: { light: ["#cc0000"], dark: ["#ff6666"] },
    owned: false,
    equipped: false,
    ...overrides,
  };
}
