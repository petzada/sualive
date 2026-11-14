import {
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  RELAY_VIDEO_GOLD_PER_HOUR,
  ROOM_MAX_PEOPLE,
  WATCHED_VIDEOS_PER_PERSON,
} from "@sualive/config";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PATHS } from "../components/account/paths";
import { formatAmount, formatCountdown, splitDuration } from "../components/format";
import { noticeText } from "../components/room/NoticeBanner";
import type { ProtectedMeter, RoomState } from "../lib/room";
import {
  makeActions,
  makeConnectedState,
  makeParticipant,
  makeState,
  makeVideo,
  renderApp,
} from "../test/room";
import { texts } from "../texts";

/** jsdom has no MediaStream; the elements only need an object to hold. */
const fakeStream = () => ({}) as MediaStream;

const stage = () => screen.getByRole("region", { name: texts.stage.label });
const cards = () => screen.queryAllByTestId("watch-card");
const cardOf = (videoId: string) => cards().find((card) => card.dataset.videoId === videoId)!;
const people = () => screen.getByRole("list", { name: texts.people.label });
const personRow = (index: number) => within(people()).getAllByRole("listitem")[index]!;
const moderateButton = (nickname: string) =>
  screen.queryByRole("button", { name: texts.people.moderate(nickname) });
const MINUTE = 60_000;

function meter(overrides: Partial<ProtectedMeter> = {}): ProtectedMeter {
  return {
    state: "ok",
    remainingMs: 42 * MINUTE,
    goldPerHour: PROTECTED_ROOM_GOLD_PER_HOUR,
    graceEndsAt: null,
    ...overrides,
  };
}

/** A protected room seen by a guest with an account; Ana owns it. */
function protectedState(overrides: Partial<RoomState> = {}): RoomState {
  return makeConnectedState({
    protected: true,
    maxVideos: PROTECTED_ROOM_MAX_VIDEOS,
    occupancy: { participants: 3, capacity: PROTECTED_ROOM_MAX_PEOPLE },
    protectedMeter: meter(),
    participants: [
      makeParticipant({ id: "me", nickname: "Eu", isSelf: true, canReceiveGold: true }),
      makeParticipant({ id: "p1", nickname: "Ana", isOwner: true, canReceiveGold: true }),
      makeParticipant({ id: "p2", nickname: "Bia" }),
    ],
    ...overrides,
  });
}

describe("video on demand", () => {
  it("shows a video nobody asked for as a card with who transmits, what it is and the button to watch", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen", watch: "idle" }),
          makeVideo({ id: "v2", ownerId: "p2", kind: "camera", watch: "idle" }),
        ],
      }),
      actions,
    });

    expect(cards()).toHaveLength(2);
    // A card is not a tile: nothing is on the stage until the person asks.
    expect(screen.queryByTestId("video-tile")).toBeNull();
    const ana = within(cardOf("v1"));
    expect(ana.getByText("Ana")).toBeTruthy();
    expect(ana.getByTestId("watch-card-kind").textContent).toBe(texts.stage.watch.kind.screen);
    expect(within(cardOf("v2")).getByTestId("watch-card-kind").textContent).toBe(
      texts.stage.watch.kind.camera,
    );

    // The name of the button says the target.
    expect(texts.stage.watch.actionLabel("Ana", "screen")).toBe("Assistir a tela de Ana");
    const watch = screen.getByRole("button", { name: texts.stage.watch.actionLabel("Ana", "screen") });
    expect(watch.textContent).toBe(texts.stage.watch.action);
    fireEvent.click(watch);
    expect(actions.watchVideo).toHaveBeenCalledTimes(1);
    expect(actions.watchVideo).toHaveBeenCalledWith("v1");

    fireEvent.click(screen.getByRole("button", { name: texts.stage.watch.actionLabel("Bia", "camera") }));
    expect(actions.watchVideo).toHaveBeenLastCalledWith("v2");
  });

  it("paints the name of who transmits on the card", () => {
    renderApp({
      state: makeConnectedState({
        participants: [
          makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
          makeParticipant({
            id: "p1",
            nickname: "Ana",
            cosmetics: { name: { light: ["#b42318"], dark: ["#f97066"] }, frame: null },
          }),
        ],
        videos: [makeVideo({ id: "v1", ownerId: "p1", watch: "idle" })],
      }),
    });

    const name = cardOf("v1").querySelector<HTMLElement>('[data-cosmetic="name"]');
    expect(name?.textContent).toBe("Ana");
  });

  it("says a requested video is opening, with no button", () => {
    renderApp({
      state: makeConnectedState({
        videos: [makeVideo({ id: "v1", ownerId: "p1", kind: "screen", watch: "requesting" })],
        watchedCount: 1,
      }),
    });

    const card = within(cardOf("v1"));
    expect(cardOf("v1").dataset.watch).toBe("requesting");
    expect(card.getByRole("status").textContent).toBe(texts.stage.watch.requesting);
    expect(card.queryByRole("button")).toBeNull();
  });

  it.each([
    ["relay_no_plus", "precisa do Plus"],
    ["relay_no_gold", "está sem ouro"],
  ] as const)("explains a video blocked by %s and only offers to give it up", (reason, path) => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "camera", watch: "blocked", blockedReason: reason }),
        ],
        watchedCount: 1,
      }),
      actions,
    });

    const card = within(cardOf("v1"));
    const explanation = card.getByTestId("watch-blocked");
    expect(explanation.dataset.reason).toBe(reason);
    expect(explanation.textContent).toBe(texts.stage.watch.blocked[reason]);
    expect(explanation.textContent).toContain(path);
    expect(explanation.getAttribute("role")).toBe("status");
    // No "watch" that would do nothing; giving up frees the place among the watched videos.
    expect(card.queryByRole("button", { name: texts.stage.watch.actionLabel("Ana", "camera") })).toBeNull();
    expect(card.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(card.getByRole("button", { name: texts.stage.watch.stopLabel("Ana", "camera") }));
    expect(actions.unwatchVideo).toHaveBeenCalledWith("v1");
  });

  it("has different texts for the two reasons of a blocked video", () => {
    expect(texts.stage.watch.blocked.relay_no_plus).not.toBe(texts.stage.watch.blocked.relay_no_gold);
  });

  it("keeps the watched videos as tiles, each with its own way to stop watching", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen", stream: fakeStream() }),
          // Allowed by the server, media still on its way: already a tile.
          makeVideo({ id: "v2", ownerId: "p2", kind: "camera", stream: null }),
          makeVideo({ id: "v3", ownerId: "p2", kind: "screen", watch: "idle" }),
        ],
        featuredVideoId: "v1",
        watchedCount: 2,
      }),
      actions,
    });

    expect(screen.getAllByTestId("video-tile")).toHaveLength(2);
    expect(cards()).toHaveLength(1);
    expect(within(stage()).getByText(texts.stage.waiting)).toBeTruthy();

    expect(texts.stage.watch.stopLabel("Ana", "screen")).toBe("Parar de assistir a tela de Ana");
    fireEvent.click(screen.getByRole("button", { name: texts.stage.watch.stopLabel("Ana", "screen") }));
    expect(actions.unwatchVideo).toHaveBeenCalledWith("v1");
    fireEvent.click(screen.getByRole("button", { name: texts.stage.watch.stopLabel("Bia", "camera") }));
    expect(actions.unwatchVideo).toHaveBeenLastCalledWith("v2");
    // The thumbnail can still be featured: stopping is another button over it.
    expect(screen.getByRole("button", { name: texts.stage.feature("Bia", "camera") })).toBeTruthy();
  });

  it("features only what is on the stage, never a card", () => {
    renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen", watch: "idle" }),
          makeVideo({ id: "v2", ownerId: "p2", kind: "camera", stream: fakeStream() }),
        ],
        featuredVideoId: null,
        watchedCount: 1,
      }),
    });

    const [tile] = screen.getAllByTestId("video-tile");
    expect(tile!.dataset.featured).toBe("true");
    expect(within(tile!).getByLabelText(texts.stage.videoLabel("Bia", "camera", false))).toBeTruthy();
  });

  it("says how many videos the person watches of the maximum while there are cards", () => {
    const view = renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", stream: fakeStream() }),
          makeVideo({ id: "v2", ownerId: "p2", watch: "idle" }),
        ],
        watchedCount: 1,
      }),
    });
    expect(screen.getByTestId("watch-count").textContent).toBe(
      texts.stage.watch.count(1, WATCHED_VIDEOS_PER_PERSON),
    );
    expect(screen.queryByTestId("watch-limit")).toBeNull();
    view.unmount();

    // Nothing to pick: no count either.
    renderApp({
      state: makeConnectedState({
        videos: [makeVideo({ id: "v1", ownerId: "p1", stream: fakeStream() })],
        watchedCount: 1,
      }),
    });
    expect(screen.queryByTestId("watch-cards")).toBeNull();
    expect(screen.queryByTestId("watch-count")).toBeNull();
  });

  it("turns off watching at the limit and says why", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        videos: [makeVideo({ id: "v9", ownerId: "p2", kind: "screen", watch: "idle" })],
        maxWatchedVideos: 3,
        watchedCount: 3,
      }),
      actions,
    });

    const watch = screen.getByRole("button", { name: texts.stage.watch.actionLabel("Bia", "screen") });
    expect(watch.hasAttribute("disabled")).toBe(true);
    const limit = screen.getByTestId("watch-limit");
    // The number comes from the room, not from the text.
    expect(limit.textContent).toBe(texts.stage.watch.limit(3));
    expect(watch.getAttribute("aria-describedby")).toBe(limit.id);
    expect(screen.getByTestId("watch-count").textContent).toBe(texts.stage.watch.count(3, 3));
    fireEvent.click(watch);
    expect(actions.watchVideo).not.toHaveBeenCalled();
  });

  it("keeps the cards of a full room in one row that scrolls sideways, and the stage inside the window", () => {
    const others = Array.from({ length: ROOM_MAX_PEOPLE - 1 }, (_, index) =>
      makeParticipant({ id: `p${index + 1}`, nickname: `Pessoa ${index + 1}` }),
    );
    renderApp({
      state: makeConnectedState({
        occupancy: { participants: ROOM_MAX_PEOPLE, capacity: ROOM_MAX_PEOPLE },
        participants: [makeParticipant({ id: "me", nickname: "Eu", isSelf: true }), ...others],
        videos: others.map((person, index) =>
          makeVideo({ id: `v${index + 1}`, ownerId: person.id, watch: "idle" }),
        ),
      }),
    });

    expect(cards()).toHaveLength(ROOM_MAX_PEOPLE - 1);
    const list = cards()[0]!.parentElement!;
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-labelledby")).toBe(
      screen.getByRole("heading", { name: texts.stage.watch.listLabel }).id,
    );
    for (const name of ["flex", "overflow-x-auto"]) expect(list.className.split(" ")).toContain(name);
    for (const card of cards()) expect(card.className.split(" ")).toContain("shrink-0");
    // On a phone the stage has a ceiling, so the chat and the controls keep their place.
    expect(stage().className).toMatch(/(^| )max-h-\[\d+%\]( |$)/);
    expect(stage().className.split(" ")).toContain("lg:max-h-none");
    expect(screen.getByRole("toolbar", { name: texts.controls.label })).toBeTruthy();
  });

  it("cannot ask for anything while reconnecting", () => {
    renderApp({
      state: makeConnectedState({
        phase: "reconnecting",
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen", stream: fakeStream() }),
          makeVideo({ id: "v2", ownerId: "p2", kind: "camera", watch: "idle" }),
        ],
        watchedCount: 1,
      }),
    });

    for (const name of [
      texts.stage.watch.actionLabel("Bia", "camera"),
      texts.stage.watch.stopLabel("Ana", "screen"),
    ]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });
});

describe("for who transmits", () => {
  const broadcasting = (overrides: Partial<RoomState> = {}, video: Parameters<typeof makeVideo>[0] = {}) =>
    makeConnectedState({
      participants: [
        makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
        makeParticipant({ id: "p1", nickname: "Ana" }),
        makeParticipant({ id: "p2", nickname: "Bia" }),
        makeParticipant({ id: "p3", nickname: "Caio" }),
      ],
      videos: [
        makeVideo({ id: "v1", ownerId: "me", kind: "screen", stream: fakeStream(), isLocal: true, ...video }),
      ],
      featuredVideoId: "v1",
      localVideoIds: ["v1"],
      ...overrides,
    });

  it.each([
    [[], texts.stage.broadcast.viewers(0)],
    [["p1"], texts.stage.broadcast.viewers(1)],
    [["p1", "p2", "p3"], texts.stage.broadcast.viewers(3)],
  ])("says how many people watch the own video (%j)", (viewers, sentence) => {
    renderApp({ state: broadcasting({}, { viewers }) });

    const count = screen.getByTestId("video-viewers");
    expect(count.textContent).toBe(String(viewers.length));
    expect(count.getAttribute("aria-label")).toBe(
      texts.stage.broadcast.viewersLabel(viewers.length, "screen"),
    );
    expect(count.getAttribute("aria-label")).toContain(sentence);
    // The own video has nothing to stop watching.
    expect(screen.queryByTestId("unwatch-video")).toBeNull();
    // No blocked viewer and no relay: nothing else to tell.
    expect(screen.queryByTestId("broadcast-status")).toBeNull();
  });

  it("does not count viewers on the videos of the others", () => {
    renderApp({
      state: makeConnectedState({ videos: [makeVideo({ id: "v1", ownerId: "p1", stream: fakeStream() })] }),
    });
    expect(screen.queryByTestId("video-viewers")).toBeNull();
  });

  it.each([
    ["relay_no_plus", "relay-plus-link", PATHS.plus, texts.stage.broadcast.plusLink],
    ["relay_no_gold", "relay-wallet-link", PATHS.wallet, texts.stage.broadcast.walletLink],
  ] as const)(
    "warns about who cannot receive the video (%s) with the way out",
    (reason, testId, href, text) => {
      renderApp({
        state: broadcasting(
          {},
          {
            viewers: ["p3"],
            blockedViewers: [
              { participantId: "p1", reason },
              { participantId: "p2", reason },
            ],
          },
        ),
      });

      const notice = screen.getByTestId("blocked-viewers");
      expect(notice.dataset.reason).toBe(reason);
      expect(notice.getAttribute("role")).toBe("status");
      expect(notice.textContent).toContain(texts.stage.broadcast.blocked[reason]("Ana e Bia", 2, "screen"));
      const link = within(notice).getByTestId(testId);
      expect(link.getAttribute("href")).toBe(href);
      expect(link.textContent).toContain(text);
      // Leaving the page would end the call.
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.textContent).toContain(texts.room.newTab);
      // Only the link of this reason.
      expect(
        screen.queryByTestId(testId === "relay-plus-link" ? "relay-wallet-link" : "relay-plus-link"),
      ).toBeNull();
    },
  );

  it("names one, two or more people", () => {
    expect(texts.people.names(["Ana"])).toBe("Ana");
    expect(texts.people.names(["Ana", "Bia"])).toBe("Ana e Bia");
    expect(texts.people.names(["Ana", "Bia", "Caio"])).toBe("Ana, Bia e Caio");
    expect(texts.stage.broadcast.blocked.relay_no_plus("Ana", 1, "camera")).toContain(
      "Ana não recebe a sua câmera",
    );
  });

  it("says how many relayed pairs are being paid and the price of each per hour", () => {
    const pairs = 3;
    renderApp({
      state: broadcasting({
        relayMeter: { pairs, goldPerHour: pairs * RELAY_VIDEO_GOLD_PER_HOUR, state: "paying" },
      }),
    });

    const relay = screen.getByTestId("relay-meter");
    expect(relay.dataset.state).toBe("paying");
    expect(relay.textContent).toBe(
      texts.stage.broadcast.relayPaying(
        pairs,
        formatAmount(RELAY_VIDEO_GOLD_PER_HOUR),
        formatAmount(pairs * RELAY_VIDEO_GOLD_PER_HOUR),
      ),
    );
    expect(relay.textContent).toContain(`${pairs} pares`);
    expect(relay.textContent).toContain(`${RELAY_VIDEO_GOLD_PER_HOUR} de ouro por hora por par`);
    expect(relay.getAttribute("role")).toBe("status");
  });

  it("shows no relay price while no pair is being paid", () => {
    renderApp({ state: broadcasting({ relayMeter: { pairs: 0, goldPerHour: 0, state: "paying" } }) });
    expect(screen.queryByTestId("relay-meter")).toBeNull();
  });

  it("warns that the video stopped on the relayed pairs when the gold ran out, and that the voice goes on", () => {
    renderApp({ state: broadcasting({ relayMeter: { pairs: 0, goldPerHour: 0, state: "no_gold" } }) });

    const relay = screen.getByTestId("relay-meter");
    expect(relay.dataset.state).toBe("no_gold");
    expect(relay.getAttribute("role")).toBe("alert");
    expect(relay.textContent).toContain(texts.stage.broadcast.relayNoGold);
    expect(texts.stage.broadcast.relayNoGold).toContain("A voz continua");
    expect(within(relay).getByTestId("relay-wallet-link").getAttribute("href")).toBe(PATHS.wallet);
  });
});

describe("protected room", () => {
  const explanation = texts.protectedRoom.explanation(PROTECTED_ROOM_MAX_PEOPLE, PROTECTED_ROOM_MAX_VIDEOS);

  it("shows the badge at the top of the room, with what it means one press away", async () => {
    renderApp({ state: protectedState() });

    const header = screen.getByRole("banner");
    const badge = within(header).getByRole("button", { name: texts.protectedRoom.about });
    expect(badge).toBe(within(header).getByTestId("protected-badge"));
    expect(badge.textContent).toBe(texts.protectedRoom.badge);

    fireEvent.click(badge);
    const dialog = await screen.findByTestId("protected-explanation");
    expect(dialog.textContent).toContain(explanation);
    // The limits are those of the room.
    expect(explanation).toContain(`${PROTECTED_ROOM_MAX_PEOPLE} pessoas`);
    expect(explanation).toContain(`${PROTECTED_ROOM_MAX_VIDEOS} vídeos`);
    expect(explanation).toContain("retransmissão");
    expect(explanation).toContain("IP");
  });

  it("has no badge and no meter in a direct room", () => {
    renderApp({ state: makeConnectedState() });
    expect(screen.queryByTestId("protected-badge")).toBeNull();
    expect(screen.queryByTestId("protected-meter")).toBeNull();
  });

  it("warns in the lobby that the room is protected, before entering", () => {
    renderApp({
      state: makeState({
        protected: true,
        occupancy: { participants: 2, capacity: PROTECTED_ROOM_MAX_PEOPLE },
      }),
    });

    const notice = screen.getByTestId("protected-notice");
    expect(within(notice).getByTestId("protected-badge").textContent).toBe(texts.protectedRoom.badge);
    // The ceiling of videos only arrives on entering: the lobby says the one of the parameters.
    expect(within(notice).getByText(explanation)).toBeTruthy();
    const join = screen.getByRole("button", { name: texts.lobby.join });
    expect(notice.compareDocumentPosition(join) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no such warning in the lobby of a direct room", () => {
    renderApp({ state: makeState() });
    expect(screen.queryByTestId("protected-notice")).toBeNull();
  });

  it("shows the time the balance of the owner still covers, never the gold", () => {
    renderApp({ state: protectedState({ protectedMeter: meter({ remainingMs: 42 * MINUTE }) }) });

    const line = screen.getByTestId("protected-meter");
    expect(line.dataset.state).toBe("ok");
    expect(texts.protectedRoom.duration(0, 42)).toBe("cerca de 42 min");
    expect(line.textContent).toBe(`${texts.protectedRoom.remainingLead} cerca de 42 min`);
    expect(document.body.textContent).not.toContain(formatAmount(PROTECTED_ROOM_GOLD_PER_HOUR));
    // Quiet while there is balance: no alert, no way out to show, nobody highlighted.
    expect(line.getAttribute("role")).toBeNull();
    expect(screen.queryByTestId("protected-send-gold")).toBeNull();
    expect(screen.queryByTestId("protected-wallet-link")).toBeNull();
  });

  it("writes the time in hours and minutes", () => {
    expect(splitDuration(80 * MINUTE)).toEqual({ hours: 1, minutes: 20 });
    expect(texts.protectedRoom.duration(1, 20)).toBe("cerca de 1 h 20 min");
    expect(texts.protectedRoom.duration(2, 0)).toBe("cerca de 2 h");
    expect(splitDuration(20_000)).toEqual({ hours: 0, minutes: 0 });
    expect(texts.protectedRoom.duration(0, 0)).toBe("menos de 1 min");
    expect(formatCountdown(89_500)).toBe("1:30");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("gives the warning its own place and sends who has an account to the owner's gold button", () => {
    const state = protectedState({
      canSendGold: true,
      protectedMeter: meter({ state: "warning", remainingMs: 9 * MINUTE }),
    });
    renderApp({ state });

    const warning = screen.getByTestId("protected-meter");
    expect(warning.dataset.state).toBe("warning");
    expect(warning.getAttribute("role")).toBe("status");
    expect(warning.textContent).toContain(texts.protectedRoom.warning("cerca de 9 min"));
    // Out of the header, above the stage.
    expect(screen.getByRole("banner").contains(warning)).toBe(false);
    expect(warning.compareDocumentPosition(stage()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The button that already exists in the people list stands out on the owner only.
    const toOwner = screen.getByRole("button", { name: texts.gifts.send("Ana") });
    expect(toOwner.dataset.highlighted).toBe("true");
    for (const name of ["bg-accent", "text-on-accent"]) expect(toOwner.className.split(" ")).toContain(name);

    // The warning opens that same form, showing the people on a phone.
    fireEvent.click(within(warning).getByRole("button", { name: texts.protectedRoom.sendToOwner }));
    expect(screen.getByRole("tab", { name: texts.room.tabs.people(3) }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(within(personRow(1)).getByLabelText(texts.gifts.amountLabel)).toBeTruthy();
  });

  it("does not highlight the gold button while the balance is fine", () => {
    renderApp({ state: protectedState({ canSendGold: true }) });
    expect(screen.getByRole("button", { name: texts.gifts.send("Ana") }).dataset.highlighted).toBeUndefined();
  });

  it("counts down the tolerance and says the room ends without a recharge", () => {
    renderApp({
      state: protectedState({
        canSendGold: true,
        protectedMeter: meter({ state: "grace", remainingMs: 0, graceEndsAt: Date.now() + 90_000 }),
      }),
    });

    const alert = screen.getByTestId("protected-meter");
    expect(alert.dataset.state).toBe("grace");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain(texts.protectedRoom.grace);
    expect(texts.protectedRoom.grace).toContain("encerra");
    const countdown = within(alert).getByRole("timer", { name: texts.protectedRoom.graceTimerLabel });
    expect(countdown.textContent).toBe("1:30");
    expect(within(alert).getByRole("button", { name: texts.protectedRoom.sendToOwner })).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.gifts.send("Ana") }).dataset.highlighted).toBe("true");
  });

  it("sends the owner to the wallet instead", () => {
    renderApp({
      state: protectedState({
        isOwner: true,
        canSendGold: true,
        participants: [
          makeParticipant({ id: "me", nickname: "Eu", isSelf: true, isOwner: true, canReceiveGold: true }),
          makeParticipant({ id: "p1", nickname: "Ana", canReceiveGold: true }),
        ],
        protectedMeter: meter({ state: "grace", remainingMs: 0, graceEndsAt: Date.now() + 60_000 }),
      }),
    });

    const alert = within(screen.getByTestId("protected-meter"));
    const wallet = alert.getByTestId("protected-wallet-link");
    expect(wallet.getAttribute("href")).toBe(PATHS.wallet);
    expect(wallet.getAttribute("target")).toBe("_blank");
    expect(wallet.textContent).toContain(texts.protectedRoom.ownerWallet);
    expect(alert.queryByRole("button", { name: texts.protectedRoom.sendToOwner })).toBeNull();
    // Nobody to highlight: the owner does not send gold to the owner.
    expect(screen.getByRole("button", { name: texts.gifts.send("Ana") }).dataset.highlighted).toBeUndefined();
  });

  it("tells a guest without an account who can help, with no button that would not work", () => {
    renderApp({
      state: protectedState({ protectedMeter: meter({ state: "warning", remainingMs: 2 * MINUTE }) }),
    });

    const warning = within(screen.getByTestId("protected-meter"));
    expect(warning.getByTestId("protected-gift-hint").textContent).toBe(texts.protectedRoom.giftHint);
    expect(warning.queryByRole("button")).toBeNull();
    expect(warning.queryByRole("link")).toBeNull();
  });

  it("has its own end screen when the balance of the owner ran out", () => {
    renderApp({ state: makeState({ phase: "ended", protected: true, endReason: "no_gold" }) });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.roomEnd.endedNoGold.title);
    expect(screen.getByText(texts.roomEnd.endedNoGold.message)).toBeTruthy();
    expect(texts.roomEnd.endedNoGold.message).toContain("o saldo do dono acabou");
    expect(screen.queryByText(texts.roomEnd.ended.message)).toBeNull();
    expect(screen.getByTestId("room-end").dataset.reason).toBe("no_gold");
    expect(screen.getByRole("link", { name: texts.roomEnd.ended.action }).getAttribute("href")).toBe("/");
  });

  it("keeps the usual end screen for any other ended room", () => {
    renderApp({ state: makeState({ phase: "ended" }) });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.roomEnd.ended.title);
    expect(screen.getByTestId("room-end").dataset.reason).toBe("ended");
  });
});

describe("moderator", () => {
  /** Eu, Ana (owner), Bia (moderator) and Caio (common). */
  const withModerator = (
    overrides: Partial<RoomState> = {},
    self: Parameters<typeof makeParticipant>[0] = {},
  ) =>
    makeConnectedState({
      occupancy: { participants: 4, capacity: ROOM_MAX_PEOPLE },
      participants: [
        makeParticipant({ id: "me", nickname: "Eu", isSelf: true, ...self }),
        makeParticipant({ id: "p1", nickname: "Ana", isOwner: !self.isOwner }),
        makeParticipant({ id: "p2", nickname: "Bia", isModerator: true }),
        makeParticipant({ id: "p3", nickname: "Caio", micMuted: false }),
      ],
      ...overrides,
    });

  it("marks the moderators in the people list", () => {
    renderApp({ state: withModerator() });

    const badges = screen.getAllByTestId("moderator-badge");
    expect(badges).toHaveLength(1);
    expect(personRow(2).contains(badges[0]!)).toBe(true);
    expect(badges[0]!.textContent).toBe(texts.people.moderator);
    // The owner keeps the badge of owner.
    expect(within(personRow(1)).getByText(texts.people.owner)).toBeTruthy();
    // A common participant moderates nobody.
    for (const name of ["Ana", "Bia", "Caio"]) expect(moderateButton(name)).toBeNull();
  });

  it("lets the owner promote a participant and demote a moderator", () => {
    const actions = makeActions();
    renderApp({ state: withModerator({ isOwner: true }, { isOwner: true }), actions });

    fireEvent.click(moderateButton("Caio")!);
    const caio = within(personRow(3));
    expect(caio.queryByRole("button", { name: texts.people.demote })).toBeNull();
    fireEvent.click(caio.getByRole("button", { name: texts.people.promote }));
    expect(actions.setModerator).toHaveBeenCalledWith("p3", true);
    // Applied when the server confirms; the menu closes.
    expect(screen.queryByTestId("moderation-menu")).toBeNull();

    fireEvent.click(moderateButton("Bia")!);
    const bia = within(personRow(2));
    expect(bia.queryByRole("button", { name: texts.people.promote })).toBeNull();
    fireEvent.click(bia.getByRole("button", { name: texts.people.demote }));
    expect(actions.setModerator).toHaveBeenLastCalledWith("p2", false);
    // The owner still removes and bans a moderator.
    fireEvent.click(moderateButton("Bia")!);
    expect(within(personRow(2)).getByRole("button", { name: texts.people.kick })).toBeTruthy();
  });

  it("lets a moderator silence, remove and ban common participants only", () => {
    const actions = makeActions();
    renderApp({ state: withModerator({ isModerator: true }, { isModerator: true }), actions });

    // Never the owner, another moderator or the own row.
    expect(moderateButton("Ana")).toBeNull();
    expect(moderateButton("Bia")).toBeNull();
    expect(moderateButton("Eu")).toBeNull();

    fireEvent.click(moderateButton("Caio")!);
    const menu = within(screen.getByTestId("moderation-menu"));
    expect(menu.getAllByRole("button").map((button) => button.textContent)).toEqual([
      texts.people.mute,
      texts.people.kick,
      texts.people.ban,
    ]);
    // Promoting is of the owner.
    expect(screen.queryByTestId("set-moderator")).toBeNull();

    fireEvent.click(menu.getByRole("button", { name: texts.people.mute }));
    expect(actions.moderate).toHaveBeenCalledWith("mute", "p3");

    fireEvent.click(moderateButton("Caio")!);
    fireEvent.click(screen.getByRole("button", { name: texts.people.ban }));
    fireEvent.click(screen.getByRole("button", { name: texts.people.confirmBanAction }));
    expect(actions.moderate).toHaveBeenLastCalledWith("ban", "p3");
    expect(actions.setModerator).not.toHaveBeenCalled();
  });

  it("gives a moderator nothing else of the owner: no room theme", () => {
    renderApp({
      state: withModerator({ isModerator: true, fixed: true, ownerHandle: "ana" }, { isModerator: true }),
    });
    expect(screen.queryByRole("button", { name: texts.room.roomTheme.open })).toBeNull();
  });
});

describe("notices of the room", () => {
  it("says the limit of watched videos with the number of the room", () => {
    renderApp({ state: makeConnectedState({ notice: { kind: "watchLimit" }, maxWatchedVideos: 3 }) });

    const text = texts.notices.watchLimit(3);
    expect(text).toContain("3 vídeos");
    expect(screen.getByText(text).closest('[role="status"]')).toBeTruthy();
    expect(text).not.toBe(noticeText({ kind: "videoRoomLimit" }));
  });

  it("says the person is going too fast inside the room, and keeps the other text in the lobby", () => {
    const room = renderApp({ state: makeConnectedState({ notice: { kind: "rateLimited" } }) });
    expect(texts.notices.roomRateLimited).toContain("rápido demais");
    expect(screen.getByText(texts.notices.roomRateLimited)).toBeTruthy();
    expect(screen.queryByText(texts.notices.rateLimited)).toBeNull();
    room.unmount();

    renderApp({ state: makeState({ notice: { kind: "rateLimited" } }) });
    expect(screen.getByText(texts.notices.rateLimited)).toBeTruthy();
    expect(screen.queryByText(texts.notices.roomRateLimited)).toBeNull();
  });

  it("names the ceiling of the protected room when it is full of videos", () => {
    renderApp({
      state: protectedState({ notice: { kind: "videoRoomLimit" }, maxVideos: PROTECTED_ROOM_MAX_VIDEOS }),
    });
    const text = texts.notices.videoRoomLimit(PROTECTED_ROOM_MAX_VIDEOS);
    expect(text).toContain(`${PROTECTED_ROOM_MAX_VIDEOS} vídeos`);
    expect(text).toContain("sala protegida");
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe("occupancy by the room", () => {
  it.each([
    ["direct", false, ROOM_MAX_PEOPLE, 12],
    ["protected", true, PROTECTED_ROOM_MAX_PEOPLE, 6],
  ] as const)("shows the capacity of a %s room", (_name, isProtected, capacity, expected) => {
    expect(capacity).toBe(expected);
    renderApp({
      state: makeConnectedState({
        protected: isProtected,
        occupancy: { participants: 3, capacity },
      }),
    });

    const occupancy = screen.getByTestId("occupancy");
    expect(occupancy.textContent).toBe(`3/${expected}`);
    expect(occupancy.getAttribute("aria-label")).toBe(texts.room.occupancyLabel(3, expected));
  });

  it.each([
    ["direct", false, ROOM_MAX_PEOPLE, "direta"],
    ["protected", true, PROTECTED_ROOM_MAX_PEOPLE, "protegida"],
  ] as const)("says how many people a full %s room holds", (_name, isProtected, capacity, kind) => {
    renderApp({
      state: makeState({
        phase: "full",
        protected: isProtected,
        occupancy: { participants: capacity, capacity },
      }),
    });

    const message = screen.getByText(texts.roomEnd.full.message(capacity, isProtected));
    expect(message.textContent).toContain(`${capacity} pessoas`);
    expect(message.textContent).toContain(`sala ${kind}`);
    expect(screen.getByRole("button", { name: texts.roomEnd.full.action })).toBeTruthy();
  });
});
