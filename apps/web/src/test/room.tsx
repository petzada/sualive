import { REACTIONS, ROOM_MAX_PEOPLE, VIDEOS_PER_PERSON, WATCHED_VIDEOS_PER_PERSON } from "@sualive/config";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { Mock } from "vitest";
import { App } from "../App";
import { AccountClientProvider } from "../components/account/AccountClient";
import { RoomClientProvider } from "../components/room/RoomClient";
import { WalletClientProvider } from "../components/wallet/WalletClient";
import type { TurnstileApi } from "../components/Turnstile";
import type { AccountActions, AccountState } from "../lib/account";
import type { CreateRoom, ParticipantView, RoomActions, RoomState, VideoView } from "../lib/room";
import type { WalletActions, WalletState } from "../lib/wallet";
import { makeAccountActions, makeAccountState } from "./account";
import { makeWalletActions, makeWalletState } from "./wallet";

export const TEST_TOKEN = "test-turnstile-token";

/**
 * Replaces the Turnstile script. Like the real one in the `execute` mode, rendering asks for
 * nothing; the widget "passes" when `execute` is called (`render` alone passes only for a widget
 * that is not in that mode). Call it with `{ pass: false }` to keep the token pending and drive
 * the callbacks by hand. Every rendered widget gets its own id ("widget-1", "widget-2"…) and the
 * callbacks are always those of the last one.
 */
export function installTurnstileStub({ pass = true } = {}) {
  const callbacks: {
    token?: (token: string) => void;
    error?: (code?: string) => boolean;
    expired?: () => void;
    timeout?: () => void;
    unsupported?: () => void;
    /** Cloudflare demands an interaction from the person. */
    beforeInteractive?: () => void;
    /** The interaction is over. */
    afterInteractive?: () => void;
  } = {};
  /** Widgets rendered and not removed yet. */
  const live = new Set<string>();
  let rendered = 0;
  const api = {
    render: vi.fn<TurnstileApi["render"]>((_container, options) => {
      callbacks.token = options.callback;
      callbacks.error = options["error-callback"];
      callbacks.expired = options["expired-callback"];
      callbacks.timeout = options["timeout-callback"];
      callbacks.unsupported = options["unsupported-callback"];
      callbacks.beforeInteractive = options["before-interactive-callback"];
      callbacks.afterInteractive = options["after-interactive-callback"];
      const id = `widget-${++rendered}`;
      live.add(id);
      if (pass && (options.execution as string) !== "execute") options.callback(TEST_TOKEN);
      return id;
    }),
    execute: vi.fn<TurnstileApi["execute"]>(() => {
      if (pass) callbacks.token?.(TEST_TOKEN);
    }),
    reset: vi.fn<TurnstileApi["reset"]>(),
    remove: vi.fn<TurnstileApi["remove"]>((id) => {
      live.delete(id);
    }),
  };
  window.turnstile = api;
  return { api, callbacks, live };
}

export function makeParticipant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: "p1",
    handle: null,
    avatarUrl: null,
    badges: [],
    cosmetics: null,
    canReceiveGold: false,
    nickname: "Ana",
    isSelf: false,
    isOwner: false,
    isModerator: false,
    micMuted: true,
    handRaised: false,
    speaking: false,
    connection: "connected",
    relayed: false,
    audioStream: null,
    ...overrides,
  };
}

/**
 * A video already being watched (`watch: "watching"`), or the viewer's own (`watch: "local"`) when
 * `isLocal` is set. Pass `watch` for the other states ("idle" shows the "Watch" card).
 */
export function makeVideo(overrides: Partial<VideoView> = {}): VideoView {
  return {
    id: "v1",
    kind: "camera",
    ownerId: "p1",
    stream: null,
    isLocal: false,
    watch: overrides.isLocal ? "local" : "watching",
    blockedReason: null,
    viewers: [],
    blockedViewers: [],
    ...overrides,
  };
}

export function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    phase: "lobby",
    fixed: false,
    ownerHandle: null,
    theme: "default",
    protected: false,
    maxVideos: null,
    maxOwnVideos: VIDEOS_PER_PERSON,
    maxWatchedVideos: WATCHED_VIDEOS_PER_PERSON,
    watchedCount: 0,
    relayMeter: null,
    protectedMeter: null,
    endReason: null,
    accountNickname: null,
    code: "abcdefghjk",
    link: "https://sualive.test/s/abcdefghjk",
    occupancy: { participants: 2, capacity: ROOM_MAX_PEOPLE },
    selfId: null,
    isOwner: false,
    isModerator: false,
    participants: [],
    videos: [],
    featuredVideoId: null,
    chat: [],
    reactions: [],
    availableReactions: [...REACTIONS],
    canSendGold: false,
    gifts: [],
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
    useThisTab: vi.fn<RoomActions["useThisTab"]>(),
    sendChat: vi.fn<RoomActions["sendChat"]>(),
    react: vi.fn<RoomActions["react"]>(),
    setHandRaised: vi.fn<RoomActions["setHandRaised"]>(),
    setMicMuted: vi.fn<RoomActions["setMicMuted"]>(() => Promise.resolve()),
    startVideo: vi.fn<RoomActions["startVideo"]>(() => Promise.resolve()),
    stopVideo: vi.fn<RoomActions["stopVideo"]>(),
    watchVideo: vi.fn<RoomActions["watchVideo"]>(),
    unwatchVideo: vi.fn<RoomActions["unwatchVideo"]>(),
    setFeaturedVideo: vi.fn<RoomActions["setFeaturedVideo"]>(),
    moderate: vi.fn<RoomActions["moderate"]>(),
    setModerator: vi.fn<RoomActions["setModerator"]>(),
    sendGold: vi.fn<RoomActions["sendGold"]>(() => Promise.resolve({ ok: true })),
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
  /** Wallet seen by the screens; nothing loaded unless told otherwise. */
  wallet?: WalletState;
  walletActions?: WalletActions;
}

/** Renders the whole app at `path` with fake room and account clients in place of `lib`. */
export function renderApp({
  path = "/s/abcdefghjk",
  state = makeState(),
  actions = makeActions(),
  createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: true, code: "abcdefghjk" })),
  account = makeAccountState(),
  accountActions = makeAccountActions(),
  wallet = makeWalletState(),
  walletActions = makeWalletActions(),
}: RenderAppOptions = {}) {
  const useRoom = vi.fn((_code: string) => ({ state, actions }));
  const useAccount = () => ({ state: account, actions: accountActions });
  const useWallet = () => ({ state: wallet, actions: walletActions });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <AccountClientProvider client={{ useAccount }}>
        <WalletClientProvider client={{ useWallet }}>
          <RoomClientProvider client={{ useRoom, createRoom }}>
            <App />
          </RoomClientProvider>
        </WalletClientProvider>
      </AccountClientProvider>
    </MemoryRouter>,
  );
  return { ...view, useRoom, createRoom, actions, accountActions, walletActions };
}
