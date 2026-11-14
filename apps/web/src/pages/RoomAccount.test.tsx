import { PLUS_VIDEOS_PER_PERSON, ROOM_THEMES } from "@sualive/config";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { noticeText } from "../components/room/NoticeBanner";
import { ROOM_THEME_ATTRIBUTE } from "../components/room/RoomThemePicker";
import { makeAccountState, makeUser } from "../test/account";
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

describe("fixed-link room route", () => {
  it("opens the same room page with @nome", () => {
    const { useRoom } = renderApp({ path: "/@marina" });

    expect(useRoom).toHaveBeenCalledWith("@marina");
    expect(heading()).toBe(texts.lobby.title);
  });

  it("reads the handle in lower case", () => {
    const { useRoom } = renderApp({ path: "/@Marina_2" });
    expect(useRoom).toHaveBeenCalledWith("@marina_2");
  });

  it.each(["/@ab", "/@nome-com-traco", "/@", "/marina", "/@um_nome_longo_demais_para_valer"])(
    "does not treat %s as a room",
    (path) => {
      const { useRoom } = renderApp({ path });
      expect(useRoom).not.toHaveBeenCalled();
      expect(heading()).toBe(texts.error.notFound.title);
    },
  );

  it.each([
    ["/entrar", texts.login.title],
    ["/plus", texts.plus.title],
    ["/termos", texts.legal.terms.title],
    ["/privacidade", texts.legal.privacy.title],
  ])("keeps the fixed page %s ahead of the room", (path, title) => {
    const { useRoom } = renderApp({ path });
    expect(heading()).toBe(title);
    expect(useRoom).not.toHaveBeenCalled();
  });

  it("still opens a common room by its code", () => {
    const { useRoom } = renderApp({ path: "/s/abcdefghjk" });
    expect(useRoom).toHaveBeenCalledWith("abcdefghjk");
  });
});

describe("lobby with an account", () => {
  it("shows who is entering instead of the nickname field, and enters with that nickname", async () => {
    const { api } = installTurnstileStub();
    const actions = makeActions();
    renderApp({
      state: makeState({ accountNickname: "Marina" }),
      actions,
      account: makeAccountState({ user: makeUser({ avatarUrl: "https://example.test/a.png" }) }),
    });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    expect(screen.queryByLabelText(texts.lobby.nicknameLabel)).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    const joiningAs = screen.getByTestId("joining-as");
    expect(joiningAs.textContent).toBe(`${texts.lobby.joiningAs}Marina`);
    expect(joiningAs.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.png");
    expect(screen.queryByRole("link", { name: texts.lobby.loginLink })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: texts.lobby.join }));
    await waitFor(() =>
      expect(actions.join).toHaveBeenCalledWith({ nickname: "Marina", turnstileToken: TEST_TOKEN }),
    );
  });

  it("keeps the join button as far from 'joining as' as that block is from the title", () => {
    renderApp({
      state: makeState({ accountNickname: "Marina" }),
      account: makeAccountState({ user: makeUser() }),
    });

    const title = screen.getByRole("heading", { level: 1, name: texts.lobby.title });
    const joiningAs = screen.getByTestId("joining-as");
    const button = screen.getByRole("button", { name: texts.lobby.join });
    const form = button.closest("form")!;
    const block = joiningAs.parentElement!;

    // Title and block are neighbors in the form; "joining as" and the button's block are neighbors in the block.
    expect(title.parentElement).toBe(form);
    expect(title.nextElementSibling).toBe(block);
    expect(joiningAs.nextElementSibling).toBe(button.parentElement);
    // The same step in both.
    expect(form.className.split(" ")).toContain("gap-10");
    expect(block.className.split(" ")).toContain("gap-10");
    expect(block.className.split(" ")).not.toContain("gap-gap");
  });

  it("changes nothing for who has no account, besides a discreet link to log in and come back", () => {
    renderApp({ path: "/s/abcdefghjk" });

    expect(screen.getByLabelText(texts.lobby.nicknameLabel)).toBeTruthy();
    expect(screen.queryByTestId("joining-as")).toBeNull();
    expect(screen.getByRole("link", { name: texts.lobby.loginLink }).getAttribute("href")).toBe(
      "/entrar?returnTo=%2Fs%2Fabcdefghjk",
    );
  });

  it("comes back to the fixed-link room after the login", () => {
    renderApp({ path: "/@marina" });
    expect(screen.getByRole("link", { name: texts.lobby.loginLink }).getAttribute("href")).toBe(
      "/entrar?returnTo=%2F%40marina",
    );
  });
});

describe("header of a fixed-link room", () => {
  it("shows the @handle of the owner in the place of the code", () => {
    renderApp({
      path: "/@marina",
      state: makeConnectedState({ code: "@marina", fixed: true, ownerHandle: "marina" }),
    });

    const code = screen.getByTestId("room-code");
    expect(code.textContent).toBe(`${texts.room.fixedLabel} @marina`);
    expect(code.textContent).not.toContain(texts.room.codeLabel);
  });

  it("keeps the code in a common room", () => {
    renderApp({ state: makeConnectedState() });
    expect(screen.getByTestId("room-code").textContent).toBe(`${texts.room.codeLabel} abcdefghjk`);
  });
});

describe("accounts inside the room", () => {
  const withAccounts = () =>
    makeConnectedState({
      participants: [
        makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
        makeParticipant({
          id: "p1",
          nickname: "Ana",
          handle: "ana",
          avatarUrl: "https://example.test/ana.png",
          badges: ["plus", "early_supporter"],
        }),
        makeParticipant({ id: "p2", nickname: "Bia" }),
      ],
    });
  const people = () => within(screen.getByRole("list", { name: texts.people.label }));
  const rowOf = (nickname: string) => within(people().getByText(nickname).closest("li")!);

  it("shows picture, handle and badges in the people list, and nothing new for guests", () => {
    renderApp({ state: withAccounts() });

    const ana = rowOf("Ana");
    const picture = ana.getByTestId("avatar").querySelector("img");
    expect(picture?.getAttribute("src")).toBe("https://example.test/ana.png");
    expect(picture?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(ana.getByText("@ana")).toBeTruthy();
    const plus = ana.getByRole("img", { name: texts.badges.plus.name });
    expect(plus.getAttribute("title")).toBe(texts.badges.plus.hint);
    expect(ana.getByRole("img", { name: texts.badges.early_supporter.name }).getAttribute("title")).toBe(
      texts.badges.early_supporter.hint,
    );

    const bia = rowOf("Bia");
    expect(bia.getByTestId("avatar").textContent).toBe("B");
    expect(bia.getByTestId("avatar").querySelector("img")).toBeNull();
    expect(bia.queryByTestId("badges")).toBeNull();
  });

  it("falls back to the initial when the picture fails to load", () => {
    renderApp({ state: withAccounts() });
    const avatar = rowOf("Ana").getByTestId("avatar");

    fireEvent.error(avatar.querySelector("img")!);

    expect(avatar.querySelector("img")).toBeNull();
    expect(avatar.textContent).toBe("A");
  });

  it("shows picture, handle and badges on the empty stage", () => {
    renderApp({ state: withAccounts() });
    const stage = within(screen.getByRole("region", { name: texts.stage.label }));
    const ana = within(stage.getByText("Ana").closest("li")!);

    expect(ana.getByTestId("avatar").querySelector("img")).toBeTruthy();
    expect(ana.getByText("@ana")).toBeTruthy();
    expect(ana.getByRole("img", { name: texts.badges.plus.name })).toBeTruthy();
  });

  it("shows picture and badges on the video labels, featured and thumbnail", () => {
    renderApp({
      state: {
        ...withAccounts(),
        videos: [
          makeVideo({ id: "v1", ownerId: "p1", kind: "screen", stream: fakeStream() }),
          makeVideo({ id: "v2", ownerId: "p1", kind: "camera", stream: fakeStream() }),
          makeVideo({ id: "v3", ownerId: "p2", kind: "camera", stream: fakeStream() }),
        ],
        featuredVideoId: "v1",
      },
    });

    const [featured, thumbnail, guest] = screen.getAllByTestId("video-tile").map((tile) => within(tile));
    expect(featured!.getByTestId("avatar").querySelector("img")).toBeTruthy();
    expect(featured!.getByText("@ana")).toBeTruthy();
    expect(featured!.getByRole("img", { name: texts.badges.plus.name })).toBeTruthy();
    expect(thumbnail!.getByRole("img", { name: texts.badges.early_supporter.name })).toBeTruthy();
    expect(guest!.queryByTestId("badges")).toBeNull();
    expect(guest!.queryByTestId("avatar")).toBeNull();
  });

  it("shows picture, handle and badges beside the name in the chat, while the person is in the room", () => {
    renderApp({
      state: {
        ...withAccounts(),
        chat: [
          { id: "m1", from: "p1", nickname: "Ana", text: "oi", sentAt: 1 },
          { id: "m2", from: "p2", nickname: "Bia", text: "olá", sentAt: 2 },
          { id: "m3", from: "gone", nickname: "Caio", text: "tchau", sentAt: 3 },
        ],
      },
    });
    const log = within(screen.getByRole("log", { name: texts.chat.label }));
    const messageOf = (text: string) => within(log.getByText(text).closest("article")!);

    const ana = messageOf("oi");
    expect(ana.getByTestId("avatar").querySelector("img")).toBeTruthy();
    expect(ana.getByText("@ana")).toBeTruthy();
    expect(ana.getByRole("img", { name: texts.badges.plus.name })).toBeTruthy();
    for (const text of ["olá", "tchau"]) {
      expect(messageOf(text).queryByTestId("badges")).toBeNull();
      expect(messageOf(text).queryByTestId("avatar")).toBeNull();
    }
    // Still text only: the picture is the only image a message may carry.
    expect(log.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("two videos with the Plus", () => {
  const twoVideos = () =>
    makeConnectedState({
      maxOwnVideos: PLUS_VIDEOS_PER_PERSON,
      videos: [
        makeVideo({ id: "cam", ownerId: "me", kind: "camera", stream: fakeStream(), isLocal: true }),
        makeVideo({ id: "scr", ownerId: "me", kind: "screen", stream: fakeStream(), isLocal: true }),
      ],
      featuredVideoId: "scr",
      localVideoIds: ["cam", "scr"],
    });

  it("keeps camera and screen on at the same time, each button stopping its own", () => {
    const actions = makeActions();
    renderApp({ state: twoVideos(), actions });

    const camera = screen.getByRole("button", { name: texts.controls.cameraOff });
    const screenShare = screen.getByRole("button", { name: texts.controls.screenOff });
    expect(camera.dataset.active).toBe("true");
    expect(screenShare.dataset.active).toBe("true");

    fireEvent.click(camera);
    expect(actions.stopVideo.mock.calls).toEqual([["cam"]]);
    fireEvent.click(screenShare);
    expect(actions.stopVideo.mock.calls).toEqual([["cam"], ["scr"]]);
    expect(actions.startVideo).not.toHaveBeenCalled();
  });

  it("starts the second video while the first is on", () => {
    const actions = makeActions();
    const state = twoVideos();
    renderApp({
      state: { ...state, videos: state.videos.slice(0, 1), localVideoIds: ["cam"], featuredVideoId: "cam" },
      actions,
    });

    fireEvent.click(screen.getByRole("button", { name: texts.controls.screenOn }));
    expect(actions.startVideo).toHaveBeenCalledWith("screen");
    expect(actions.stopVideo).not.toHaveBeenCalled();
  });

  it("names the right limit in the notice", () => {
    expect(noticeText({ kind: "videoPersonLimit" })).toBe(texts.notices.videoPersonLimit);
    expect(noticeText({ kind: "videoPersonLimit" }, PLUS_VIDEOS_PER_PERSON)).toBe(
      texts.notices.videoPersonLimitPlus,
    );
    expect(texts.notices.videoPersonLimitPlus).toContain(String(PLUS_VIDEOS_PER_PERSON));

    renderApp({ state: { ...twoVideos(), notice: { kind: "videoPersonLimit" } } });
    expect(screen.getByText(texts.notices.videoPersonLimitPlus)).toBeTruthy();
  });
});

describe("room theme", () => {
  const picker = () => screen.queryByRole("button", { name: texts.room.roomTheme.open });
  const fixedOwner = (overrides = {}) =>
    makeConnectedState({ fixed: true, ownerHandle: "marina", isOwner: true, ...overrides });

  it.each([
    ["a guest of a fixed-link room", { fixed: true, ownerHandle: "marina", isOwner: false }],
    ["the owner of a common room", { fixed: false, isOwner: true }],
    ["a guest of a common room", {}],
  ])("has no picker for %s", (_who, overrides) => {
    renderApp({ state: makeConnectedState(overrides) });
    expect(picker()).toBeNull();
  });

  it("lets the owner of a fixed-link room choose among the ready-made themes", () => {
    const actions = makeActions();
    renderApp({ state: fixedOwner({ theme: "ocean" }), actions });
    const opener = picker()!;
    expect(opener.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    const group = within(screen.getByRole("group", { name: texts.room.roomTheme.label }));
    const options = group.getAllByRole("button");
    expect(options.map((option) => option.textContent)).toEqual(
      ROOM_THEMES.map((name) => texts.room.roomTheme.names[name]),
    );
    expect(ROOM_THEMES).toHaveLength(6);
    // The current one is marked by more than color.
    expect(options.map((option) => option.getAttribute("aria-pressed"))).toEqual(
      ROOM_THEMES.map((name) => String(name === "ocean")),
    );

    fireEvent.click(group.getByRole("button", { name: texts.room.roomTheme.names.forest }));
    expect(actions.setRoomTheme).toHaveBeenCalledWith("forest");

    fireEvent.keyDown(opener, { key: "Escape" });
    expect(screen.queryByRole("group", { name: texts.room.roomTheme.label })).toBeNull();
  });

  it("has a Portuguese name for every theme", () => {
    const names = ROOM_THEMES.map((name) => texts.room.roomTheme.names[name]);
    expect(new Set(names).size).toBe(ROOM_THEMES.length);
    expect(names.every((name) => name.length > 0)).toBe(true);
  });

  it("applies the theme of the room for everyone in it, on the page root, and undoes it on leaving", async () => {
    const root = document.documentElement;
    // A guest: the theme is of the room, not of who chose it.
    renderApp({ state: makeConnectedState({ fixed: true, ownerHandle: "marina", theme: "sunset" }) });
    expect(root.getAttribute(ROOM_THEME_ATTRIBUTE)).toBe("sunset");

    fireEvent.click(screen.getByRole("button", { name: texts.controls.leave }));
    await screen.findByRole("button", { name: texts.home.create });
    expect(root.hasAttribute(ROOM_THEME_ATTRIBUTE)).toBe(false);
  });

  it("leaves the default theme exactly as the room is today: no attribute at all", () => {
    renderApp({ state: fixedOwner() });
    expect(document.documentElement.hasAttribute(ROOM_THEME_ATTRIBUTE)).toBe(false);
  });

  it("does not theme the lobby", () => {
    renderApp({ state: makeState({ fixed: true, ownerHandle: "marina", theme: "sunset" }) });
    expect(document.documentElement.hasAttribute(ROOM_THEME_ATTRIBUTE)).toBe(false);
  });

  it("works together with the dark theme, which stays each person's choice", () => {
    renderApp({ state: fixedOwner({ theme: "lavender" }) });
    fireEvent.click(screen.getByRole("button", { name: texts.room.themeToDark }));

    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.getAttribute(ROOM_THEME_ATTRIBUTE)).toBe("lavender");
  });
});
