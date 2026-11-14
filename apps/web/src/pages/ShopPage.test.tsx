import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShopItem, WalletState } from "../lib/wallet";
import { makeAccountState, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import {
  makeLoadedWalletState,
  makeShopItem,
  makeWallet,
  makeWalletActions,
  makeWalletState,
} from "../test/wallet";
import { texts } from "../texts";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const user = makeUser({ nickname: "Marina", avatarUrl: "https://example.test/a.png" });

function open(wallet: WalletState = makeLoadedWalletState(), walletActions = makeWalletActions()) {
  return renderApp({ path: "/loja", account: makeAccountState({ user }), wallet, walletActions });
}

const withItems = (items: ShopItem[]) => makeLoadedWalletState({ shop: { status: "ready", items } });
const card = (id: string) => within(screen.getByTestId(`shop-item-${id}`));

const RED = makeShopItem();
const SUNSET = makeShopItem({
  id: "name_gradient_sunset",
  kind: "name_gradient",
  name: "Pôr do sol",
  price: 300,
  data: { light: ["#b42318", "#b54708"], dark: ["#f97066", "#fdb022"] },
});
const FRAME = makeShopItem({
  id: "frame_blue",
  kind: "avatar_frame",
  name: "Azul",
  price: 450,
  data: { light: ["#175cd3"], dark: ["#53b1fd"] },
});
const PARTY = makeShopItem({
  id: "reactions_party",
  kind: "reaction_pack",
  name: "Festa",
  price: 400,
  data: { reactions: ["🥳", "🎊"] },
});

describe("shop: who can open it", () => {
  it("sends a visitor to the login, with the way back", () => {
    const { accountActions, walletActions } = renderApp({ path: "/loja" });
    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/loja");
    expect(walletActions.loadShop).not.toHaveBeenCalled();
  });

  it("sends who has not finished the first access to it", () => {
    renderApp({
      path: "/loja",
      account: makeAccountState({ user: makeUser({ onboarded: false, handle: null }) }),
    });
    expect(heading()).toBe(texts.onboarding.title);
  });

  it("has no header and no name of the product", () => {
    open();
    expect(heading()).toBe(texts.shop.title);
    // The row of the site (name of the product at the left, account at the right) is not there.
    expect(screen.queryByRole("link", { name: texts.nav.home })).toBeNull();
    expect(screen.queryByRole("navigation", { name: texts.nav.label })).toBeNull();
    expect(screen.getByTestId("page-top")).toBeTruthy();
  });
});

describe("shop: catalog", () => {
  it("asks for the balances and the catalog when it opens", () => {
    const { walletActions } = open();
    expect(walletActions.load).toHaveBeenCalledTimes(1);
    expect(walletActions.loadShop).toHaveBeenCalledTimes(1);
    expect(walletActions.loadLedger).not.toHaveBeenCalled();
  });

  it("shows the two balances at the top, with the way to the wallet", () => {
    open(makeLoadedWalletState({ wallet: makeWallet({ silver: 300, gold: 2500 }) }));
    const balances = within(screen.getByRole("group", { name: texts.shop.balancesLabel }));
    expect(within(balances.getByTestId("balance-silver")).getByText("300")).toBeTruthy();
    expect(within(balances.getByTestId("balance-gold")).getByText("2.500")).toBeTruthy();
    expect(balances.getByRole("link", { name: texts.shop.walletLink }).getAttribute("href")).toBe(
      "/carteira",
    );
  });

  it("splits the catalog in the four groups, in order, each item in its own", () => {
    // Out of order on purpose: the page groups, whatever the order of the catalog.
    open(withItems([PARTY, FRAME, RED, SUNSET]));

    expect(screen.getAllByRole("heading", { level: 2 }).map((title) => title.textContent)).toEqual([
      texts.shop.groups.name_color,
      texts.shop.groups.name_gradient,
      texts.shop.groups.avatar_frame,
      texts.shop.groups.reaction_pack,
    ]);
    const inGroup = (kind: ShopItem["kind"], item: ShopItem) =>
      within(screen.getByTestId(`shop-group-${kind}`)).getByTestId(`shop-item-${item.id}`);
    expect(inGroup("name_color", RED)).toBeTruthy();
    expect(inGroup("name_gradient", SUNSET)).toBeTruthy();
    expect(inGroup("avatar_frame", FRAME)).toBeTruthy();
    expect(inGroup("reaction_pack", PARTY)).toBeTruthy();
  });

  it("leaves out a group with nothing in it", () => {
    open(withItems([RED]));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(screen.queryByTestId("shop-group-avatar_frame")).toBeNull();
  });

  it("shows the name and the single price of each item", () => {
    open(withItems([RED, FRAME]));
    expect(card(RED.id).getByRole("heading", { name: "Vermelho" })).toBeTruthy();
    expect(card(RED.id).getByText(texts.shop.price("100"))).toBeTruthy();
    expect(card(FRAME.id).getByText(texts.shop.price("450"))).toBeTruthy();
  });

  it.each([RED, SUNSET])("previews a name style on the person's own nickname ($name)", (item) => {
    open(withItems([item]));
    const preview = card(item.id).getByRole("img", { name: texts.shop.previewLabel(item.name) });
    const name = preview.querySelector<HTMLElement>('[data-cosmetic="name"]');
    expect(name?.textContent).toBe("Marina");
    const paint = item.data as { light: string[]; dark: string[] };
    expect(name?.style.getPropertyValue("--cosmetic-light-a")).toBe(paint.light[0]);
    expect(name?.style.getPropertyValue("--cosmetic-light-b")).toBe(paint.light.at(-1));
    expect(name?.style.getPropertyValue("--cosmetic-dark-a")).toBe(paint.dark[0]);
  });

  it("previews a frame around the person's own picture", () => {
    open(withItems([FRAME]));
    const preview = card(FRAME.id).getByTestId("item-preview");
    const frame = preview.querySelector<HTMLElement>('[data-cosmetic="frame"]');
    expect(frame?.style.getPropertyValue("--cosmetic-light-a")).toBe("#175cd3");
    expect(frame?.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
  });

  it("previews the reactions of a pack", () => {
    open(withItems([PARTY]));
    const preview = card(PARTY.id).getByTestId("item-preview");
    expect(preview.textContent).toBe("🥳🎊");
    expect(preview.querySelector("[data-cosmetic]")).toBeNull();
  });

  it("waits for the catalog, says when it failed and tries again, and says when it is empty", () => {
    const loading = open(makeWalletState({ wallet: makeWallet() }));
    expect(screen.getByText(texts.common.loading)).toBeTruthy();
    loading.unmount();

    const failed = open(makeWalletState({ wallet: makeWallet(), shop: { status: "error", items: [] } }));
    expect(screen.getByRole("alert").textContent).toBe(texts.shop.loadFailed);
    fireEvent.click(screen.getByRole("button", { name: texts.common.tryAgain }));
    expect(failed.walletActions.loadShop).toHaveBeenCalledTimes(2);
    failed.unmount();

    open(withItems([]));
    expect(screen.getByText(texts.shop.empty)).toBeTruthy();
  });
});

describe("shop: buying", () => {
  const startBuying = (item: ShopItem) =>
    fireEvent.click(card(item.id).getByRole("button", { name: texts.shop.buyLabel(item.name) }));
  const payWith = (item: ShopItem, currency: "silver" | "gold") =>
    fireEvent.click(card(item.id).getByRole("button", { name: texts.shop.payWith[currency] }));

  it.each(["silver", "gold"] as const)("asks before buying, then pays with %s", async (currency) => {
    const { walletActions } = open(withItems([RED, FRAME]));
    startBuying(RED);

    expect(card(RED.id).getByText(texts.shop.confirmText("Vermelho", "100"))).toBeTruthy();
    // Both currencies are offered, for the same price.
    expect(card(RED.id).getByRole("button", { name: texts.shop.payWith.silver })).toBeTruthy();
    expect(card(RED.id).getByRole("button", { name: texts.shop.payWith.gold })).toBeTruthy();
    expect(walletActions.buyItem).not.toHaveBeenCalled();

    payWith(RED, currency);
    await waitFor(() => expect(walletActions.buyItem).toHaveBeenCalledWith(RED.id, currency));
    expect(walletActions.buyItem).toHaveBeenCalledTimes(1);
    // The choice closes; the item only turns into "owned" when the server says so.
    await waitFor(() =>
      expect(card(RED.id).queryByRole("button", { name: texts.shop.payWith[currency] })).toBeNull(),
    );
  });

  it("buys nothing when the person gives up", () => {
    const { walletActions } = open(withItems([RED]));
    startBuying(RED);
    fireEvent.click(card(RED.id).getByRole("button", { name: texts.common.cancel }));

    expect(walletActions.buyItem).not.toHaveBeenCalled();
    expect(card(RED.id).getByRole("button", { name: texts.shop.buyLabel("Vermelho") })).toBeTruthy();
  });

  it("says when the balance is not enough, with the way to the wallet, and lets the other currency be tried", async () => {
    const walletActions = makeWalletActions();
    walletActions.buyItem.mockResolvedValueOnce({ ok: false, reason: "insufficientFunds" });
    open(withItems([RED]), walletActions);
    startBuying(RED);
    payWith(RED, "silver");

    const alert = await card(RED.id).findByRole("alert");
    expect(alert.textContent).toContain(texts.wallet.errors.insufficientFunds);
    expect(within(alert).getByRole("link", { name: texts.shop.insufficientLink }).getAttribute("href")).toBe(
      "/carteira",
    );

    payWith(RED, "gold");
    await waitFor(() => expect(walletActions.buyItem).toHaveBeenLastCalledWith(RED.id, "gold"));
    await waitFor(() => expect(card(RED.id).queryByRole("alert")).toBeNull());
  });

  it("says when the item was already bought", async () => {
    const walletActions = makeWalletActions();
    walletActions.buyItem.mockResolvedValue({ ok: false, reason: "alreadyOwned" });
    open(withItems([RED]), walletActions);
    startBuying(RED);
    payWith(RED, "gold");

    const alert = await card(RED.id).findByRole("alert");
    expect(alert.textContent?.trim()).toBe(texts.wallet.errors.alreadyOwned);
    expect(within(alert).queryByRole("link")).toBeNull();
  });
});

describe("shop: what is already bought", () => {
  const OWNED = { ...FRAME, owned: true };
  const EQUIPPED = { ...PARTY, owned: true, equipped: true };

  it("offers to equip a bought item instead of selling it again", async () => {
    const { walletActions } = open(withItems([OWNED]));
    expect(card(OWNED.id).getByTestId("item-state").textContent).toBe(texts.shop.owned);
    expect(card(OWNED.id).queryByRole("button", { name: texts.shop.buyLabel(OWNED.name) })).toBeNull();

    const equip = card(OWNED.id).getByRole("button", { name: texts.shop.equipLabel(OWNED.name) });
    expect(equip.textContent).toBe(texts.shop.equip);
    fireEvent.click(equip);
    await waitFor(() => expect(walletActions.setEquipped).toHaveBeenCalledWith(OWNED.id, true));
  });

  it("marks an equipped item and offers to unequip it", async () => {
    const { walletActions } = open(withItems([EQUIPPED]));
    expect(screen.getByTestId(`shop-item-${EQUIPPED.id}`).hasAttribute("data-equipped")).toBe(true);
    expect(card(EQUIPPED.id).getByTestId("item-state").textContent).toBe(texts.shop.equipped);

    const unequip = card(EQUIPPED.id).getByRole("button", { name: texts.shop.unequipLabel(EQUIPPED.name) });
    expect(unequip.textContent).toBe(texts.shop.unequip);
    fireEvent.click(unequip);
    await waitFor(() => expect(walletActions.setEquipped).toHaveBeenCalledWith(EQUIPPED.id, false));
  });

  it("explains when equipping failed", async () => {
    const walletActions = makeWalletActions();
    walletActions.setEquipped.mockResolvedValue({ ok: false, reason: "notOwned" });
    open(withItems([OWNED]), walletActions);
    fireEvent.click(card(OWNED.id).getByRole("button", { name: texts.shop.equipLabel(OWNED.name) }));
    expect((await card(OWNED.id).findByRole("alert")).textContent?.trim()).toBe(texts.wallet.errors.notOwned);
  });

  it("has no rarity, no upload and no temporary item", () => {
    open();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/raro|raridade|lendári|expira em|por tempo limitado/i);
  });
});
