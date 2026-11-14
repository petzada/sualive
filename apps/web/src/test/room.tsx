import { ROOM_MAX_PEOPLE } from "@sualive/config";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { Mock } from "vitest";
import { App } from "../App";
import { AccountClientProvider } from "../components/account/AccountClient";
import { RoomClientProvider } from "../components/room/RoomClient";
import type { TurnstileApi } from "../components/Turnstile";
import type { AccountActions, AccountState } from "../lib/account";
import type { CreateRoom, ParticipantView, RoomActions, RoomState, VideoView } from "../lib/room";
import { makeAccountActions, makeAccountState } from "./account";

export const TEST_TOKEN = "test-turnstile-token";

/**
 * Replaces the Turnstile script: the widget "passes" as soon as it renders. Call it with
 * `{ pass: false }` to keep the token pending and drive the callbacks by hand.
 */
export function installTurnstileStub({ pass = true } = {}) {
  const callbacks: { token?: (token: string) => void; error?: () => boolean; expired?: () => void } = {};
  const api = {
    render: vi.fn<TurnstileApi["render"]>((_container, options) => {
      callbacks.token = options.callback;
      callbacks.error = options["error-callback"];
      callbacks.expired = options["expired-callback"];
      if (pass) options.callback(TEST_TOKEN);
      return "widget-1";
    }),
    reset: vi.fn<TurnstileApi["reset"]>(),
    remove: vi.fn<TurnstileApi["remove"]>(),
  };
  window.turnstile = api;
  return { api, callbacks };
}

export function makeParticipant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: "p1",
    handle: null,
    avatarUrl: null,
    badges: [],
    nickname: "Ana",
    isSelf: false,
    isOwner: false,
    micMuted: true,
    handRaised: false,
    speaking: false,
    connection: "connected",
    relayed: false,
    audioStream: null,
    ...overrides,
  };
}

export function makeVideo(overrides: Partial<VideoView> = {}): VideoView {
  return { id: "v1", kind: "camera", ownerId: "p1", stream: null, isLocal: false, ...overrides };
}

export function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    phase: "lobby",
    fixed: false,
    ownerHandle: null,
    theme: "default",
    maxOwnVideos: 1,
    accountNickname: null,
    code: "abcdefghjk",
    link: "https://sualive.test/s/abcdefghjk",
    occupancy: { participants: 2, capacity: ROOM_MAX_PEOPLE },
    selfId: null,
    isOwner: false,
    participants: [],
    videos: [],
    featuredVideoId: null,
    chat: [],
    reactions: [],
    notice: null,
    micMuted: true,
    handRaised: false,
    localVideoIds: [],
    capabilities: { canShareScreen: true, canUseCamera: true },
    preview: null,
    ...overrides,
  };
}

/** A connected room with the viewer ("Eu") and two other people. */
export function makeConnectedState(overrides: Partial<RoomState> = {}): RoomState {
  return makeState({
    phase: "connected",
    selfId: "me",
    occupancy: { participants: 3, capacity: ROOM_MAX_PEOPLE },
    participants: [
      makeParticipant({ id: "me", nickname: "Eu", isSelf: true }),
      makeParticipant({ id: "p1", nickname: "Ana" }),
      makeParticipant({ id: "p2", nickname: "Bia" }),
    ],
    ...overrides,
  });
}

export function makeActions(): { [K in keyof RoomActions]: Mock<RoomActions[K]> } {
  return {
    startPreview: vi.fn<RoomActions["startPreview"]>(() => Promise.resolve()),
    setRoomTheme: vi.fn<RoomActions["setRoomTheme"]>(),
    join: vi.fn<RoomActions["join"]>(() => Promise.resolve()),
    leave: vi.fn<RoomActions["leave"]>(),
    sendChat: vi.fn<RoomActions["sendChat"]>(),
    react: vi.fn<RoomActions["react"]>(),
    setHandRaised: vi.fn<RoomActions["setHandRaised"]>(),
    setMicMuted: vi.fn<RoomActions["setMicMuted"]>(() => Promise.resolve()),
    startVideo: vi.fn<RoomActions["startVideo"]>(() => Promise.resolve()),
    stopVideo: vi.fn<RoomActions["stopVideo"]>(),
    setFeaturedVideo: vi.fn<RoomActions["setFeaturedVideo"]>(),
    moderate: vi.fn<RoomActions["moderate"]>(),
    copyLink: vi.fn<RoomActions["copyLink"]>(() => Promise.resolve()),
    dismissNotice: vi.fn<RoomActions["dismissNotice"]>(),
  };
}

interface RenderAppOptions {
  path?: string;
  state?: RoomState;
  actions?: RoomActions;
  createRoom?: CreateRoom;
  /** Account seen by the screens; anonymous unless told otherwise. */
  account?: AccountState;
  accountActions?: AccountActions;
}

/** Renders the whole app at `path` with fake room and account clients in place of `lib`. */
export function renderApp({
  path = "/s/abcdefghjk",
  state = makeState(),
  actions = makeActions(),
  createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: true, code: "abcdefghjk" })),
  account = makeAccountState(),
  accountActions = makeAccountActions(),
}: RenderAppOptions = {}) {
  const useRoom = vi.fn((_code: string) => ({ state, actions }));
  const useAccount = () => ({ state: account, actions: accountActions });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AccountClientProvider client={{ useAccount }}>
        <RoomClientProvider client={{ useRoom, createRoom }}>
          <App />
        </RoomClientProvider>
      </AccountClientProvider>
    </MemoryRouter>,
  );
  return { ...view, useRoom, createRoom, actions, accountActions };
}
