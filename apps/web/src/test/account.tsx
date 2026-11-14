import type { MeUser, Plan, PlusCheckoutResponse } from "@sualive/protocol";
import { vi } from "vitest";
import type { Mock } from "vitest";
import type { AccountClient } from "../components/account/AccountClient";
import type { AccountActions, AccountState, PaymentStatus } from "../lib/account";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function makePlan(overrides: Partial<Plan> = {}): Plan {
  return { status: "none", plus: false, cycle: null, periodEnd: null, renews: false, ...overrides };
}

/** A monthly Plus in good standing, renewing in 20 days. */
export function makeActivePlan(overrides: Partial<Plan> = {}): Plan {
  return makePlan({
    status: "active",
    plus: true,
    cycle: "monthly",
    periodEnd: Date.now() + 20 * DAY_MS,
    renews: true,
    ...overrides,
  });
}

export function makeUser(overrides: Partial<MeUser> = {}): MeUser {
  return {
    id: "u1",
    handle: "marina",
    nickname: "Marina",
    avatarUrl: null,
    onboarded: true,
    badges: [],
    plan: makePlan(),
    roomTheme: "default",
    handleChangeAvailableAt: null,
    ...overrides,
  };
}

/** Anonymous by default; pass `user` for a logged account. */
export function makeAccountState(overrides: Partial<AccountState> = {}): AccountState {
  const user = overrides.user ?? null;
  return {
    status: user ? "authenticated" : "anonymous",
    user,
    providers: ["google", "discord"],
    billingEnabled: true,
    ...overrides,
  };
}

export function makeCheckout(overrides: Partial<PlusCheckoutResponse> = {}): PlusCheckoutResponse {
  return {
    paymentId: "pay-1",
    cycle: "monthly",
    amountCents: 1990,
    brCode: "00020126580014br.gov.bcb.pix-test",
    qrCodeImageUrl: "https://example.test/qr.png",
    expiresAt: Date.now() + 15 * 60 * 1000,
    ...overrides,
  };
}

export type AccountActionMocks = { [K in keyof AccountActions]: Mock<AccountActions[K]> } & {
  /** Drives the payment that the screen is following, as the watcher would. */
  emitPayment: (status: PaymentStatus) => void;
  /** Called when the screen stops following the payment. */
  stopWatching: Mock<() => void>;
};

export function makeAccountActions(): AccountActionMocks {
  let listener: ((status: PaymentStatus) => void) | null = null;
  const stopWatching = vi.fn<() => void>();
  return {
    loginUrl: vi.fn<AccountActions["loginUrl"]>(
      (provider, returnTo) =>
        `/api/auth/${provider}/start${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`,
    ),
    logout: vi.fn<AccountActions["logout"]>(() => Promise.resolve()),
    refresh: vi.fn<AccountActions["refresh"]>(() => Promise.resolve()),
    completeOnboarding: vi.fn<AccountActions["completeOnboarding"]>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    ),
    updateProfile: vi.fn<AccountActions["updateProfile"]>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    ),
    checkHandle: vi.fn<AccountActions["checkHandle"]>(() =>
      Promise.resolve({ ok: true, value: { available: true } }),
    ),
    deleteAccount: vi.fn<AccountActions["deleteAccount"]>(() =>
      Promise.resolve({ ok: true, value: undefined }),
    ),
    startPlusCheckout: vi.fn<AccountActions["startPlusCheckout"]>(({ cycle }) =>
      Promise.resolve({ ok: true, value: makeCheckout({ cycle }) }),
    ),
    watchPlusPayment: vi.fn<AccountActions["watchPlusPayment"]>((_paymentId, onChange) => {
      listener = onChange;
      return stopWatching;
    }),
    cancelPlus: vi.fn<AccountActions["cancelPlus"]>(() =>
      Promise.resolve({
        ok: true,
        value: makePlan({
          status: "canceled",
          plus: true,
          cycle: "monthly",
          periodEnd: Date.now() + 20 * DAY_MS,
        }),
      }),
    ),
    emitPayment: (status) => listener?.(status),
    stopWatching,
  };
}

/** A fake account client with a fixed state. */
export function makeAccountClient(
  state: AccountState = makeAccountState(),
  actions: AccountActions = makeAccountActions(),
): AccountClient {
  return { useAccount: () => ({ state, actions }) };
}
