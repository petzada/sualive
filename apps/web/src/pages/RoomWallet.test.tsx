import { GOLD_GIFT_DAILY_LIMIT, REACTIONS } from "@sualive/config";
import type { CosmeticPaint } from "@sualive/protocol";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatGold } from "../components/room/GoldGift";
import type { SendGoldResult } from "../lib/room";
import { makeActions, makeConnectedState, makeParticipant, makeVideo, renderApp } from "../test/room";
import { makeWallet, makeWalletActions, makeWalletState } from "../test/wallet";
import { texts } from "../texts";

const NAME_PAINT: CosmeticPaint = { light: ["#b42318"], dark: ["#f97066"] };
const FRAME_PAINT: CosmeticPaint = { light: ["#1d4ed8", "#047857"], dark: ["#93c5fd", "#34d399"] };
const PACK_REACTIONS = ["🥳", "🎊"];

const people = () => screen.getByRole("list", { name: texts.people.label });
const personRow = (index: number) => within(people()).getAllByRole("listitem")[index]!;
const paintedNames = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-cosmetic="name"]')];
const frames = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-cosmetic="frame"]')];

/** The viewer and Ana have accounts; Bia entered with a nickname only. */
function giftingState(overrides: Parameters<typeof makeConnectedState>[0] = {}) {
  return makeConnectedState({
    canSendGold: true,
    participants: [
      makeParticipant({ id: "me", nickname: "Eu", isSelf: true, canReceiveGold: true }),
      makeParticipant({ id: "p1", nickname: "Ana", canReceiveGold: true }),
      makeParticipant({ id: "p2", nickname: "Bia" }),
    ],
    ...overrides,
  });
}

const sendButton = (nickname: string) => screen.queryByRole("button", { name: texts.gifts.send(nickname) });

/** Opens the form on Ana, types the amount and goes to the confirmation. */
function fillAmount(amount: string) {
  fireEvent.click(sendButton("Ana")!);
  fireEvent.change(screen.getByLabelText(texts.gifts.amountLabel), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: texts.gifts.next }));
}

describe("cosmetics in the room", () => {
  const withCosmetics = () =>
    makeConnectedState({
      participants: [
        makeParticipant({
          id: "me",
          nickname: "Eu",
          isSelf: true,
          cosmetics: { name: NAME_PAINT, frame: null },
        }),
        makeParticipant({
          id: "p1",
          nickname: "Ana",
          avatarUrl: "https://example.test/ana.png",
          cosmetics: { name: NAME_PAINT, frame: FRAME_PAINT },
        }),
        makeParticipant({ id: "p2", nickname: "Bia" }),
      ],
    });

  it("paints the name and frames the avatar in the people list, the viewer's own included", () => {
    renderApp({ state: withCosmetics() });

    const [self, ana, bia] = [personRow(0), personRow(1), personRow(2)];
    expect(paintedNames(self).map((name) => name.textContent)).toEqual(["Eu"]);
    expect(frames(self)).toHaveLength(0);

    const [name] = paintedNames(ana);
    expect(name?.textContent).toBe("Ana");
    expect(name?.style.getPropertyValue("--cosmetic-light-a")).toBe(NAME_PAINT.light[0]);
    expect(name?.style.getPropertyValue("--cosmetic-dark-a")).toBe(NAME_PAINT.dark[0]);
    const [frame] = frames(ana);
    expect(frame?.querySelector('[data-testid="avatar"]')).toBeTruthy();
    expect(frame?.style.getPropertyValue("--cosmetic-light-b")).toBe(FRAME_PAINT.light[1]);

    expect(paintedNames(bia)).toHaveLength(0);
    expect(frames(bia)).toHaveLength(0);
    expect(bia.textContent).toContain("Bia");
  });

  it("paints the name of who wrote in the chat, except for who has no cosmetic or already left", () => {
    renderApp({
      state: {
        ...withCosmetics(),
        chat: [
          { id: "m1", from: "p1", nickname: "Ana", text: "oi", sentAt: 1 },
          { id: "m2", from: "p2", nickname: "Bia", text: "olá", sentAt: 2 },
          { id: "m3", from: "gone", nickname: "Caio", text: "tchau", sentAt: 3 },
          { id: "m4", from: "me", nickname: "Eu", text: "eu aqui", sentAt: 4 },
        ],
      },
    });

    const messages = within(screen.getByRole("log", { name: texts.chat.label })).getAllByRole("article");
    expect(messages).toHaveLength(4);
    expect(paintedNames(messages[0]!).map((name) => name.textContent)).toEqual(["Ana"]);
    expect(frames(messages[0]!)).toHaveLength(1);
    expect(paintedNames(messages[1]!)).toHaveLength(0);
    expect(messages[1]!.textContent).toContain("Bia");
    expect(paintedNames(messages[2]!)).toHaveLength(0);
    expect(messages[2]!.textContent).toContain("Caio");
    expect(paintedNames(messages[3]!).map((name) => name.textContent)).toEqual(["Eu"]);
  });

  it("paints the name on the video labels, on a surface of the theme", () => {
    renderApp({
      state: {
        ...withCosmetics(),
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen" }),
          makeVideo({ id: "v2", ownerId: "p2" }),
          makeVideo({ id: "v3", ownerId: "me", isLocal: true }),
        ],
        featuredVideoId: "v1",
      },
    });

    const [featured, plain, own] = screen.getAllByTestId("video-label");
    expect(featured!.dataset.surface).toBe("canvas");
    expect(featured!.className).toContain("bg-canvas");
    expect(paintedNames(featured!).map((name) => name.textContent)).toEqual(["Ana"]);
    expect(featured!.textContent).toContain(texts.stage.videoLabel("Ana", "screen", false));
    expect(frames(featured!)).toHaveLength(1);

    expect(plain!.dataset.surface).toBe("stage");
    expect(plain!.className).toContain("bg-stage/70");
    expect(paintedNames(plain!)).toHaveLength(0);
    expect(plain!.textContent).toBe(texts.stage.videoLabel("Bia", "camera", false));

    expect(own!.dataset.surface).toBe("canvas");
    expect(paintedNames(own!).map((name) => name.textContent)).toEqual(["Eu"]);
    expect(own!.textContent).toBe(texts.stage.videoLabel("Eu", "camera", true));
  });

  it("paints the names of the empty stage too", () => {
    renderApp({ state: withCosmetics() });

    const stage = screen.getByRole("region", { name: texts.stage.label });
    expect(paintedNames(stage).map((name) => name.textContent)).toEqual(["Eu", "Ana"]);
    expect(frames(stage)).toHaveLength(1);
  });
});

describe("reactions of a pack", () => {
  const openPicker = () => {
    fireEvent.click(screen.getByRole("button", { name: texts.controls.reactions }));
    return screen.getByRole("group", { name: texts.controls.reactions });
  };

  it("offers the reactions this person may send and sends the chosen one", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({ availableReactions: [...REACTIONS, ...PACK_REACTIONS] }),
      actions,
    });

    const picker = openPicker();
    expect(within(picker).getAllByRole("button")).toHaveLength(REACTIONS.length + PACK_REACTIONS.length);
    fireEvent.click(within(picker).getByRole("button", { name: texts.controls.react("🥳") }));

    expect(actions.react).toHaveBeenCalledTimes(1);
    expect(actions.react).toHaveBeenCalledWith("🥳");
    expect(screen.queryByRole("group", { name: texts.controls.reactions })).toBeNull();
  });

  it("shows only the basic ones without a pack", () => {
    renderApp({ state: makeConnectedState() });

    const picker = openPicker();
    expect(within(picker).getAllByRole("button")).toHaveLength(REACTIONS.length);
    expect(within(picker).queryByRole("button", { name: texts.controls.react("🥳") })).toBeNull();
  });

  it("follows the list of the room, not the fixed one", () => {
    renderApp({ state: makeConnectedState({ availableReactions: ["🎊"] }) });

    const buttons = within(openPicker()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["🎊"]);
  });
});

describe("sending gold in the room", () => {
  it("is offered only to who has an account, about who can receive, never about oneself", () => {
    renderApp({ state: giftingState() });

    expect(sendButton("Ana")).toBeTruthy();
    expect(sendButton("Bia")).toBeNull();
    expect(sendButton("Eu")).toBeNull();
    // Any participant with an account, not only the owner; the owner menu is not part of it.
    expect(screen.queryByRole("button", { name: texts.people.moderate("Ana") })).toBeNull();
  });

  it("is not offered to who has no account", () => {
    renderApp({ state: giftingState({ canSendGold: false }) });

    expect(sendButton("Ana")).toBeNull();
    expect(sendButton("Bia")).toBeNull();
  });

  it("keeps the moderation menu of the owner beside it", () => {
    const actions = makeActions();
    renderApp({ state: giftingState({ isOwner: true }), actions });

    expect(sendButton("Ana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: texts.people.moderate("Ana") }));
    fireEvent.click(screen.getByRole("button", { name: texts.people.kick }));
    fireEvent.click(screen.getByRole("button", { name: texts.people.confirmKickAction }));
    expect(actions.moderate).toHaveBeenCalledWith("kick", "p1");
    // One panel at a time under a person: opening the gift closes the moderation and vice versa.
    fireEvent.click(screen.getByRole("button", { name: texts.people.moderate("Ana") }));
    fireEvent.click(sendButton("Ana")!);
    expect(screen.queryByRole("button", { name: texts.people.kick })).toBeNull();
    expect(screen.getByRole("form", { name: texts.gifts.send("Ana") })).toBeTruthy();
    // Bia has no account: moderation only.
    expect(screen.getByRole("button", { name: texts.people.moderate("Bia") })).toBeTruthy();
    expect(sendButton("Bia")).toBeNull();
  });

  it("loads the wallet on opening and shows the balance and what is left for today", () => {
    const walletActions = makeWalletActions();
    renderApp({
      state: giftingState(),
      wallet: makeWalletState({ wallet: makeWallet({ gold: 1500, goldSentToday: 300 }) }),
      walletActions,
    });
    expect(walletActions.load).not.toHaveBeenCalled();

    fireEvent.click(sendButton("Ana")!);

    expect(walletActions.load).toHaveBeenCalledTimes(1);
    const form = screen.getByRole("form", { name: texts.gifts.send("Ana") });
    expect(form.textContent).toContain(texts.gifts.balance(formatGold(1500)));
    expect(form.textContent).toContain(texts.gifts.remainingToday(formatGold(GOLD_GIFT_DAILY_LIMIT - 300)));
    expect(document.activeElement).toBe(screen.getByLabelText(texts.gifts.amountLabel));
  });

  it("says the balance is loading, or that it could not be loaded", () => {
    const first = renderApp({ state: giftingState() });
    fireEvent.click(sendButton("Ana")!);
    expect(screen.getByText(texts.gifts.walletLoading)).toBeTruthy();
    first.unmount();

    renderApp({ state: giftingState(), wallet: makeWalletState({ status: "error" }) });
    fireEvent.click(sendButton("Ana")!);
    expect(screen.getByText(texts.gifts.walletError)).toBeTruthy();
  });

  it("asks for confirmation, sends, closes, tells and refreshes the wallet", async () => {
    const actions = makeActions();
    const walletActions = makeWalletActions();
    renderApp({
      state: giftingState(),
      actions,
      wallet: makeWalletState({ wallet: makeWallet() }),
      walletActions,
    });

    fillAmount("100");
    expect(screen.getByText(texts.gifts.confirmQuestion(formatGold(100), "Ana"))).toBeTruthy();
    expect(actions.sendGold).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: texts.gifts.confirm }));

    expect(actions.sendGold).toHaveBeenCalledTimes(1);
    expect(actions.sendGold).toHaveBeenCalledWith("p1", 100);
    await waitFor(() => expect(walletActions.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("group", { name: texts.gifts.send("Ana") })).toBeNull();
    expect(screen.queryByRole("form", { name: texts.gifts.send("Ana") })).toBeNull();
    const sent = screen.getByText(texts.gifts.sent(formatGold(100), "Ana"));
    expect(sent.getAttribute("role")).toBe("status");
    expect(document.activeElement).toBe(sendButton("Ana"));
  });

  it("goes back from the confirmation without sending", () => {
    const actions = makeActions();
    renderApp({ state: giftingState(), actions });

    fillAmount("250");
    fireEvent.click(screen.getByRole("button", { name: texts.common.back }));

    expect((screen.getByLabelText(texts.gifts.amountLabel) as HTMLInputElement).value).toBe("250");
    fireEvent.click(screen.getByRole("button", { name: texts.common.cancel }));
    expect(screen.queryByRole("form", { name: texts.gifts.send("Ana") })).toBeNull();
    expect(actions.sendGold).not.toHaveBeenCalled();
  });

  it.each(["", "0", String(GOLD_GIFT_DAILY_LIMIT + 1)])("refuses the amount %j before asking", (amount) => {
    const actions = makeActions();
    renderApp({ state: giftingState(), actions });

    fillAmount(amount);

    expect(screen.getByRole("alert").textContent).toBe(
      texts.gifts.invalidAmount(formatGold(GOLD_GIFT_DAILY_LIMIT)),
    );
    expect(screen.queryByRole("button", { name: texts.gifts.confirm })).toBeNull();
    expect(actions.sendGold).not.toHaveBeenCalled();
  });

  it("keeps only digits in the amount", () => {
    renderApp({ state: giftingState() });

    fireEvent.click(sendButton("Ana")!);
    const input = screen.getByLabelText<HTMLInputElement>(texts.gifts.amountLabel);
    fireEvent.change(input, { target: { value: "1.5a0" } });
    expect(input.value).toBe("150");
  });

  it.each(["insufficient_funds", "daily_limit", "not_allowed", "not_found", "error", "lost"] as const)(
    "explains the refusal %s and keeps the form open",
    async (reason) => {
      const actions = makeActions();
      actions.sendGold.mockResolvedValue({ ok: false, reason });
      const walletActions = makeWalletActions();
      renderApp({ state: giftingState(), actions, walletActions });

      fillAmount("100");
      fireEvent.click(screen.getByRole("button", { name: texts.gifts.confirm }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(texts.gifts.errors[reason]);
      expect(screen.getByRole("form", { name: texts.gifts.send("Ana") })).toBeTruthy();
      expect(screen.queryByText(texts.gifts.sent(formatGold(100), "Ana"))).toBeNull();
      // Without an answer the gold may have left: only then the balance is fetched again.
      expect(walletActions.refresh).toHaveBeenCalledTimes(reason === "lost" ? 1 : 0);
    },
  );

  it("has a text of its own for each refusal", () => {
    const messages = Object.values(texts.gifts.errors);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("disables the buttons while the gift is on its way", async () => {
    const actions = makeActions();
    let answer: (result: SendGoldResult) => void = () => {};
    actions.sendGold.mockImplementation(
      () =>
        new Promise<SendGoldResult>((resolve) => {
          answer = resolve;
        }),
    );
    renderApp({ state: giftingState(), actions });

    fillAmount("100");
    fireEvent.click(screen.getByRole("button", { name: texts.gifts.confirm }));

    const sending = screen.getByRole<HTMLButtonElement>("button", { name: texts.gifts.sending });
    expect(sending.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: texts.common.back }).disabled).toBe(true);
    fireEvent.click(sending);
    expect(actions.sendGold).toHaveBeenCalledTimes(1);

    answer({ ok: true });
    expect(await screen.findByText(texts.gifts.sent(formatGold(100), "Ana"))).toBeTruthy();
  });

  it("is not offered while reconnecting", () => {
    renderApp({ state: giftingState({ phase: "reconnecting" }) });
    expect(sendButton("Ana")).toBeNull();
  });
});

describe("gold sent in the room", () => {
  const notices = () => screen.getByTestId("gift-notices");

  it("tells everyone, in a live region", () => {
    renderApp({
      state: makeConnectedState({
        gifts: [
          { id: "g1", fromId: "p1", fromNickname: "Ana", toId: "p2", toNickname: "Bia", amount: 100 },
          { id: "g2", fromId: "gone", fromNickname: "Caio", toId: "me", toNickname: "Eu", amount: 1500 },
        ],
      }),
    });

    expect(notices().getAttribute("role")).toBe("status");
    const lines = [...notices().querySelectorAll("p")].map((line) => line.textContent);
    expect(lines).toEqual([
      texts.gifts.notice("Ana", formatGold(100), "Bia"),
      texts.gifts.notice("Caio", formatGold(1500), "Eu"),
    ]);
    expect(lines[0]).toBe("Ana enviou 100 de ouro para Bia");
    // In the flow of the side panel: neither over the stage nor inside the controls.
    expect(screen.getByRole("region", { name: texts.stage.label }).contains(notices())).toBe(false);
    expect(screen.getByTestId("control-bar").contains(notices())).toBe(false);
  });

  it("shows nothing once the room drops the notice, keeping the live region", () => {
    const gift = { id: "g1", fromId: "p1", fromNickname: "Ana", toId: "p2", toNickname: "Bia", amount: 100 };
    const first = renderApp({ state: makeConnectedState({ gifts: [gift] }) });
    expect(notices().textContent).toContain("Ana");
    first.unmount();

    renderApp({ state: makeConnectedState() });
    expect(notices().getAttribute("role")).toBe("status");
    expect(notices().textContent).toBe("");
  });
});
