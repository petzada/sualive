import { GOLD_GIFT_DAILY_LIMIT, GOLD_PACKS } from "@sualive/config";
import type { GoldCheckoutResponse, LedgerEntry, ShopItem, WalletResponse } from "@sualive/protocol";
import { vi } from "vitest";
import type { Mock } from "vitest";
import type { WalletClient } from "../components/wallet/WalletClient";
import type { PaymentStatus, WalletActions, WalletState } from "../lib/wallet";

/** Balances of an account (welcome silver plus some gold, nothing sent today). */
export function makeWallet(overrides: Partial<WalletResponse> = {}): WalletResponse {
  return {
    silver: 300,
    gold: 1000,
    goldSentToday: 0,
    goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
    ...overrides,
  };
}

export function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "l1",
    currency: "silver",
    amount: 300,
    reason: "welcome",
    counterpartHandle: null,
    itemName: null,
    createdAt: Date.now() - 60_000,
    ...overrides,
  };
}

/** A name color not owned yet; pass `kind` and `data` for the other kinds. */
export function makeShopItem(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: "name_color_red",
    kind: "name_color",
    name: "Vermelho",
    price: 100,
    data: { light: ["#b42318"], dark: ["#f97066"] },
    owned: false,
    equipped: false,
    ...overrides,
  };
}

export function makeGoldCheckout(overrides: Partial<GoldCheckoutResponse> = {}): GoldCheckoutResponse {
  const pack = GOLD_PACKS[0];
  return {
    paymentId: "gold-pay-1",
    packId: pack.id,
    gold: pack.gold,
    amountCents: pack.priceCents,
    brCode: "00020126580014br.gov.bcb.pix-test",
    qrCodeImageUrl: "https://example.test/qr.png",
    expiresAt: Date.now() + 15 * 60 * 1000,
    ...overrides,
  };
}

/** Nothing loaded yet; pass `wallet`, `ledger` or `shop` for the loaded parts. */
export function makeWalletState(overrides: Partial<WalletState> = {}): WalletState {
  return {
    status: overrides.wallet ? "ready" : "idle",
    wallet: null,
    ledger: { status: "idle", entries: [], hasMore: false, loadingMore: false },
    shop: { status: "idle", items: [] },
    goldPacks: GOLD_PACKS,
    ...overrides,
  };
}

/** Balances, a statement page and a small catalog, all loaded. */
export function makeLoadedWalletState(overrides: Partial<WalletState> = {}): WalletState {
  return makeWalletState({
    status: "ready",
    wallet: makeWallet(),
    ledger: {
      status: "ready",
      entries: [
        makeLedgerEntry({
          id: "l2",
          currency: "gold",
          amount: -100,
          reason: "gift_sent",
          counterpartHandle: "caio",
        }),
        makeLedgerEntry(),
      ],
      hasMore: false,
      loadingMore: false,
    },
    shop: {
      status: "ready",
      items: [
        makeShopItem(),
        makeShopItem({ id: "frame_gold", kind: "avatar_frame", name: "Dourada", price: 300, owned: true }),
        makeShopItem({
          id: "reactions_party",
          kind: "reaction_pack",
          name: "Festa",
          price: 400,
          data: { reactions: ["🥳", "🎊"] },
          owned: true,
          equipped: true,
        }),
      ],
    },
    ...overrides,
  });
}

export type WalletActionMocks = { [K in keyof WalletActions]: Mock<WalletActions[K]> } & {
  /** Drives the gold payment that the screen is following, as the watcher would. */
  emitGoldPayment: (status: PaymentStatus) => void;
  /** Called when the screen stops following the payment. */
  stopWatchingGold: Mock<() => void>;
};

/** Every action succeeds by default. */
export function makeWalletActions(): WalletActionMocks {
  let listener: ((status: PaymentStatus) => void) | null = null;
  const stopWatchingGold = vi.fn<() => void>();
  const ok = () => Promise.resolve({ ok: true as const, value: undefined });
  return {
    load: vi.fn<WalletActions["load"]>(() => Promise.resolve()),
    loadLedger: vi.fn<WalletActions["loadLedger"]>(() => Promise.resolve()),
    loadMoreLedger: vi.fn<WalletActions["loadMoreLedger"]>(() => Promise.resolve()),
    loadShop: vi.fn<WalletActions["loadShop"]>(() => Promise.resolve()),
    startGoldCheckout: vi.fn<WalletActions["startGoldCheckout"]>(({ packId }) => {
      const pack = GOLD_PACKS.find((candidate) => candidate.id === packId) ?? GOLD_PACKS[0];
      return Promise.resolve({
        ok: true,
        value: makeGoldCheckout({ packId: pack.id, gold: pack.gold, amountCents: pack.priceCents }),
      });
    }),
    watchGoldPayment: vi.fn<WalletActions["watchGoldPayment"]>((_paymentId, onChange) => {
      listener = onChange;
      return stopWatchingGold;
    }),
    sendGold: vi.fn<WalletActions["sendGold"]>(ok),
    giftPlus: vi.fn<WalletActions["giftPlus"]>(ok),
    buyItem: vi.fn<WalletActions["buyItem"]>(ok),
    setEquipped: vi.fn<WalletActions["setEquipped"]>(ok),
    refresh: vi.fn<WalletActions["refresh"]>(() => Promise.resolve()),
    emitGoldPayment: (status) => listener?.(status),
    stopWatchingGold,
  };
}

/** A fake wallet client with a fixed state. */
export function makeWalletClient(
  state: WalletState = makeWalletState(),
  actions: WalletActions = makeWalletActions(),
): WalletClient {
  return { useWallet: () => ({ state, actions }) };
}
