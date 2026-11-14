/**
 * Fake wallet client for the dev-only demo. Nothing here talks to a server: balances, statement and
 * shop live in memory, every action edits them with the same rules the server applies, and a reload
 * goes back to the start.
 */
import {
  GOLD_GIFT_DAILY_LIMIT,
  GOLD_PACKS,
  PLUS_GIFT_PRICE_GOLD,
  WALLET_LEDGER_PAGE_SIZE,
  WELCOME_SILVER,
} from "@sualive/config";
import type { Currency } from "@sualive/config";
import type { LedgerEntry, LedgerReason, ShopItem, WalletResponse } from "@sualive/protocol";
import { useSyncExternalStore } from "react";
import type { WalletClient } from "../components/wallet/WalletClient";
import type {
  PaymentStatus,
  WalletActions,
  WalletErrorReason,
  WalletResult,
  WalletState,
} from "../lib/wallet";

export interface DemoWalletOptions {
  /** No account (or no first access): every action answers `unauthorized`. */
  logged: boolean;
  /** Gold to start with. */
  gold?: number;
  /** How the fake gold payment ends, a few seconds after the QR Code shows. */
  payment?: PaymentStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_DELAY_MS = 6000;
/** Handles that exist in the demo (anything else is "not found"); the viewer is `marina`. */
const DEMO_HANDLES = ["caio", "bia_albuquerque", "jo", "teste"];
const SELF_HANDLE = "marina";

const paint = (light: string[], dark: string[]) => ({ light, dark });

/** A small slice of the catalog: colors, gradients, frames and reaction packs. */
function demoCatalog(): ShopItem[] {
  return [
    {
      id: "name_color_blue",
      kind: "name_color",
      name: "Azul",
      price: 100,
      data: paint(["#1d4ed8"], ["#93c5fd"]),
      owned: true,
      equipped: true,
    },
    {
      id: "name_color_green",
      kind: "name_color",
      name: "Verde",
      price: 100,
      data: paint(["#047857"], ["#34d399"]),
      owned: false,
      equipped: false,
    },
    {
      id: "name_color_red",
      kind: "name_color",
      name: "Vermelho",
      price: 100,
      data: paint(["#b42318"], ["#f97066"]),
      owned: false,
      equipped: false,
    },
    {
      id: "name_gradient_dusk",
      kind: "name_gradient",
      name: "Entardecer",
      price: 300,
      data: paint(["#6d28d9", "#db2777"], ["#a78bfa", "#f472b6"]),
      owned: false,
      equipped: false,
    },
    {
      id: "name_gradient_sea",
      kind: "name_gradient",
      name: "Mar",
      price: 300,
      data: paint(["#0369a1", "#0d9488"], ["#7dd3fc", "#5eead4"]),
      owned: false,
      equipped: false,
    },
    {
      id: "avatar_frame_gold",
      kind: "avatar_frame",
      name: "Dourada",
      price: 300,
      data: paint(["#b45309"], ["#fbbf24"]),
      owned: true,
      equipped: false,
    },
    {
      id: "avatar_frame_aurora",
      kind: "avatar_frame",
      name: "Aurora",
      price: 600,
      data: paint(["#7c3aed", "#059669"], ["#c4b5fd", "#6ee7b7"]),
      owned: false,
      equipped: false,
    },
    {
      id: "reaction_pack_party",
      kind: "reaction_pack",
      name: "Festa",
      price: 400,
      data: { reactions: ["🥳", "🔥", "💯"] },
      owned: true,
      equipped: true,
    },
    {
      id: "reaction_pack_animals",
      kind: "reaction_pack",
      name: "Bichos",
      price: 400,
      data: { reactions: ["🐶", "🐱", "🦊", "🐸"] },
      owned: false,
      equipped: false,
    },
  ];
}

/** Enough history to page through (more than one page). */
function demoLedger(): LedgerEntry[] {
  const now = Date.now();
  const entries: LedgerEntry[] = [
    {
      id: "d-1",
      currency: "silver",
      amount: -100,
      reason: "shop_purchase",
      counterpartHandle: null,
      itemName: "Azul",
      createdAt: now - 2 * 3600_000,
    },
    {
      id: "d-2",
      currency: "gold",
      amount: 250,
      reason: "gift_received",
      counterpartHandle: "caio",
      itemName: null,
      createdAt: now - DAY_MS,
    },
    {
      id: "d-3",
      currency: "gold",
      amount: -100,
      reason: "gift_sent",
      counterpartHandle: "bia_albuquerque",
      itemName: null,
      createdAt: now - 2 * DAY_MS,
    },
    {
      id: "d-4",
      currency: "gold",
      amount: -300,
      reason: "shop_purchase",
      counterpartHandle: null,
      itemName: "Dourada",
      createdAt: now - 3 * DAY_MS,
    },
    {
      id: "d-5",
      currency: "gold",
      amount: -400,
      reason: "shop_purchase",
      counterpartHandle: null,
      itemName: "Festa",
      createdAt: now - 4 * DAY_MS,
    },
    {
      id: "d-6",
      currency: "gold",
      amount: 990,
      reason: "gold_purchase",
      counterpartHandle: null,
      itemName: null,
      createdAt: now - 5 * DAY_MS,
    },
  ];
  for (let index = 0; index < WALLET_LEDGER_PAGE_SIZE; index += 1) {
    const sent = index % 2 === 0;
    entries.push({
      id: `d-old-${index}`,
      currency: "gold",
      amount: sent ? -10 : 10,
      reason: sent ? "gift_sent" : "gift_received",
      counterpartHandle: sent ? "jo" : null,
      itemName: null,
      createdAt: now - (6 + index) * DAY_MS,
    });
  }
  entries.push({
    id: "d-welcome",
    currency: "silver",
    amount: WELCOME_SILVER,
    reason: "welcome",
    counterpartHandle: null,
    itemName: null,
    createdAt: now - 60 * DAY_MS,
  });
  return entries;
}

/** QR-like square, enough to see the layout of the payment. */
function demoQrCode(): string {
  let cells = "";
  for (let row = 0; row < 21; row += 1) {
    for (let column = 0; column < 21; column += 1) {
      if ((row * 5 + column * 11 + ((row * column) % 7)) % 3 === 0) {
        cells += `<rect x="${column}" y="${row}" width="1" height="1"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 23 23"><rect x="-1" y="-1" width="23" height="23" fill="white"/>${cells}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Styles that exclude each other when equipped (same rule as the server). */
function conflicts(a: ShopItem, b: ShopItem): boolean {
  const nameStyle = (item: ShopItem) => item.kind === "name_color" || item.kind === "name_gradient";
  if (nameStyle(a) && nameStyle(b)) return true;
  return a.kind === "avatar_frame" && b.kind === "avatar_frame";
}

export function createDemoWalletClient(options: DemoWalletOptions): WalletClient {
  let balances: WalletResponse = {
    silver: 200,
    gold: options.gold ?? 1250,
    goldSentToday: 100,
    goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
  };
  let catalog = demoCatalog();
  const history = demoLedger();
  let sequence = 0;

  let state: WalletState = {
    status: "idle",
    wallet: null,
    ledger: { status: "idle", entries: [], hasMore: false, loadingMore: false },
    shop: { status: "idle", items: [] },
    goldPacks: GOLD_PACKS,
  };
  const listeners = new Set<() => void>();
  const setState = (patch: Partial<WalletState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const wait = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
  const fail = (reason: WalletErrorReason) => ({ ok: false as const, reason });
  const ok = (): WalletResult => ({ ok: true, value: undefined });

  /** Writes a movement in the history and refreshes what the screens already loaded. */
  const record = (
    currency: Currency,
    amount: number,
    reason: LedgerReason,
    extra: Partial<LedgerEntry> = {},
  ) => {
    history.unshift({
      id: `d-new-${(sequence += 1)}`,
      currency,
      amount,
      reason,
      counterpartHandle: null,
      itemName: null,
      createdAt: Date.now(),
      ...extra,
    });
    if (state.wallet) setState({ status: "ready", wallet: balances });
    if (state.ledger.status === "ready") {
      const shown = Math.max(state.ledger.entries.length, WALLET_LEDGER_PAGE_SIZE);
      setState({
        ledger: { ...state.ledger, entries: history.slice(0, shown), hasMore: history.length > shown },
      });
    }
  };
  const recipient = (to: string): WalletErrorReason | null => {
    const handle = to.trim().replace(/^@/, "");
    if (handle === SELF_HANDLE) return "selfGift";
    return DEMO_HANDLES.includes(handle) ? null : "recipientNotFound";
  };

  const actions: WalletActions = {
    async load() {
      if (!options.logged) return;
      if (!state.wallet) setState({ status: "loading" });
      await wait();
      setState({ status: "ready", wallet: balances });
    },
    async loadLedger() {
      if (!options.logged) return;
      if (state.ledger.status !== "ready") setState({ ledger: { ...state.ledger, status: "loading" } });
      await wait();
      setState({
        ledger: {
          status: "ready",
          entries: history.slice(0, WALLET_LEDGER_PAGE_SIZE),
          hasMore: history.length > WALLET_LEDGER_PAGE_SIZE,
          loadingMore: false,
        },
      });
    },
    async loadMoreLedger() {
      if (state.ledger.status !== "ready" || !state.ledger.hasMore || state.ledger.loadingMore) return;
      setState({ ledger: { ...state.ledger, loadingMore: true } });
      await wait(600);
      const shown = state.ledger.entries.length + WALLET_LEDGER_PAGE_SIZE;
      setState({
        ledger: {
          status: "ready",
          entries: history.slice(0, shown),
          hasMore: history.length > shown,
          loadingMore: false,
        },
      });
    },
    async loadShop() {
      if (!options.logged) return;
      if (state.shop.status !== "ready") setState({ shop: { ...state.shop, status: "loading" } });
      await wait();
      setState({ shop: { status: "ready", items: catalog } });
    },
    async startGoldCheckout({ packId, taxId }) {
      await wait(700);
      if (!options.logged) return fail("unauthorized");
      const pack = GOLD_PACKS.find((candidate) => candidate.id === packId);
      if (!pack || !/^\d{11}$/.test(taxId)) return fail("invalid");
      return {
        ok: true,
        value: {
          paymentId: `demo-gold-${Date.now()}-${pack.id}`,
          packId: pack.id,
          gold: pack.gold,
          amountCents: pack.priceCents,
          brCode:
            "00020126580014br.gov.bcb.pix0136demo-0000-0000-0000-sualive5204000053039865802BR5907SUALIVE6009SAO PAULO62070503***6304DEMO",
          qrCodeImageUrl: demoQrCode(),
          expiresAt: Date.now() + 15 * 60 * 1000,
        },
      };
    },
    watchGoldPayment(paymentId, onChange) {
      const outcome = options.payment ?? "paid";
      const timer = setTimeout(() => {
        if (outcome === "paid") {
          const pack = GOLD_PACKS.find((candidate) => paymentId.endsWith(candidate.id)) ?? GOLD_PACKS[0];
          balances = { ...balances, gold: balances.gold + pack.gold };
          record("gold", pack.gold, "gold_purchase");
        }
        if (outcome !== "pending") onChange(outcome);
      }, PAYMENT_DELAY_MS);
      return () => clearTimeout(timer);
    },
    async sendGold({ to, amount }) {
      await wait();
      if (!options.logged) return fail("unauthorized");
      if (!Number.isInteger(amount) || amount < 1 || amount > GOLD_GIFT_DAILY_LIMIT) return fail("invalid");
      const refused = recipient(to);
      if (refused) return fail(refused);
      if (balances.goldSentToday + amount > balances.goldGiftDailyLimit) return fail("dailyLimit");
      if (balances.gold < amount) return fail("insufficientFunds");
      balances = {
        ...balances,
        gold: balances.gold - amount,
        goldSentToday: balances.goldSentToday + amount,
      };
      record("gold", -amount, "gift_sent", { counterpartHandle: to.trim().replace(/^@/, "") });
      return ok();
    },
    async giftPlus({ to }) {
      await wait();
      if (!options.logged) return fail("unauthorized");
      const refused = recipient(to);
      if (refused) return fail(refused);
      if (balances.gold < PLUS_GIFT_PRICE_GOLD) return fail("insufficientFunds");
      balances = { ...balances, gold: balances.gold - PLUS_GIFT_PRICE_GOLD };
      record("gold", -PLUS_GIFT_PRICE_GOLD, "plus_gift", { counterpartHandle: to.trim().replace(/^@/, "") });
      return ok();
    },
    async buyItem(itemId, currency) {
      await wait();
      if (!options.logged) return fail("unauthorized");
      const item = catalog.find((candidate) => candidate.id === itemId);
      if (!item) return fail("notFound");
      if (item.owned) return fail("alreadyOwned");
      if (balances[currency] < item.price) return fail("insufficientFunds");
      balances = { ...balances, [currency]: balances[currency] - item.price };
      catalog = catalog.map((candidate) =>
        candidate.id === itemId ? { ...candidate, owned: true } : candidate,
      );
      setState({ shop: { status: "ready", items: catalog } });
      record(currency, -item.price, "shop_purchase", { itemName: item.name });
      return ok();
    },
    async setEquipped(itemId, equipped) {
      await wait(300);
      if (!options.logged) return fail("unauthorized");
      const item = catalog.find((candidate) => candidate.id === itemId);
      if (!item) return fail("notFound");
      if (!item.owned) return fail("notOwned");
      catalog = catalog.map((candidate) => {
        if (candidate.id === itemId) return { ...candidate, equipped };
        if (equipped && candidate.equipped && conflicts(candidate, item))
          return { ...candidate, equipped: false };
        return candidate;
      });
      setState({ shop: { status: "ready", items: catalog } });
      return ok();
    },
    async refresh() {
      await wait();
      if (state.wallet) setState({ wallet: balances });
      if (state.shop.status === "ready") setState({ shop: { status: "ready", items: catalog } });
    },
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    useWallet() {
      const current = useSyncExternalStore(subscribe, () => state);
      return { state: current, actions };
    },
  };
}
