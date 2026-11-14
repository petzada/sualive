import { CHAT_MAX_LENGTH, NICKNAME_MAX_LENGTH, REACTIONS, ROOM_MAX_PEOPLE } from "@sualive/config";
import type { DevicePreview } from "@sualive/media";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NICKNAME_STORAGE_KEY } from "../components/room/Lobby";
import { noticeText } from "../components/room/NoticeBanner";
import type { RoomNotice, RoomPhase } from "../lib/room";
import { THEME_STORAGE_KEY } from "../lib/theme";
import {
  installTurnstileStub,
  makeActions,
  makeConnectedState,
  makeParticipant,
  makeState,
  makeVideo,
  renderApp,
  TEST_TOKEN,
} from "../test/room";
import { texts } from "../texts";

/** jsdom has no MediaStream; the elements only need an object to hold. */
const fakeStream = () => ({}) as MediaStream;

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const toolbar = () => screen.getByRole("toolbar", { name: texts.controls.label });
const nicknameInput = () => screen.getByLabelText<HTMLInputElement>(texts.lobby.nicknameLabel);
const chatInput = () => screen.getByLabelText<HTMLTextAreaElement>(texts.chat.inputLabel);
const leaveButton = () => screen.getByRole("button", { name: texts.controls.leave });
const leaveConfirmation = () => screen.queryByTestId("leave-confirm");
/** Leaving takes two steps: the button of the header, then the confirmation it opens. */
function leaveRoom() {
  fireEvent.click(leaveButton());
  fireEvent.click(
    within(leaveConfirmation()!).getByRole("button", { name: texts.controls.leaveConfirm.confirm }),
  );
}

/**
 * jsdom cannot navigate: `location.reload()` only reports "not implemented" on its virtual console
 * (vitest leaves the jsdom instance on the global object). Counts those reports.
 */
function watchReloads() {
  type Listen = (event: "jsdomError", listener: (error: Error) => void) => unknown;
  const { virtualConsole } = (
    globalThis as unknown as { jsdom: { virtualConsole: { on: Listen; off: Listen } } }
  ).jsdom;
  const seen = vi.fn<(error: Error) => void>();
  virtualConsole.on("jsdomError", seen);
  return { seen, stop: () => void virtualConsole.off("jsdomError", seen) };
}

describe("room phases", () => {
  it("shows a discreet loading state", () => {
    renderApp({ state: makeState({ phase: "loading" }) });
    expect(screen.getByRole("status").textContent).toContain(texts.room.loading);
  });

  it("shows the lobby", () => {
    renderApp({ state: makeState({ phase: "lobby" }) });
    expect(heading()).toBe(texts.lobby.title);
    expect(screen.getByRole("button", { name: texts.lobby.join })).toBeTruthy();
  });

  it("keeps the lobby in place while joining, with the form locked", () => {
    renderApp({ state: makeState({ phase: "joining" }) });
    expect(heading()).toBe(texts.lobby.title);
    expect(screen.getByRole("button", { name: texts.lobby.joining }).hasAttribute("disabled")).toBe(true);
    expect(nicknameInput().disabled).toBe(true);
  });

  it("shows the room when connected", () => {
    renderApp({ state: makeConnectedState() });
    expect(toolbar()).toBeTruthy();
    expect(screen.queryByText(texts.room.reconnecting)).toBeNull();
  });

  it("keeps the room layout while reconnecting and says so", () => {
    renderApp({ state: makeConnectedState({ phase: "reconnecting" }) });
    expect(toolbar()).toBeTruthy();
    expect(screen.getByText(texts.room.reconnecting)).toBeTruthy();
    expect(chatInput().disabled).toBe(true);
    // Leaving stays possible.
    expect(screen.getByRole("button", { name: texts.controls.leave }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["ended", "full", "banned", "kicked", "replaced", "error"] as const)(
    "shows the %s screen",
    (phase) => {
      renderApp({ state: makeState({ phase }) });
      expect(heading()).toBe(texts.roomEnd[phase].title);
      // How many people fit is said by the room itself (see `RoomE4.test.tsx` for the protected one).
      const message =
        phase === "full" ? texts.roomEnd.full.message(ROOM_MAX_PEOPLE, false) : texts.roomEnd[phase].message;
      expect(screen.getByText(message)).toBeTruthy();
    },
  );

  it("offers to create another room when the room ended", () => {
    renderApp({ state: makeState({ phase: "ended" }) });
    expect(screen.getByRole("link", { name: texts.roomEnd.ended.action }).getAttribute("href")).toBe("/");
  });

  it("says how many people the room holds when it is full and offers to try again", () => {
    renderApp({ state: makeState({ phase: "full" }) });
    expect(screen.getByText(texts.roomEnd.full.message(ROOM_MAX_PEOPLE, false)).textContent).toContain(
      String(ROOM_MAX_PEOPLE),
    );
    expect(screen.getByRole("button", { name: texts.roomEnd.full.action })).toBeTruthy();
  });

  it("lets a removed person try to enter again, but not a banned one", () => {
    const kicked = renderApp({ state: makeState({ phase: "kicked" }) });
    expect(screen.getByRole("button", { name: texts.roomEnd.kicked.action })).toBeTruthy();
    kicked.unmount();

    renderApp({ state: makeState({ phase: "banned" }) });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: texts.common.backHome })).toBeTruthy();
  });

  it("offers to use this tab when the room was opened in another one, without reloading", () => {
    const reloads = watchReloads();
    const { actions } = renderApp({ state: makeState({ phase: "replaced" }) });

    expect(heading()).toBe(texts.roomEnd.replaced.title);
    expect(heading()).toBe("Você abriu esta sala em outra aba");
    expect(screen.getByText(texts.roomEnd.replaced.message)).toBeTruthy();
    // Like the other final screens: no header, no logo, nothing announced as an error.
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: texts.common.backHome }).getAttribute("href")).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Usar esta aba" }));

    expect(actions.useThisTab).toHaveBeenCalledTimes(1);
    expect(reloads.seen).not.toHaveBeenCalled();
    reloads.stop();
  });

  it("still reloads the page to try again on the other final screens", () => {
    const reloads = watchReloads();
    const { actions } = renderApp({ state: makeState({ phase: "full" }) });

    fireEvent.click(screen.getByRole("button", { name: texts.roomEnd.full.action }));

    expect(actions.useThisTab).not.toHaveBeenCalled();
    expect(reloads.seen).toHaveBeenCalledTimes(1);
    reloads.stop();
  });

  it("covers every phase of the contract", () => {
    const phases: Record<RoomPhase, true> = {
      loading: true,
      lobby: true,
      joining: true,
      connected: true,
      reconnecting: true,
      ended: true,
      full: true,
      banned: true,
      kicked: true,
      replaced: true,
      error: true,
    };
    for (const phase of Object.keys(phases) as RoomPhase[]) {
      const view = renderApp({ state: makeConnectedState({ phase }) });
      expect(screen.queryByText(texts.error.crash.title)).toBeNull();
      view.unmount();
    }
  });
});

describe("lobby", () => {
  it("says that the microphone starts muted, without the occupancy", () => {
    renderApp({ state: makeState({ occupancy: { participants: 3, capacity: ROOM_MAX_PEOPLE } }) });

    expect(screen.getByText(texts.lobby.mutedHint)).toBeTruthy();
    expect(nicknameInput().maxLength).toBe(NICKNAME_MAX_LENGTH);
    expect(screen.getByRole("main").textContent).not.toContain(String(ROOM_MAX_PEOPLE));
  });

  it("ends the form with the join button and the login line right under it, with no Turnstile in the layout", () => {
    renderApp();

    const isBefore = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    const button = screen.getByRole("button", { name: texts.lobby.join });
    const login = screen.getByRole("link", { name: texts.lobby.loginLink });
    const form = button.closest("form")!;

    expect(isBefore(nicknameInput(), button)).toBe(true);
    // Same block as the button and no gap in it: as close as the account line of the home page.
    expect(button.nextElementSibling).toBe(login);
    expect(button.parentElement?.className).not.toContain("gap-");
    expect(form.lastElementChild?.contains(login)).toBe(true);
    // The field and the button share a block, apart from the title by the wider step of the form.
    expect(button.parentElement?.parentElement?.contains(nicknameInput())).toBe(true);
    expect(button.parentElement?.parentElement?.className.split(" ")).toContain("gap-gap");
    expect(form.className.split(" ")).toContain("gap-10");
    // The Turnstile floats over the page: nothing of it inside the form or the screen.
    expect(form.contains(screen.getByTestId("turnstile"))).toBe(false);
    expect(screen.getByRole("main").contains(screen.getByTestId("turnstile"))).toBe(false);
    expect(form.textContent).not.toContain(texts.lobby.mutedHint);
  });

  it("offers the device test alone and centered in the gray card, and the muted hint under the card", () => {
    renderApp();

    const section = screen.getByRole("region", { name: texts.lobby.previewTitle });
    const card = section.firstElementChild!;
    const test = within(card as HTMLElement).getByRole("button", { name: texts.lobby.previewStart });
    const hint = screen.getByText(texts.lobby.mutedHint);

    expect(card.className.split(" ")).toContain("bg-mist");
    for (const name of ["items-center", "justify-center"]) expect(card.className.split(" ")).toContain(name);
    // In the card: only the button, centered. The word "Opcional" is gone.
    expect(test.parentElement?.children).toHaveLength(1);
    expect(test.parentElement?.className.split(" ")).toContain("items-center");
    expect(card.textContent).toBe(texts.lobby.previewStart);
    expect(document.body.textContent).not.toContain("Opcional");
    expect("previewOptional" in texts.lobby).toBe(false);
    expect("previewIntro" in texts.lobby).toBe(false);
    // The muted hint left the card: under it, outside the gray, centered, in one line where it fits.
    expect(card.contains(hint)).toBe(false);
    expect(section.lastElementChild?.lastElementChild).toBe(hint);
    for (const name of ["mx-auto", "text-center", "sm:whitespace-nowrap"]) {
      expect(hint.className.split(" ")).toContain(name);
    }
  });

  it("drops the button once the device test ran, and keeps the muted hint under the card", async () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: texts.lobby.previewStart }));

    await screen.findByText(texts.lobby.previewUnavailable);
    const section = screen.getByRole("region", { name: texts.lobby.previewTitle });
    expect(screen.queryByRole("button", { name: texts.lobby.previewStart })).toBeNull();
    expect(section.lastElementChild?.textContent).toBe(texts.lobby.mutedHint);
    expect(section.firstElementChild?.contains(section.lastElementChild)).toBe(false);
  });

  it("centers the lobby in the window, with the two columns aligned by their vertical centers", () => {
    renderApp();

    const main = screen.getByRole("main");
    // No gap in the column: the (empty) notice region takes no room, so nothing pushes the content down.
    expect(main.className).not.toContain("gap-");
    expect(main.firstElementChild?.className).toBe("");
    for (const name of ["mx-auto", "w-full", "min-h-dvh", "flex-col", "justify-center"]) {
      expect(main.className.split(" ")).toContain(name);
    }
    const section = screen.getByRole("region", { name: texts.lobby.previewTitle });
    const columns = section.parentElement!;
    expect(columns.children).toHaveLength(2);
    expect(columns.lastElementChild?.tagName).toBe("FORM");
    for (const name of ["grid", "items-center", "md:grid-cols-2"]) {
      expect(columns.className.split(" ")).toContain(name);
    }
    expect(columns.lastElementChild?.className.split(" ")).toContain("items-center");
    // What goes under the card hangs out of the flow beside the form: the card alone is centered against it.
    expect(section.className.split(" ")).toContain("relative");
    for (const name of ["md:absolute", "md:top-full"]) {
      expect(section.lastElementChild?.className.split(" ")).toContain(name);
    }
  });

  it("rejects a nickname that is too short and does not join", async () => {
    const { api } = installTurnstileStub();
    const actions = makeActions();
    renderApp({ actions });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.change(nicknameInput(), { target: { value: " a " } });
    fireEvent.click(screen.getByRole("button", { name: texts.lobby.join }));

    expect(screen.getByRole("alert").textContent).toBe(texts.lobby.nicknameInvalid);
    expect(nicknameInput().getAttribute("aria-invalid")).toBe("true");
    expect(actions.join).not.toHaveBeenCalled();
  });

  it("centers the title and keeps the field and the join button narrower than the column", () => {
    renderApp();

    const title = screen.getByRole("heading", { level: 1 });
    const input = nicknameInput();
    const label = screen.getByText(texts.lobby.nicknameLabel);
    const button = screen.getByRole("button", { name: texts.lobby.join });

    expect(title.className.split(" ")).toContain("text-center");
    expect(title.closest("form")?.className.split(" ")).toContain("items-center");
    // The label shares the narrow block of the field, so it follows the field's left edge.
    expect(label.parentElement).toBe(input.parentElement);
    expect(input.parentElement?.className.split(" ")).toContain("max-w-xs");
    expect(label.className).not.toContain("text-center");
    // Same pill as "create room": as wide as its text, never the whole column.
    expect(button.className.split(" ")).not.toContain("w-full");
    expect(button.className).toContain("min-h-12");
    expect(button.className).toContain("px-7");
  });

  it("shows the nickname rule only while the typed nickname breaks it", () => {
    renderApp();
    const rule = texts.lobby.nicknameInvalid;

    // Nothing typed yet: no help text and nothing described.
    expect(screen.queryByText(rule)).toBeNull();
    expect(nicknameInput().hasAttribute("aria-invalid")).toBe(false);
    expect(nicknameInput().hasAttribute("aria-describedby")).toBe(false);

    fireEvent.change(nicknameInput(), { target: { value: "a" } });
    const message = screen.getByRole("alert");
    expect(message.textContent).toBe(rule);
    expect(nicknameInput().getAttribute("aria-invalid")).toBe("true");
    expect(nicknameInput().getAttribute("aria-describedby")).toBe(message.id);

    fireEvent.change(nicknameInput(), { target: { value: "Ana" } });
    expect(screen.queryByText(rule)).toBeNull();
    expect(nicknameInput().hasAttribute("aria-invalid")).toBe(false);
    expect(nicknameInput().hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows the nickname rule when trying to enter with nothing typed", () => {
    const actions = makeActions();
    renderApp({ actions });

    fireEvent.click(screen.getByRole("button", { name: texts.lobby.join }));

    expect(screen.getByRole("alert").textContent).toBe(texts.lobby.nicknameInvalid);
    expect(actions.join).not.toHaveBeenCalled();
  });

  it("joins with the trimmed nickname and the Turnstile token, and remembers the nickname", async () => {
    const { api } = installTurnstileStub();
    const actions = makeActions();
    renderApp({ actions });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.change(nicknameInput(), { target: { value: "  Marina  " } });
    fireEvent.click(screen.getByRole("button", { name: texts.lobby.join }));

    await waitFor(() =>
      expect(actions.join).toHaveBeenCalledWith({ nickname: "Marina", turnstileToken: TEST_TOKEN }),
    );
    expect(localStorage.getItem(NICKNAME_STORAGE_KEY)).toBe("Marina");
    // The token is single-use: a new one is requested after the attempt.
    await waitFor(() => expect(api.reset).toHaveBeenCalledWith("widget-1"));
  });

  it("starts with the last nickname used in this browser", () => {
    localStorage.setItem(NICKNAME_STORAGE_KEY, "Caio");
    renderApp();
    expect(nicknameInput().value).toBe("Caio");
  });

  it("starts the device preview on request", async () => {
    const actions = makeActions();
    renderApp({ actions });

    fireEvent.click(screen.getByRole("button", { name: texts.lobby.previewStart }));

    expect(actions.startPreview).toHaveBeenCalledTimes(1);
    // Still nothing to show (permission denied): the lobby stays usable.
    expect(await screen.findByText(texts.lobby.previewUnavailable)).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.lobby.join })).toBeTruthy();
  });

  it("shows the camera and the microphone level of the preview", () => {
    const preview: DevicePreview = {
      cameraStream: fakeStream(),
      hasMicrophone: true,
      onMicrophoneLevel: () => () => {},
      stop() {},
    };
    renderApp({ state: makeState({ preview }) });

    expect(screen.getByLabelText(texts.lobby.previewCameraLabel)).toBeTruthy();
    const meter = screen.getByRole("meter", { name: texts.lobby.micLevelLabel });
    expect(meter.getAttribute("aria-valuenow")).toBe("0");
  });

  it("works with camera and microphone denied", () => {
    const preview: DevicePreview = {
      cameraStream: null,
      hasMicrophone: false,
      onMicrophoneLevel: () => () => {},
      stop() {},
    };
    renderApp({ state: makeState({ preview }) });

    expect(screen.getByText(texts.lobby.previewNoCamera)).toBeTruthy();
    expect(screen.getByText(texts.lobby.previewNoMicrophone)).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.lobby.join }).hasAttribute("disabled")).toBe(false);
  });

  it("shows a notice from a refused entry", () => {
    renderApp({ state: makeState({ notice: { kind: "turnstileFailed" } }) });
    expect(screen.getByText(texts.notices.turnstileFailed)).toBeTruthy();
  });
});

describe("stage", () => {
  const twoVideos = () =>
    makeConnectedState({
      videos: [
        makeVideo({ id: "v1", ownerId: "p1", kind: "screen", stream: fakeStream() }),
        makeVideo({ id: "v2", ownerId: "me", kind: "camera", stream: fakeStream(), isLocal: true }),
      ],
      featuredVideoId: "v1",
      localVideoIds: ["v2"],
    });

  it("features one video and switches when a thumbnail is clicked", () => {
    const actions = makeActions();
    renderApp({ state: twoVideos(), actions });

    const tiles = screen.getAllByTestId("video-tile");
    expect(tiles).toHaveLength(2);
    expect(tiles.filter((tile) => tile.dataset.featured === "true")).toHaveLength(1);
    expect(screen.getByLabelText(texts.stage.videoLabel("Ana", "screen", false))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: texts.stage.feature("Eu", "camera") }));
    expect(actions.setFeaturedVideo).toHaveBeenCalledWith("v2");
  });

  it("mutes and mirrors only the local camera", () => {
    renderApp({ state: twoVideos() });

    const remote = screen.getByLabelText<HTMLVideoElement>(texts.stage.videoLabel("Ana", "screen", false));
    const local = screen.getByLabelText<HTMLVideoElement>(texts.stage.videoLabel("Eu", "camera", true));
    expect(remote.muted).toBe(false);
    expect(remote.className).not.toContain("-scale-x-100");
    expect(local.muted).toBe(true);
    expect(local.className).toContain("-scale-x-100");
  });

  it("does not mirror a local shared screen", () => {
    renderApp({
      state: makeConnectedState({
        videos: [makeVideo({ id: "v1", ownerId: "me", kind: "screen", stream: fakeStream(), isLocal: true })],
        featuredVideoId: "v1",
        localVideoIds: ["v1"],
      }),
    });
    const local = screen.getByLabelText<HTMLVideoElement>(texts.stage.videoLabel("Eu", "screen", true));
    expect(local.muted).toBe(true);
    expect(local.className).not.toContain("-scale-x-100");
  });

  it("shows the people when nobody shares video", () => {
    renderApp({ state: makeConnectedState() });
    const stage = screen.getByRole("region", { name: texts.stage.label });
    expect(within(stage).getByText(texts.stage.empty)).toBeTruthy();
    expect(within(stage).getByText("Ana")).toBeTruthy();
  });

  it("plays each remote voice through an audio element", () => {
    renderApp({
      state: makeConnectedState({
        participants: [
          makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
          makeParticipant({ id: "p1", nickname: "Ana", audioStream: fakeStream() }),
          makeParticipant({ id: "p2", nickname: "Bia", audioStream: fakeStream() }),
          makeParticipant({ id: "p3", nickname: "Caio" }),
        ],
      }),
    });
    const outputs = screen.getByTestId("voice-outputs").querySelectorAll("audio");
    expect(outputs).toHaveLength(2);
    expect(outputs[0]?.autoplay).toBe(true);
  });

  it("shows passing reactions over the stage", () => {
    renderApp({
      state: makeConnectedState({ reactions: [{ id: "r1", from: "p1", reaction: REACTIONS[0] }] }),
    });
    const reaction = screen.getByTestId("reaction");
    expect(reaction.textContent).toContain(REACTIONS[0]);
    expect(reaction.textContent).toContain("Ana");
    expect(reaction.className).toContain("motion-reduce:");
  });
});

describe("people", () => {
  const people = () => screen.getByRole("list", { name: texts.people.label });

  it("lists everyone with owner badge, microphone, raised hand, speaking and connection", () => {
    renderApp({
      state: makeConnectedState({
        participants: [
          makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
          makeParticipant({
            id: "p1",
            nickname: "Ana",
            isOwner: true,
            micMuted: false,
            speaking: true,
            handRaised: true,
            relayed: true,
          }),
          makeParticipant({ id: "p2", nickname: "Bia", connection: "reconnecting" }),
        ],
      }),
    });

    const [self, ana, bia] = within(people()).getAllByRole("listitem");
    expect(self?.textContent).toContain(`(${texts.common.you})`);
    expect(within(self!).getByLabelText(texts.people.micMuted)).toBeTruthy();
    expect(ana?.textContent).toContain(texts.people.owner);
    expect(within(ana!).getByLabelText(texts.people.micOn)).toBeTruthy();
    expect(within(ana!).getByLabelText(texts.people.speaking)).toBeTruthy();
    expect(within(ana!).getByLabelText(texts.people.handRaised)).toBeTruthy();
    expect(ana?.textContent).toContain(texts.people.relayed);
    expect(bia?.textContent).toContain(texts.people.connection.reconnecting);
    expect(within(bia!).queryByLabelText(texts.people.speaking)).toBeNull();
  });

  it("hides the owner controls from guests", () => {
    renderApp({ state: makeConnectedState({ isOwner: false }) });
    expect(screen.queryByRole("button", { name: texts.people.moderate("Ana") })).toBeNull();
  });

  it("gives the owner controls over the others, never over themself", () => {
    renderApp({ state: makeConnectedState({ isOwner: true }) });
    expect(screen.getByRole("button", { name: texts.people.moderate("Ana") })).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.people.moderate("Bia") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: texts.people.moderate("Eu") })).toBeNull();
  });

  it("mutes at once", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        isOwner: true,
        participants: [
          makeParticipant({ id: "me", nickname: "Eu", isSelf: true, isOwner: true }),
          makeParticipant({ id: "p1", nickname: "Ana", micMuted: false }),
        ],
      }),
      actions,
    });

    fireEvent.click(screen.getByRole("button", { name: texts.people.moderate("Ana") }));
    fireEvent.click(screen.getByRole("button", { name: texts.people.mute }));
    expect(actions.moderate).toHaveBeenCalledWith("mute", "p1");
  });

  it.each([
    ["kick", texts.people.kick, texts.people.confirmKick("Ana")],
    ["ban", texts.people.ban, texts.people.confirmBan("Ana")],
  ] as const)("asks for confirmation before %s", (action, label, question) => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState({ isOwner: true }), actions });

    fireEvent.click(screen.getByRole("button", { name: texts.people.moderate("Ana") }));
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText(question)).toBeTruthy();
    expect(actions.moderate).not.toHaveBeenCalled();

    // Cancelling goes back without doing anything.
    fireEvent.click(screen.getByRole("button", { name: texts.common.cancel }));
    expect(screen.queryByText(question)).toBeNull();
    expect(actions.moderate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: label }));
    const confirmation = screen.getByText(question).closest("[role=group]") as HTMLElement;
    fireEvent.click(within(confirmation).getByRole("button", { name: label }));
    expect(actions.moderate).toHaveBeenCalledWith(action, "p1");
  });
});

describe("header", () => {
  it("shows the product at the left and the room right beside it, as a gray breadcrumb, with no occupancy in the header", () => {
    renderApp({ state: makeConnectedState() });

    const header = screen.getByRole("banner");
    const classes = (element: Element) => element.className.split(" ");
    const crumb = within(header).getByTestId("room-breadcrumb");
    const name = within(crumb).getByRole("heading", { level: 1 });
    const code = within(crumb).getByTestId("room-code");
    const theme = within(header).getByRole("button", { name: texts.room.themeToDark });

    expect(name.textContent).toBe(texts.home.title);
    expect(code.textContent).toBe(`${texts.room.codeLabel} abcdefghjk`);
    // Reading order: the product, a discreet separator, the room, then the buttons.
    expect(header.firstElementChild).toBe(crumb);
    const room = code.parentElement!;
    const separator = code.previousElementSibling!;
    expect(name.nextElementSibling).toBe(room);
    expect(texts.room.breadcrumbSeparator).toBe("/");
    expect(separator.textContent).toBe("/");
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    expect(crumb.textContent).toBe(`${texts.home.title}/${texts.room.codeLabel} abcdefghjk`);
    expect(code.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The room in gray, so it does not compete with the product; the product is not centered anymore.
    expect(classes(room)).toContain("text-muted");
    expect(classes(name)).not.toContain("text-muted");
    expect(name.className).not.toMatch(/text-center|col-start-2/);
    expect(header.className).not.toContain("md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
    expect(within(header).queryByTestId("occupancy")).toBeNull();
    expect(header.textContent).not.toContain(texts.room.occupancy(3, ROOM_MAX_PEOPLE));
  });

  it("starts the header at the left edge of the stage, and lets the room wrap under the product where it does not fit", () => {
    renderApp({ state: makeConnectedState() });

    const header = screen.getByRole("banner");
    const classes = (element: Element) => element.className.split(" ");
    const crumb = within(header).getByTestId("room-breadcrumb");
    const name = within(crumb).getByRole("heading", { level: 1 });
    const code = within(crumb).getByTestId("room-code");
    const buttons = within(header).getByTestId("room-header-buttons");

    // Same left padding as the row of the stage below, on a phone and on wide screens.
    const main = screen.getByRole("main");
    expect(main.contains(screen.getByRole("region", { name: texts.stage.label }))).toBe(true);
    for (const [ofHeader, ofMain] of [
      ["pl-2", "px-2"],
      ["lg:pl-4", "lg:px-4"],
    ] as const) {
      expect(classes(header)).toContain(ofHeader);
      expect(classes(main)).toContain(ofMain);
    }
    // Two columns: the breadcrumb takes what is left, the buttons stay at the right in the same row.
    expect(classes(header)).toContain("grid-cols-[minmax(0,1fr)_auto]");
    for (const place of ["col-start-1", "row-start-1", "min-w-0"]) expect(classes(crumb)).toContain(place);
    for (const place of ["col-start-2", "row-start-1", "justify-end"]) {
      expect(classes(buttons)).toContain(place);
    }
    expect(buttons.lastElementChild).toBe(leaveButton());
    // Beside the product while it fits; otherwise it wraps to the line below (a phone), where the
    // separator falls outside the clipped box, and a long name is cut with an ellipsis.
    const row = name.parentElement!;
    for (const place of ["flex", "flex-wrap", "items-baseline", "-ml-5"]) {
      expect(classes(row)).toContain(place);
    }
    expect(classes(crumb)).toContain("overflow-hidden");
    expect(classes(name)).toContain("pl-5");
    for (const place of ["relative", "pl-5", "min-w-0", "max-w-full"]) {
      expect(classes(code.parentElement!)).toContain(place);
    }
    for (const place of ["absolute", "left-0", "w-5"]) {
      expect(classes(code.previousElementSibling!)).toContain(place);
    }
    expect(classes(code)).toContain("truncate");
    // The room left its old place, above the side panel.
    expect(within(header).queryByTestId("room-header-side")).toBeNull();
    expect(header.innerHTML).not.toContain("lg:w-88");
    expect(classes(screen.getByRole("complementary"))).toContain("lg:w-88");
  });

  it("shows the occupancy as a pill over the stage: top right on a phone, top left on wide screens", () => {
    for (const videos of [[], [makeVideo()]]) {
      const view = renderApp({
        state: makeConnectedState({
          videos,
          reactions: [{ id: "r1", from: "p1", reaction: REACTIONS[0] }],
        }),
      });

      const stage = screen.getByRole("region", { name: texts.stage.label });
      const occupancy = within(stage).getByLabelText(texts.room.occupancyLabel(3, ROOM_MAX_PEOPLE));
      const classes = occupancy.className.split(" ");

      expect(occupancy.textContent).toBe(texts.room.occupancy(3, ROOM_MAX_PEOPLE));
      expect(screen.getAllByTestId("occupancy")).toEqual([occupancy]);
      // Its own filled pair, so it reads over any video.
      for (const token of ["bg-accent", "text-on-accent"]) expect(classes).toContain(token);
      // Pinned to a corner of the stage, whatever it shows...
      expect(stage.className.split(" ")).toContain("relative");
      for (const place of ["absolute", "top-3", "right-3", "md:right-auto", "md:left-3"]) {
        expect(classes).toContain(place);
      }
      // ...and painted last, above the reactions (and so above the video and the empty state).
      const reactions = within(stage).getByTestId("reaction").parentElement!;
      expect(stage.lastElementChild).toBe(occupancy);
      expect(reactions.className.split(" ")).toContain("z-10");
      expect(classes).toContain("z-20");
      view.unmount();
    }
  });

  it("has the leave button at the end of the header, neutral, and not in the actions bar", () => {
    renderApp({ state: makeConnectedState() });

    const header = screen.getByRole("banner");
    const leave = within(header).getByRole("button", { name: texts.controls.leave });
    const name = within(header).getByRole("heading", { level: 1 });

    expect(name.compareDocumentPosition(leave) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).getAllByRole("button").at(-1)).toBe(leave);
    expect(leave.className).toContain("bg-canvas");
    expect(leave.className).toContain("text-ink");
    expect(leave.className).toContain("shadow-outline-soft");
    expect(leave.className).not.toContain("accent");
    // Only the icon, in every width: as big as the other icon buttons of the header.
    const theme = within(header).getByRole("button", { name: texts.room.themeToDark });
    expect(leave.textContent).toBe("");
    expect(leave.querySelector("svg")).toBeTruthy();
    expect(leave.className.split(" ")).toContain("size-11");
    expect(leave.className).not.toMatch(/md:w-auto|md:px-/);
    for (const name of ["size-11", "rounded-button"]) {
      expect(theme.className.split(" ")).toContain(name);
      expect(leave.className.split(" ")).toContain(name);
    }

    expect(within(toolbar()).queryByRole("button", { name: texts.controls.leave })).toBeNull();
    expect(
      within(toolbar())
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      texts.controls.micOn,
      texts.controls.cameraOn,
      texts.controls.screenOn,
      texts.controls.handRaise,
      texts.controls.reactions,
      texts.controls.copyLink,
    ]);
  });
});

describe("leaving", () => {
  it("asks before leaving, and stays in the room when the person cancels", async () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });
    expect(leaveConfirmation()).toBeNull();

    act(() => leaveButton().focus());
    fireEvent.click(leaveButton());

    const dialog = leaveConfirmation()!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(texts.controls.leaveConfirm.question).toBe("Quer realmente sair da sala?");
    expect(within(dialog).getByRole("heading", { name: texts.controls.leaveConfirm.question })).toBeTruthy();
    expect(dialog.getAttribute("aria-labelledby")).toBe(within(dialog).getByRole("heading").id);
    // Two answers: confirm and cancel. Nothing happened yet.
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([texts.controls.leaveConfirm.confirm, texts.common.cancel]);
    expect(actions.leave).not.toHaveBeenCalled();
    // The focus goes to the safe answer.
    const cancel = within(dialog).getByRole("button", { name: texts.common.cancel });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.click(cancel);

    await waitFor(() => expect(leaveConfirmation()).toBeNull());
    expect(actions.leave).not.toHaveBeenCalled();
    expect(toolbar()).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(leaveButton()));
  });

  it("closes the question with Escape without leaving", async () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });
    act(() => leaveButton().focus());
    fireEvent.click(leaveButton());
    const dialog = leaveConfirmation()!;
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyUp(document.activeElement!, { key: "Escape" });

    await waitFor(() => expect(leaveConfirmation()).toBeNull());
    expect(actions.leave).not.toHaveBeenCalled();
    expect(toolbar()).toBeTruthy();
  });

  it("leaves only after the confirmation", async () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    fireEvent.click(leaveButton());
    expect(actions.leave).not.toHaveBeenCalled();
    fireEvent.click(
      within(leaveConfirmation()!).getByRole("button", { name: texts.controls.leaveConfirm.confirm }),
    );

    expect(actions.leave).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(leaveConfirmation()).toBeNull();
  });

  it("asks while reconnecting too", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState({ phase: "reconnecting" }), actions });

    leaveRoom();

    expect(actions.leave).toHaveBeenCalledTimes(1);
  });
});

describe("hints", () => {
  /** Keyboard focus, as React Aria sees it: a Tab press and then the focus on the control. */
  const focusByKeyboard = (element: HTMLElement) => {
    fireEvent.keyDown(document.body, { key: "Tab" });
    fireEvent.keyUp(document.body, { key: "Tab" });
    act(() => element.focus());
  };

  it("has no hint on screen until a control is hovered or focused", () => {
    renderApp({ state: makeConnectedState() });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it.each([
    ["microphone", { micMuted: true }, texts.controls.micOn],
    ["open microphone", { micMuted: false }, texts.controls.micOff],
    ["camera", {}, texts.controls.cameraOn],
    ["screen", {}, texts.controls.screenOn],
    ["hand", { handRaised: true }, texts.controls.handLower],
    ["reactions", {}, texts.controls.reactions],
    ["copy link", {}, texts.controls.copyLink],
    ["leave", {}, texts.controls.leave],
    ["theme", {}, texts.room.themeToDark],
  ] as const)("says what the %s button does on keyboard focus, and hides on blur", (_name, state, label) => {
    renderApp({ state: makeConnectedState(state) });
    const button = screen.getByRole("button", { name: label });

    focusByKeyboard(button);
    expect(screen.getByRole("tooltip").textContent).toBe(label);

    act(() => button.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("theme", () => {
  const themeOnPage = () => document.documentElement.getAttribute("data-theme");
  const toDark = () => screen.getByRole("button", { name: texts.room.themeToDark });
  const toLight = () => screen.getByRole("button", { name: texts.room.themeToLight });

  it("starts light, whatever the system prefers", () => {
    renderApp({ state: makeConnectedState() });

    expect(themeOnPage()).toBeNull();
    expect(toDark()).toBeTruthy();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("switches to dark and back, on the page root, and remembers the choice", () => {
    renderApp({ state: makeConnectedState() });

    fireEvent.click(toDark());
    expect(themeOnPage()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(toLight());
    expect(themeOnPage()).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(toDark()).toBeTruthy();
  });

  it("applies the remembered theme when entering a room, also while reconnecting", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderApp({ state: makeConnectedState({ phase: "reconnecting" }) });

    expect(themeOnPage()).toBe("dark");
    expect(toLight()).toBeTruthy();
  });

  it("puts the theme button in the header, right before the leave button, neutral", () => {
    renderApp({ state: makeConnectedState() });

    const buttons = within(screen.getByRole("banner")).getAllByRole("button");
    expect(buttons.at(-2)).toBe(toDark());
    expect(buttons.at(-1)).toBe(screen.getByRole("button", { name: texts.controls.leave }));
    expect(toDark().className).toContain("bg-canvas");
    expect(toDark().className).not.toContain("accent");
  });

  it.each(["loading", "lobby", "joining", "ended", "full", "banned", "kicked", "error"] as const)(
    "stays light and has no theme button on the %s screen, even with dark remembered",
    (phase) => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      renderApp({ state: makeState({ phase }) });

      expect(themeOnPage()).toBeNull();
      expect(screen.queryByRole("button", { name: texts.room.themeToDark })).toBeNull();
      expect(screen.queryByRole("button", { name: texts.room.themeToLight })).toBeNull();
    },
  );

  it("stays light and has no theme button on the home page", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderApp({ path: "/" });

    expect(screen.getByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(themeOnPage()).toBeNull();
    expect(screen.queryByRole("button", { name: texts.room.themeToLight })).toBeNull();
  });

  it("goes back to light when the person leaves the room, keeping the choice for the next one", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderApp({ state: makeConnectedState() });
    expect(themeOnPage()).toBe("dark");

    leaveRoom();

    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(themeOnPage()).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("controls", () => {
  it("tells the states apart by name and pressed state, not only by color", () => {
    const off = renderApp({ state: makeConnectedState({ micMuted: true, handRaised: false }) });
    expect(screen.getByRole("button", { name: texts.controls.micOn })).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.controls.handRaise }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    off.unmount();

    renderApp({ state: makeConnectedState({ micMuted: false, handRaised: true }) });
    expect(screen.getByRole("button", { name: texts.controls.micOff }).dataset.active).toBe("true");
    const hand = screen.getByRole("button", { name: texts.controls.handLower });
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    expect(hand.dataset.active).toBe("true");
    expect(screen.getByRole("button", { name: texts.controls.copyLink }).dataset.active).toBeUndefined();
  });

  it("opens the microphone, which starts muted", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState({ micMuted: true }), actions });

    fireEvent.click(screen.getByRole("button", { name: texts.controls.micOn }));
    expect(actions.setMicMuted).toHaveBeenCalledWith(false);
  });

  it("hides screen sharing where the browser cannot do it (phones)", () => {
    const desktop = renderApp({ state: makeConnectedState() });
    expect(screen.getByRole("button", { name: texts.controls.screenOn })).toBeTruthy();
    desktop.unmount();

    renderApp({ state: makeConnectedState({ capabilities: { canShareScreen: false, canUseCamera: true } }) });
    expect(screen.queryByRole("button", { name: texts.controls.screenOn })).toBeNull();
    expect(screen.getByRole("button", { name: texts.controls.cameraOn })).toBeTruthy();
  });

  it("starts the camera and the screen share", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    fireEvent.click(screen.getByRole("button", { name: texts.controls.cameraOn }));
    fireEvent.click(screen.getByRole("button", { name: texts.controls.screenOn }));
    expect(actions.startVideo.mock.calls).toEqual([["camera"], ["screen"]]);
  });

  it("stops the own video, and still asks the server for a second one", () => {
    const actions = makeActions();
    renderApp({
      state: makeConnectedState({
        videos: [
          makeVideo({ id: "mine", ownerId: "me", kind: "camera", stream: fakeStream(), isLocal: true }),
        ],
        featuredVideoId: "mine",
        localVideoIds: ["mine"],
      }),
      actions,
    });

    // With the camera live, sharing the screen is the server's call (it answers with a notice).
    fireEvent.click(screen.getByRole("button", { name: texts.controls.screenOn }));
    expect(actions.startVideo).toHaveBeenCalledWith("screen");

    fireEvent.click(screen.getByRole("button", { name: texts.controls.cameraOff }));
    expect(actions.stopVideo).toHaveBeenCalledWith("mine");
  });

  it("raises the hand, reacts, copies the link and leaves", async () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    fireEvent.click(screen.getByRole("button", { name: texts.controls.handRaise }));
    expect(actions.setHandRaised).toHaveBeenCalledWith(true);

    // One reaction per opening of the picker.
    for (const reaction of REACTIONS) {
      fireEvent.click(screen.getByRole("button", { name: texts.controls.reactions }));
      fireEvent.click(screen.getByRole("button", { name: texts.controls.react(reaction) }));
    }
    expect(actions.react.mock.calls.map(([reaction]) => reaction)).toEqual([...REACTIONS]);

    fireEvent.click(screen.getByRole("button", { name: texts.controls.copyLink }));
    expect(actions.copyLink).toHaveBeenCalledTimes(1);

    leaveRoom();
    expect(actions.leave).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
  });

  it("closes the reactions picker after one reaction, and opens it again on request", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });
    const opener = screen.getByRole("button", { name: texts.controls.reactions });
    const picker = () => screen.queryByRole("group", { name: texts.controls.reactions });

    expect(picker()).toBeNull();
    fireEvent.click(opener);
    expect(picker()).toBeTruthy();
    expect(opener.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: texts.controls.react(REACTIONS[0]) }));
    expect(actions.react).toHaveBeenCalledTimes(1);
    expect(picker()).toBeNull();
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    // The focus goes back to the button that opens the picker.
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    expect(picker()).toBeTruthy();
  });
});

describe("chat", () => {
  it("sends with Enter, trimmed, and clears the field", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    fireEvent.change(chatInput(), { target: { value: "  oi, gente  " } });
    fireEvent.keyDown(chatInput(), { key: "Enter" });

    expect(actions.sendChat).toHaveBeenCalledWith("oi, gente");
    expect(chatInput().value).toBe("");
  });

  it("does not send an empty message, and Shift+Enter only breaks the line", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    fireEvent.keyDown(chatInput(), { key: "Enter" });
    fireEvent.change(chatInput(), { target: { value: "linha" } });
    fireEvent.keyDown(chatInput(), { key: "Enter", shiftKey: true });

    expect(actions.sendChat).not.toHaveBeenCalled();
    expect(chatInput().value).toBe("linha");
  });

  it("limits the message to the configured length", () => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState(), actions });

    expect(chatInput().maxLength).toBe(CHAT_MAX_LENGTH);
    fireEvent.change(chatInput(), { target: { value: "a".repeat(CHAT_MAX_LENGTH + 50) } });
    expect(chatInput().value).toHaveLength(CHAT_MAX_LENGTH);
    expect(screen.getByText(texts.chat.limitReached(CHAT_MAX_LENGTH))).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: texts.chat.send }));
    expect(actions.sendChat.mock.calls[0]?.[0]).toHaveLength(CHAT_MAX_LENGTH);
  });

  it("aligns the own messages to the right and the others to the left", () => {
    renderApp({
      state: makeConnectedState({
        chat: [
          { id: "m1", from: "p1", nickname: "Ana", text: "oi, gente", sentAt: 1_700_000_000_000 },
          { id: "m2", from: "me", nickname: "Eu", text: "oi, Ana", sentAt: 1_700_000_001_000 },
        ],
      }),
    });

    const theirs = screen.getByText("oi, gente").closest("article");
    const mine = screen.getByText("oi, Ana").closest("article");
    expect(mine?.dataset.own).toBe("true");
    expect(mine?.className).toContain("self-end");
    expect(mine?.className).toContain("text-right");
    expect(theirs?.dataset.own).toBeUndefined();
    expect(theirs?.className).toContain("self-start");
    expect(theirs?.className).not.toContain("text-right");
  });

  it("keeps the message field at a size that does not make phones zoom in", () => {
    renderApp({ state: makeConnectedState() });

    // `text-body` is 17px; below 16px iOS zooms into the field on focus.
    expect(chatInput().className.split(" ")).toContain("text-body");
    expect(chatInput().className).toContain("min-w-0");
    expect(screen.getByRole("button", { name: texts.chat.send }).className).toContain("shrink-0");
  });

  it("renders messages as plain text in a live log", () => {
    const text = '<b>negrito</b> https://exemplo.com <img src="x">';
    renderApp({
      state: makeConnectedState({
        chat: [{ id: "m1", from: "p1", nickname: "Ana", text, sentAt: 1_700_000_000_000 }],
      }),
    });

    const log = screen.getByRole("log", { name: texts.chat.label });
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(within(log).getByText(text)).toBeTruthy();
    expect(log.querySelector("b, img, a")).toBeNull();
  });
});

describe("notices", () => {
  const notices: RoomNotice[] = [
    { kind: "videoRoomLimit" },
    { kind: "videoPersonLimit" },
    { kind: "chatRateLimited" },
    { kind: "mutedByOwner" },
    { kind: "mediaPermissionDenied", device: "microphone" },
    { kind: "mediaPermissionDenied", device: "camera" },
    { kind: "mediaPermissionDenied", device: "screen" },
    { kind: "turnstileFailed" },
    { kind: "rateLimited" },
    { kind: "linkCopied" },
  ];

  it("has a different text for each notice", () => {
    const all = notices.map((notice) => noticeText(notice));
    expect(all.every((text) => text.length > 0)).toBe(true);
    // Only the two "too many attempts"/"robot check" texts may repeat elsewhere; here all differ.
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(notices)("shows and dismisses $kind", (notice) => {
    const actions = makeActions();
    renderApp({ state: makeConnectedState({ notice }), actions });

    // Inside the room, "too fast" has its own text (reactions, hand and microphone).
    expect(screen.getByText(noticeText(notice, undefined, { inRoom: true }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: texts.notices.dismiss }));
    expect(actions.dismissNotice).toHaveBeenCalledTimes(1);
  });

  it("shows nothing without a notice", () => {
    renderApp({ state: makeConnectedState() });
    expect(screen.queryByRole("button", { name: texts.notices.dismiss })).toBeNull();
  });
});
