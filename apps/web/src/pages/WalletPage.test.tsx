import { GOLD_PACKS, PLUS_GIFT_DAYS, PLUS_GIFT_PRICE_GOLD } from "@sualive/config";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatAmount, formatCents, formatDate } from "../components/format";
import type { LedgerEntry, WalletErrorReason, WalletState } from "../lib/wallet";
import { makeAccountState, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import {
  makeLedgerEntry,
  makeLoadedWalletState,
  makeWallet,
  makeWalletActions,
  makeWalletState,
} from "../test/wallet";
import { texts } from "../texts";

const VALID_CPF = "529.982.247-25";
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const logged = () => makeAccountState({ user: makeUser() });

function open(wallet: WalletState = makeLoadedWalletState(), walletActions = makeWalletActions()) {
  const view = renderApp({ path: "/carteira", account: logged(), wallet, walletActions });
  // The mocks keep their own type (the payment driver is not part of the contract of the screen).
  return { ...view, walletActions };
}

const withLedger = (ledger: Partial<WalletState["ledger"]>) =>
  makeLoadedWalletState({
    ledger: { status: "ready", entries: [], hasMore: false, loadingMore: false, ...ledger },
  });

describe("wallet: who can open it", () => {
  it("sends a visitor to the login, with the way back", () => {
    const { accountActions, walletActions } = renderApp({ path: "/carteira" });
    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/carteira");
    expect(walletActions.load).not.toHaveBeenCalled();
  });

  it("sends who has not finished the first access to it", () => {
    const { walletActions } = renderApp({
      path: "/carteira",
      account: makeAccountState({ user: makeUser({ onboarded: false, handle: null }) }),
    });
    expect(heading()).toBe(texts.onboarding.title);
    expect(walletActions.load).not.toHaveBeenCalled();
  });

  it("has no header and no name of the product: only the back row and the footer", () => {
    open();
    expect(heading()).toBe(texts.wallet.title);
    // The row of the site (name of the product at the left, account at the right) is not there.
    expect(screen.queryByRole("link", { name: texts.nav.home })).toBeNull();
    expect(screen.queryByRole("navigation", { name: texts.nav.label })).toBeNull();
    expect(screen.getByTestId("page-top")).toBeTruthy();
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: texts.nav.homeShort }).getAttribute("href")).toBe("/");
  });
});

describe("wallet: balances", () => {
  it("asks for the balances and the statement when it opens, and for nothing else", () => {
    const { walletActions } = open();
    expect(walletActions.load).toHaveBeenCalledTimes(1);
    expect(walletActions.loadLedger).toHaveBeenCalledTimes(1);
    expect(walletActions.loadShop).not.toHaveBeenCalled();
  });

  it("shows silver and gold, each with a line saying what it is", () => {
    open(makeLoadedWalletState({ wallet: makeWallet({ silver: 300, gold: 12345 }) }));

    const silver = within(screen.getByTestId("balance-silver"));
    expect(silver.getByText(texts.wallet.balances.names.silver)).toBeTruthy();
    expect(silver.getByText("300")).toBeTruthy();
    expect(silver.getByText(texts.wallet.balances.about.silver)).toBeTruthy();

    const gold = within(screen.getByTestId("balance-gold"));
    expect(gold.getByText(texts.wallet.balances.names.gold)).toBeTruthy();
    expect(gold.getByText("12.345")).toBeTruthy();
    expect(gold.getByText(texts.wallet.balances.about.gold)).toBeTruthy();
  });

  it("leads to the shop", () => {
    open();
    expect(screen.getByRole("link", { name: texts.wallet.balances.shopLink }).getAttribute("href")).toBe(
      "/loja",
    );
  });

  it("waits while the balances are not there yet", () => {
    open(makeWalletState());
    expect(screen.getByText(texts.common.loading)).toBeTruthy();
    expect(screen.queryByTestId("balances")).toBeNull();
    expect(screen.queryByTestId("gold-checkout")).toBeNull();
  });

  it("says when the wallet could not be loaded and tries again", () => {
    const { walletActions } = open(makeWalletState({ status: "error" }));
    expect(screen.getByRole("alert").textContent).toBe(texts.wallet.loadFailed);
    fireEvent.click(screen.getByRole("button", { name: texts.common.tryAgain }));
    expect(walletActions.load).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["loaded", makeLoadedWalletState()],
    ["loading", makeWalletState()],
    ["failed", makeWalletState({ status: "error" })],
  ])("always says that the currencies never become money (%s)", (_name, state) => {
    open(state);
    const notice = screen.getByTestId("wallet-notice").textContent;
    expect(notice).toBe(texts.wallet.notice);
    expect(notice).toMatch(/saque/);
    expect(notice).toMatch(/reembolso em dinheiro/);
    expect(notice).toMatch(/ouro por prata/);
  });
});

describe("wallet: statement", () => {
  const { reasons } = texts.wallet.ledger;
  const rows = () => screen.getAllByTestId("ledger-entry");

  it.each<[string, Partial<LedgerEntry>, string, string]>([
    ["welcome", { reason: "welcome", currency: "silver", amount: 300 }, reasons.welcome, "+300 de prata"],
    [
      "plus_gold",
      { reason: "plus_gold", currency: "gold", amount: 1000 },
      reasons.plus_gold,
      "+1.000 de ouro",
    ],
    [
      "gold_purchase",
      { reason: "gold_purchase", currency: "gold", amount: 2190 },
      reasons.gold_purchase,
      "+2.190 de ouro",
    ],
    [
      "shop_purchase",
      { reason: "shop_purchase", currency: "silver", amount: -100, itemName: "Vermelho" },
      "Compra na loja: Vermelho",
      "−100 de prata",
    ],
    [
      "gift_sent",
      { reason: "gift_sent", currency: "gold", amount: -150, counterpartHandle: "caio" },
      "Ouro enviado para @caio",
      "−150 de ouro",
    ],
    [
      "gift_received",
      { reason: "gift_received", currency: "gold", amount: 50, counterpartHandle: "bia_2" },
      "Ouro recebido de @bia_2",
      "+50 de ouro",
    ],
    [
      "plus_gift",
      { reason: "plus_gift", currency: "gold", amount: -PLUS_GIFT_PRICE_GOLD, counterpartHandle: "caio" },
      "Plus de presente para @caio",
      `−${formatAmount(PLUS_GIFT_PRICE_GOLD)} de ouro`,
    ],
  ])("describes a %s line: what it was, the date and the signed amount", (_reason, entry, text, amount) => {
    const createdAt = new Date(2026, 10, 3, 12).getTime();
    open(withLedger({ entries: [makeLedgerEntry({ ...entry, createdAt })] }));

    const row = within(rows()[0]!);
    expect(row.getByText(text)).toBeTruthy();
    expect(row.getByText(amount)).toBeTruthy();
    expect(row.getByText(formatDate(createdAt))).toBeTruthy();
  });

  it.each<[LedgerEntry["reason"], string]>([
    ["gift_sent", `Ouro enviado para ${texts.wallet.ledger.deletedAccount}`],
    ["gift_received", `Ouro recebido de ${texts.wallet.ledger.deletedAccount}`],
    ["plus_gift", `Plus de presente para ${texts.wallet.ledger.deletedAccount}`],
  ])("says 'conta excluída' when the other account of a %s is gone", (reason, text) => {
    open(withLedger({ entries: [makeLedgerEntry({ reason, currency: "gold", amount: -10 })] }));
    expect(texts.wallet.ledger.deletedAccount).toBe("conta excluída");
    expect(within(rows()[0]!).getByText(text)).toBeTruthy();
  });

  it("keeps the order the server gave: newest first", () => {
    open();
    expect(rows()).toHaveLength(2);
    expect(rows()[0]!.textContent).toContain("Ouro enviado para @caio");
    expect(rows()[1]!.textContent).toContain(reasons.welcome);
  });

  it("offers more lines only while there are more, and asks for the next page", () => {
    const { walletActions, unmount } = open(withLedger({ entries: [makeLedgerEntry()], hasMore: true }));
    fireEvent.click(screen.getByRole("button", { name: texts.wallet.ledger.more }));
    expect(walletActions.loadMoreLedger).toHaveBeenCalledTimes(1);
    unmount();

    open(withLedger({ entries: [makeLedgerEntry()], hasMore: false }));
    expect(screen.queryByRole("button", { name: texts.wallet.ledger.more })).toBeNull();
  });

  it("shows that the next page is on its way", () => {
    open(withLedger({ entries: [makeLedgerEntry()], hasMore: true, loadingMore: true }));
    const more = screen.getByRole("button", { name: texts.wallet.ledger.loadingMore });
    expect(more.hasAttribute("disabled") || more.getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("says when there is no movement yet", () => {
    open(withLedger({ entries: [] }));
    expect(within(screen.getByTestId("ledger")).getByText(texts.wallet.ledger.empty)).toBeTruthy();
    expect(screen.queryAllByTestId("ledger-entry")).toHaveLength(0);
  });

  it("waits for the first page", () => {
    open(withLedger({ status: "loading" }));
    expect(within(screen.getByTestId("ledger")).getByText(texts.wallet.ledger.loading)).toBeTruthy();
  });

  it("says when the statement could not be loaded and tries again, keeping the balances", () => {
    const { walletActions } = open(withLedger({ status: "error" }));
    const ledger = within(screen.getByTestId("ledger"));
    expect(ledger.getByRole("alert").textContent).toBe(texts.wallet.ledger.failed);
    expect(screen.getByTestId("balances")).toBeTruthy();

    fireEvent.click(ledger.getByRole("button", { name: texts.common.tryAgain }));
    expect(walletActions.loadLedger).toHaveBeenCalledTimes(2);
  });
});

describe("wallet: buying gold", () => {
  const checkout = () => within(screen.getByTestId("gold-checkout"));
  const choosePack = (id: string) =>
    fireEvent.click(within(screen.getByTestId(`gold-pack-${id}`)).getByRole("button"));
  const typeCpf = (value: string) =>
    fireEvent.change(checkout().getByLabelText(texts.plus.checkout.cpfLabel), { target: { value } });
  const submitCpf = () =>
    fireEvent.click(checkout().getByRole("button", { name: texts.plus.checkout.submit }));
  const pack = GOLD_PACKS[1];

  async function reachPayment(walletActions = makeWalletActions()) {
    const view = open(makeLoadedWalletState(), walletActions);
    choosePack(pack.id);
    typeCpf(VALID_CPF);
    submitCpf();
    await screen.findByTestId("gold-payment");
    // The panel starts following the payment in an effect, right after it shows up.
    await waitFor(() => expect(view.walletActions.watchGoldPayment).toHaveBeenCalledTimes(1));
    return view;
  }

  it("offers the three packs, each with its gold and its price in reais", () => {
    open();
    expect(GOLD_PACKS).toHaveLength(3);
    for (const { id, gold, priceCents } of GOLD_PACKS) {
      const card = screen.getByTestId(`gold-pack-${id}`);
      expect(card.textContent).toContain(texts.wallet.amount(gold, "gold"));
      expect(card.textContent).toContain(formatCents(priceCents));
      expect(within(card).getByRole("button").getAttribute("aria-label")).toBe(
        texts.wallet.buy.chooseLabel(texts.wallet.amount(gold, "gold"), formatCents(priceCents)),
      );
    }
  });

  it("asks for the CPF of the chosen pack, and lets the person choose another", () => {
    open();
    choosePack(pack.id);
    expect(
      checkout().getByRole("heading", {
        name: texts.wallet.buy.checkoutTitle(texts.wallet.amount(pack.gold, "gold")),
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("checkout-amount").textContent).toBe(formatCents(pack.priceCents));
    expect(checkout().getByText(texts.plus.checkout.cpfWhy)).toBeTruthy();

    fireEvent.click(checkout().getByRole("button", { name: texts.wallet.buy.back }));
    expect(screen.getAllByTestId(/^gold-pack-/)).toHaveLength(3);
  });

  it("refuses an invalid CPF without creating a charge", () => {
    const { walletActions } = open();
    choosePack(pack.id);
    typeCpf("111.111.111-11");
    submitCpf();
    expect(checkout().getByRole("alert").textContent).toBe(texts.plus.checkout.cpfInvalid);
    expect(walletActions.startGoldCheckout).not.toHaveBeenCalled();
  });

  it("creates the charge with the pack and only the digits of the CPF, then shows the Pix", async () => {
    const { walletActions } = await reachPayment();

    expect(walletActions.startGoldCheckout).toHaveBeenCalledWith({ packId: pack.id, taxId: "52998224725" });
    const payment = within(screen.getByTestId("gold-payment"));
    expect(payment.getByRole("img", { name: texts.plus.checkout.qrAlt }).getAttribute("src")).toBe(
      "https://example.test/qr.png",
    );
    expect(payment.getByLabelText<HTMLTextAreaElement>(texts.plus.checkout.brCodeLabel).value).toBe(
      "00020126580014br.gov.bcb.pix-test",
    );
    expect(payment.getByRole("button", { name: texts.common.copy })).toBeTruthy();
    expect(payment.getByText(texts.plus.checkout.pending)).toBeTruthy();
    expect(screen.getByTestId("gold-payment").textContent).toContain(formatCents(pack.priceCents));
    expect(walletActions.watchGoldPayment).toHaveBeenCalledWith("gold-pay-1", expect.any(Function));
    // The CPF is nowhere on the screen once the charge exists.
    expect(document.body.textContent).not.toContain(VALID_CPF);
  });

  it("confirms a paid Pix without adding to the balance by itself", async () => {
    const { walletActions } = await reachPayment();
    act(() => walletActions.emitGoldPayment("paid"));

    const payment = screen.getByTestId("gold-payment");
    expect(payment.getAttribute("data-status")).toBe("paid");
    expect(
      within(payment).getByText(texts.wallet.buy.paid(texts.wallet.amount(pack.gold, "gold"))),
    ).toBeTruthy();
    expect(within(payment).queryByRole("img")).toBeNull();
    // The balance is still the one the server gave: the watcher is what reloads it.
    expect(within(screen.getByTestId("balance-gold")).getByText("1.000")).toBeTruthy();

    fireEvent.click(within(payment).getByRole("button", { name: texts.wallet.buy.paidAction }));
    expect(screen.getAllByTestId(/^gold-pack-/)).toHaveLength(3);
  });

  it.each(["expired", "failed"] as const)("says a Pix %s and generates another one", async (status) => {
    const { walletActions } = await reachPayment();
    act(() => walletActions.emitGoldPayment(status));

    const payment = within(screen.getByTestId("gold-payment"));
    expect(payment.getByText(texts.plus.checkout[status])).toBeTruthy();
    expect(payment.queryByRole("img")).toBeNull();

    fireEvent.click(payment.getByRole("button", { name: texts.plus.checkout.retry }));
    await waitFor(() => expect(walletActions.startGoldCheckout).toHaveBeenCalledTimes(2));
    expect(walletActions.startGoldCheckout).toHaveBeenLastCalledWith({
      packId: pack.id,
      taxId: "52998224725",
    });
  });

  it("stops following the payment when the page closes", async () => {
    const { walletActions, unmount } = await reachPayment();
    unmount();
    expect(walletActions.stopWatchingGold).toHaveBeenCalled();
  });

  it("explains a charge that could not be created", async () => {
    const walletActions = makeWalletActions();
    walletActions.startGoldCheckout.mockResolvedValue({ ok: false, reason: "rateLimited" });
    open(makeLoadedWalletState(), walletActions);
    choosePack(pack.id);
    typeCpf(VALID_CPF);
    submitCpf();
    expect(await checkout().findByText(texts.wallet.errors.rateLimited)).toBeTruthy();
    expect(screen.queryByTestId("gold-payment")).toBeNull();
  });

  it("says the purchase is unavailable when billing is off, and offers no button", () => {
    renderApp({
      path: "/carteira",
      account: makeAccountState({ user: makeUser(), billingEnabled: false }),
      wallet: makeLoadedWalletState(),
    });
    expect(screen.getByTestId("gold-unavailable").textContent).toBe(texts.wallet.buy.unavailable);
    expect(checkout().queryAllByRole("button")).toHaveLength(0);
    // The packs still inform the prices.
    expect(screen.getAllByTestId(/^gold-pack-/)).toHaveLength(3);
  });

  it("says the purchase is unavailable when the server refuses the charge for that", async () => {
    const walletActions = makeWalletActions();
    walletActions.startGoldCheckout.mockResolvedValue({ ok: false, reason: "billingUnavailable" });
    open(makeLoadedWalletState(), walletActions);
    choosePack(pack.id);
    typeCpf(VALID_CPF);
    submitCpf();

    expect((await screen.findByTestId("gold-unavailable")).textContent).toBe(texts.wallet.buy.unavailable);
    expect(checkout().queryAllByRole("button")).toHaveLength(0);
  });
});

const GIFT_ERRORS: WalletErrorReason[] = ["insufficientFunds", "dailyLimit", "recipientNotFound", "selfGift"];

describe("wallet: sending gold", () => {
  const form = () => within(screen.getByTestId("send-gold"));
  const fill = (handle: string, amount: string) => {
    fireEvent.change(form().getByLabelText(texts.wallet.send.handleLabel), { target: { value: handle } });
    fireEvent.change(form().getByLabelText(texts.wallet.send.amountLabel), { target: { value: amount } });
  };
  const submit = () => fireEvent.click(form().getByRole("button", { name: texts.wallet.send.submit }));
  const confirm = () => fireEvent.click(form().getByRole("button", { name: texts.wallet.send.confirm }));

  it("shows what was already sent today and the daily limit", () => {
    open(makeLoadedWalletState({ wallet: makeWallet({ goldSentToday: 350, goldGiftDailyLimit: 2000 }) }));
    expect(screen.getByTestId("gold-sent-today").textContent).toBe(
      texts.wallet.send.sentToday("350", "2.000"),
    );
  });

  it("has no way to send silver", () => {
    open();
    expect(form().getByText(texts.wallet.send.intro).textContent).toMatch(/Prata não pode ser enviada/);
    expect(screen.queryByRole("button", { name: /prata/i })).toBeNull();
  });

  it("confirms before sending, with the @handle in lower case and without the '@'", async () => {
    const { walletActions } = open();
    fill("  @CaIo_9 ", "150");
    submit();

    expect(form().getByTestId("gift-confirm").textContent).toBe(
      texts.wallet.send.confirmText("150 de ouro", "caio_9"),
    );
    expect(walletActions.sendGold).not.toHaveBeenCalled();

    confirm();
    await waitFor(() => expect(walletActions.sendGold).toHaveBeenCalledWith({ to: "caio_9", amount: 150 }));
    expect(await form().findByText(texts.wallet.send.done("150 de ouro", "caio_9"))).toBeTruthy();
    // Ready for another one.
    expect(form().getByLabelText<HTMLInputElement>(texts.wallet.send.handleLabel).value).toBe("");
    expect(form().getByLabelText<HTMLInputElement>(texts.wallet.send.amountLabel).value).toBe("");
  });

  it("sends nothing when the person gives up at the confirmation", () => {
    const { walletActions } = open();
    fill("caio", "10");
    submit();
    fireEvent.click(form().getByRole("button", { name: texts.common.cancel }));

    expect(walletActions.sendGold).not.toHaveBeenCalled();
    expect(form().queryByTestId("gift-confirm")).toBeNull();
    expect(form().getByLabelText<HTMLInputElement>(texts.wallet.send.handleLabel).value).toBe("caio");
  });

  it.each([
    ["", "10", texts.wallet.handleInvalid],
    ["@", "10", texts.wallet.handleInvalid],
    ["caio", "", texts.wallet.amountInvalid],
    ["caio", "0", texts.wallet.amountInvalid],
  ])("asks for the @handle and a whole amount (%j, %j)", (handle, amount, message) => {
    const { walletActions } = open();
    fill(handle, amount);
    submit();
    expect(form().getByRole("alert").textContent).toBe(message);
    expect(form().queryByTestId("gift-confirm")).toBeNull();
    expect(walletActions.sendGold).not.toHaveBeenCalled();
  });

  it("keeps only digits in the amount", () => {
    open();
    fill("caio", "1.5a0");
    expect(form().getByLabelText<HTMLInputElement>(texts.wallet.send.amountLabel).value).toBe("150");
  });

  it.each(GIFT_ERRORS)("explains a refused sending: %s", async (reason) => {
    const walletActions = makeWalletActions();
    walletActions.sendGold.mockResolvedValue({ ok: false, reason });
    open(makeLoadedWalletState(), walletActions);
    fill("caio", "150");
    submit();
    confirm();

    expect((await form().findByRole("alert")).textContent).toBe(texts.wallet.errors[reason]);
    // Back to the form, with what was typed, and nothing said as done.
    expect(form().getByLabelText<HTMLInputElement>(texts.wallet.send.amountLabel).value).toBe("150");
    expect(form().queryByText(texts.wallet.send.done("150 de ouro", "caio"))).toBeNull();
  });

  it("treats a sending that blew up as a generic failure", async () => {
    const walletActions = makeWalletActions();
    walletActions.sendGold.mockRejectedValue(new Error("network"));
    open(makeLoadedWalletState(), walletActions);
    fill("caio", "150");
    submit();
    confirm();
    expect((await form().findByRole("alert")).textContent).toBe(texts.wallet.errors.error);
  });
});

describe("wallet: giving Plus", () => {
  const form = () => within(screen.getByTestId("gift-plus"));
  const fill = (handle: string) =>
    fireEvent.change(form().getByLabelText(texts.wallet.giftPlus.handleLabel), { target: { value: handle } });
  const submit = () => fireEvent.click(form().getByRole("button", { name: texts.wallet.giftPlus.submit }));
  const confirm = () => fireEvent.click(form().getByRole("button", { name: texts.wallet.giftPlus.confirm }));

  it("says the price in gold and the days, from the parameters", () => {
    open();
    const intro = form().getByText(texts.wallet.giftPlus.intro).textContent;
    expect(intro).toContain(`${PLUS_GIFT_DAYS} dias de Plus`);
    expect(intro).toContain(`${formatAmount(PLUS_GIFT_PRICE_GOLD)} de ouro`);
    // No amount to choose: the price is fixed.
    expect(form().getAllByRole("textbox")).toHaveLength(1);
  });

  it("confirms before giving, with the clean @handle", async () => {
    const { walletActions } = open();
    fill("@Bia");
    submit();

    const question = form().getByTestId("gift-confirm").textContent;
    expect(question).toBe(texts.wallet.giftPlus.confirmText("bia"));
    expect(question).toContain("@bia");
    expect(question).toContain(`${formatAmount(PLUS_GIFT_PRICE_GOLD)} de ouro`);
    expect(walletActions.giftPlus).not.toHaveBeenCalled();

    confirm();
    await waitFor(() => expect(walletActions.giftPlus).toHaveBeenCalledWith({ to: "bia" }));
    expect(await form().findByText(texts.wallet.giftPlus.done("bia"))).toBeTruthy();
    expect(walletActions.sendGold).not.toHaveBeenCalled();
  });

  it("gives nothing when the person gives up at the confirmation", () => {
    const { walletActions } = open();
    fill("bia");
    submit();
    fireEvent.click(form().getByRole("button", { name: texts.common.cancel }));
    expect(walletActions.giftPlus).not.toHaveBeenCalled();
  });

  it("asks for the @handle", () => {
    const { walletActions } = open();
    submit();
    expect(form().getByRole("alert").textContent).toBe(texts.wallet.handleInvalid);
    expect(walletActions.giftPlus).not.toHaveBeenCalled();
  });

  it.each(GIFT_ERRORS)("explains a refused gift: %s", async (reason) => {
    const walletActions = makeWalletActions();
    walletActions.giftPlus.mockResolvedValue({ ok: false, reason });
    open(makeLoadedWalletState(), walletActions);
    fill("bia");
    submit();
    confirm();
    expect((await form().findByRole("alert")).textContent).toBe(texts.wallet.errors[reason]);
  });
});
