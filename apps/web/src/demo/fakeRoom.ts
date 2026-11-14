/**
 * Fake room client for the dev-only demo (`/demo`). Nothing here talks to a server or to WebRTC:
 * videos are animated canvases and every action just edits local state.
 */
import {
  AUTO_WATCH_MAX_PEOPLE,
  GOLD_GIFT_DAILY_LIMIT,
  PLUS_VIDEOS_PER_PERSON,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_GRACE_MS,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  PROTECTED_ROOM_WARNING_MINUTES,
  REACTIONS,
  RELAY_VIDEO_GOLD_PER_HOUR,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
  WATCHED_VIDEOS_PER_PERSON,
} from "@sualive/config";
import type { RoomTheme } from "@sualive/config";
import type { DevicePreview, VideoKind } from "@sualive/media";
import { useEffect, useMemo, useState } from "react";
import type { RoomClient } from "../components/room/RoomClient";
import type {
  ParticipantView,
  ProtectedMeter,
  RoomActions,
  RoomNotice,
  RoomPhase,
  RoomState,
  VideoView,
} from "../lib/room";
import { demoAvatar } from "./fakeAccount";

export interface DemoOptions {
  phase: RoomPhase;
  isOwner: boolean;
  people: number;
  videos: number;
  mobile: boolean;
  notice: RoomNotice | null;
  /** Fixed-link room of this handle (also when the code is `@nome`). */
  fixedHandle?: string | null;
  theme?: RoomTheme;
  /** The viewer is logged in: enters with the nickname of the profile. */
  account?: { nickname: string; handle: string | null; avatarUrl: string | null; plus: boolean } | null;
  /** Protected room: 6 people at most, 2 videos, and the owner's balance meter running. */
  protected?: boolean;
  /** The viewer was promoted to moderator by the owner. */
  moderator?: boolean;
}

const NAMES = [
  "Marina",
  "Caio",
  "Beatriz Albuquerque Lima",
  "Téo",
  "Jô",
  "Rafa",
  "Lia",
  "Davi",
  "Nina",
  "Otávio",
  "Sol",
  "Iara",
];
const SELF_ID = "p0";

const streams = new Map<string, MediaStream>();

/** Animated canvas as a stand-in for a camera or a shared screen. */
function canvasStream(key: string, label: string, hue: number): MediaStream {
  const cached = streams.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  let frame = 0;
  const draw = () => {
    if (!context) return;
    frame += 1;
    context.fillStyle = `hsl(${hue} 25% 22%)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `hsl(${hue} 60% 70%)`;
    context.beginPath();
    context.arc(320 + Math.sin(frame / 12) * 200, 180 + Math.cos(frame / 9) * 80, 36, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = "28px sans-serif";
    context.fillText(label, 24, 44);
  };
  draw();
  setInterval(draw, 100);
  const stream = canvas.captureStream(10);
  streams.set(key, stream);
  return stream;
}

function fakePreview(): DevicePreview {
  return {
    cameraStream: canvasStream("preview", "prévia", 210),
    hasMicrophone: true,
    onMicrophoneLevel(handler) {
      const timer = setInterval(() => handler(Math.abs(Math.sin(Date.now() / 400)) * 0.9), 80);
      return () => clearInterval(timer);
    },
    stop() {},
  };
}

type AccountFields = Pick<
  ParticipantView,
  "handle" | "avatarUrl" | "badges" | "cosmetics" | "canReceiveGold"
>;

const GUEST: AccountFields = {
  handle: null,
  avatarUrl: null,
  badges: [],
  cosmetics: null,
  canReceiveGold: false,
};

/** Who has an account among the others, to see pictures, handles, badges and cosmetics beside guests. */
const ACCOUNTS: Record<number, AccountFields> = {
  1: {
    handle: "caio",
    avatarUrl: demoAvatar(20),
    badges: ["plus", "early_supporter"],
    cosmetics: {
      name: { light: ["#6d28d9", "#db2777"], dark: ["#a78bfa", "#f472b6"] },
      frame: { light: ["#b45309"], dark: ["#fbbf24"] },
    },
    canReceiveGold: true,
  },
  2: {
    handle: "bia_albuquerque",
    avatarUrl: null,
    badges: ["plus"],
    cosmetics: { name: { light: ["#047857"], dark: ["#34d399"] }, frame: null },
    canReceiveGold: true,
  },
  // Broken on purpose: the picture fails and the initial takes its place.
  4: {
    handle: "jo",
    avatarUrl: "/demo-missing-avatar.png",
    badges: [],
    cosmetics: null,
    canReceiveGold: true,
  },
};

/** Extra reactions of the viewer's equipped pack (logged-in demo only). */
const DEMO_PACK_REACTIONS = ["🥳", "🔥", "💯"];

/** Protected-room meter: a bit over the first balance warning, so it shows in seconds. */
const DEMO_PROTECTED_START_MS = (PROTECTED_ROOM_WARNING_MINUTES[0] * 60 + 20) * 1000;
/** The demo meter runs this many times faster than the clock. */
const DEMO_METER_SPEED = 30;

function protectedMeterAt(remainingMs: number, graceEndsAt: number | null): ProtectedMeter {
  const warning = PROTECTED_ROOM_WARNING_MINUTES[0] * 60_000;
  return {
    state: remainingMs <= 0 ? "grace" : remainingMs <= warning ? "warning" : "ok",
    remainingMs: Math.max(remainingMs, 0),
    goldPerHour: PROTECTED_ROOM_GOLD_PER_HOUR,
    graceEndsAt: remainingMs <= 0 ? graceEndsAt : null,
  };
}

/** Watched videos of other people (what counts against the limit). */
function watchedCountOf(videos: VideoView[]): number {
  return videos.filter((video) => ["requesting", "watching", "blocked"].includes(video.watch)).length;
}

function initialState(code: string, options: DemoOptions): RoomState {
  const capacity = options.protected ? PROTECTED_ROOM_MAX_PEOPLE : ROOM_MAX_PEOPLE;
  const count = Math.min(Math.max(options.people, 1), capacity);
  const small = count <= AUTO_WATCH_MAX_PEOPLE;
  const account = options.account ?? null;
  const fixedHandle = code.startsWith("@") ? code.slice(1) : (options.fixedHandle ?? null);
  const self: AccountFields = account
    ? {
        handle: account.handle,
        avatarUrl: account.avatarUrl,
        badges: account.plus ? ["plus"] : [],
        cosmetics: { name: { light: ["#1d4ed8"], dark: ["#93c5fd"] }, frame: null },
        canReceiveGold: true,
      }
    : GUEST;
  const participants: ParticipantView[] = Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    ...(index === 0 ? self : (ACCOUNTS[index] ?? GUEST)),
    nickname: index === 0 && account ? account.nickname : (NAMES[index] ?? `Pessoa ${index + 1}`),
    isSelf: index === 0,
    isOwner: options.isOwner ? index === 0 : index === 1,
    // Someone else is a moderator; the viewer too when the scene asks.
    isModerator: index === 0 ? (options.moderator ?? false) : index === 2,
    micMuted: index % 2 === 0,
    handRaised: index === 3,
    speaking: index === 1,
    connection: index === 4 ? "reconnecting" : "connected",
    relayed: index === 2,
    audioStream: null,
  }));
  const maxVideos = options.protected ? PROTECTED_ROOM_MAX_VIDEOS : count - 1;
  const videos: VideoView[] = Array.from(
    { length: Math.max(Math.min(options.videos, maxVideos, count - 1), 0) },
    (_, index) => {
      const kind: VideoKind = index === 0 ? "screen" : "camera";
      const ownerId = `p${index + 1}`;
      // Small room: everything opens by itself, up to the limit. Bigger room: only the first one is
      // watched, the second is blocked by an unpaid relay, the rest wait on the "Watch" card.
      const watch: VideoView["watch"] = small
        ? index < WATCHED_VIDEOS_PER_PERSON
          ? "watching"
          : "idle"
        : index === 0
          ? "watching"
          : index === 1
            ? "blocked"
            : "idle";
      return {
        id: `v${index + 1}`,
        kind,
        ownerId,
        stream:
          watch !== "watching" || index === 3
            ? null
            : canvasStream(`v${index + 1}`, `${kind} ${index + 1}`, 30 + index * 80),
        isLocal: false,
        watch,
        blockedReason: watch === "blocked" ? "relay_no_plus" : null,
        viewers: [],
        blockedViewers: [],
      };
    },
  );
  const inside = options.phase === "connected" || options.phase === "reconnecting";

  return {
    phase: options.phase,
    fixed: fixedHandle !== null,
    ownerHandle: fixedHandle,
    theme: options.theme ?? "default",
    protected: options.protected ?? false,
    maxVideos: options.protected ? PROTECTED_ROOM_MAX_VIDEOS : null,
    maxOwnVideos: account?.plus ? PLUS_VIDEOS_PER_PERSON : VIDEOS_PER_PERSON,
    maxWatchedVideos: WATCHED_VIDEOS_PER_PERSON,
    watchedCount: inside ? watchedCountOf(videos) : 0,
    relayMeter: null,
    protectedMeter: inside && options.protected ? protectedMeterAt(DEMO_PROTECTED_START_MS, null) : null,
    endReason: null,
    accountNickname: account?.nickname ?? null,
    code,
    link: `${window.location.origin}/${fixedHandle ? `@${fixedHandle}` : `s/${code}`}`,
    occupancy: { participants: inside ? count : count - 1, capacity },
    selfId: inside ? SELF_ID : null,
    isOwner: options.isOwner,
    isModerator: inside && !options.isOwner && (options.moderator ?? false),
    participants: inside ? participants : [],
    videos: inside ? videos : [],
    featuredVideoId: inside ? (videos.find((video) => video.watch === "watching")?.id ?? null) : null,
    chat: inside
      ? Array.from({ length: 14 }, (_, index) => ({
          id: `m${index}`,
          from: `p${(index % (count - 1 || 1)) + 1}`,
          nickname: NAMES[(index % (count - 1 || 1)) + 1] ?? "Pessoa",
          text:
            index === 5
              ? "Mensagem longa para ver a quebra de linha: https://exemplo.com/um-endereco-bem-comprido-que-nao-vira-link <b>nem marcação</b>."
              : `Mensagem de exemplo número ${index + 1}`,
          sentAt: Date.now() - (14 - index) * 60_000,
        }))
      : [],
    reactions: [],
    availableReactions: account ? [...REACTIONS, ...DEMO_PACK_REACTIONS] : [...REACTIONS],
    canSendGold: inside && account !== null,
    gifts: [],
    notice: options.notice,
    micMuted: true,
    handRaised: false,
    localVideoIds: [],
    capabilities: { canShareScreen: !options.mobile, canUseCamera: true },
    preview: null,
  };
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export function createDemoClient(options: DemoOptions): RoomClient {
  return {
    createRoom: () => Promise.resolve({ ok: false, reason: "error" }),
    useRoom(code) {
      const [state, setState] = useState(() => initialState(code, options));

      // Protected room: the owner's balance runs out (faster than the clock), then the grace.
      const meterRunning = state.protectedMeter !== null;
      useEffect(() => {
        if (!meterRunning) return;
        const timer = setInterval(() => {
          setState((current) => {
            const meter = current.protectedMeter;
            if (!meter) return current;
            const remainingMs = meter.remainingMs - 1000 * DEMO_METER_SPEED;
            const graceEndsAt = meter.graceEndsAt ?? Date.now() + PROTECTED_ROOM_GRACE_MS / DEMO_METER_SPEED;
            if (meter.state === "grace" && Date.now() >= graceEndsAt) {
              return { ...current, phase: "ended", endReason: "no_gold", protectedMeter: null };
            }
            return { ...current, protectedMeter: protectedMeterAt(remainingMs, graceEndsAt) };
          });
        }, 1000);
        return () => clearInterval(timer);
      }, [meterRunning]);

      const actions = useMemo<RoomActions>(() => {
        const patch = (change: (current: RoomState) => Partial<RoomState>) =>
          setState((current) => ({ ...current, ...change(current) }));
        const patchVideo = (videoId: string, change: (video: VideoView) => Partial<VideoView>) =>
          patch((current) => {
            const videos = current.videos.map((video) =>
              video.id === videoId ? { ...video, ...change(video) } : video,
            );
            return { videos, watchedCount: watchedCountOf(videos) };
          });
        const patchSelf = (change: Partial<ParticipantView>) =>
          patch((current) => ({
            participants: current.participants.map((participant) =>
              participant.isSelf ? { ...participant, ...change } : participant,
            ),
          }));

        return {
          setRoomTheme(theme) {
            patch(() => ({ theme }));
          },
          async startPreview() {
            await new Promise((resolve) => setTimeout(resolve, 400));
            patch(() => ({ preview: fakePreview() }));
          },
          async join({ nickname }) {
            patch(() => ({ phase: "joining" }));
            await new Promise((resolve) => setTimeout(resolve, 800));
            setState((current) => {
              const joined = initialState(code, { ...options, phase: "connected", notice: null });
              return {
                ...joined,
                participants: joined.participants.map((participant) =>
                  participant.isSelf
                    ? { ...participant, nickname: current.accountNickname ?? nickname }
                    : participant,
                ),
                capabilities: current.capabilities,
              };
            });
          },
          leave() {},
          useThisTab() {},
          sendChat(text) {
            patch((current) => ({
              chat: [
                ...current.chat,
                {
                  id: nextId("m"),
                  from: SELF_ID,
                  nickname:
                    current.participants.find((participant) => participant.isSelf)?.nickname ?? "Você",
                  text,
                  sentAt: Date.now(),
                },
              ],
            }));
          },
          react(reaction) {
            const allowed = options.account ? [...REACTIONS, ...DEMO_PACK_REACTIONS] : [...REACTIONS];
            if (!allowed.includes(reaction)) return;
            const id = nextId("r");
            patch((current) => ({ reactions: [...current.reactions, { id, from: SELF_ID, reaction }] }));
            setTimeout(
              () => patch((current) => ({ reactions: current.reactions.filter((event) => event.id !== id) })),
              3000,
            );
          },
          setHandRaised(raised) {
            patch(() => ({ handRaised: raised }));
            patchSelf({ handRaised: raised });
          },
          async setMicMuted(muted) {
            patch(() => ({ micMuted: muted }));
            patchSelf({ micMuted: muted, speaking: !muted });
          },
          async startVideo(kind) {
            patch((current) => {
              if (current.localVideoIds.length >= current.maxOwnVideos)
                return { notice: { kind: "videoPersonLimit" } };
              if (current.maxVideos !== null && current.videos.length >= current.maxVideos) {
                return { notice: { kind: "videoRoomLimit" } };
              }
              const id = nextId("local");
              // Two others watch; the one on a relayed connection is blocked until this person pays.
              const others = current.participants.filter((participant) => !participant.isSelf);
              const relayed = others.find((participant) => participant.relayed);
              const video: VideoView = {
                id,
                kind,
                ownerId: SELF_ID,
                stream: canvasStream(id, `meu vídeo (${kind})`, 150),
                isLocal: true,
                watch: "local",
                blockedReason: null,
                viewers: others
                  .filter((participant) => !participant.relayed)
                  .slice(0, 2)
                  .map((participant) => participant.id),
                blockedViewers: relayed
                  ? [
                      {
                        participantId: relayed.id,
                        reason: options.account?.plus ? "relay_no_gold" : "relay_no_plus",
                      },
                    ]
                  : [],
              };
              return {
                videos: [...current.videos, video],
                localVideoIds: [...current.localVideoIds, id],
                featuredVideoId: current.featuredVideoId ?? id,
                relayMeter: options.account?.plus
                  ? { pairs: 1, goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR, state: "paying" }
                  : current.relayMeter,
              };
            });
          },
          stopVideo(videoId) {
            patch((current) => {
              const videos = current.videos.filter((video) => video.id !== videoId);
              return {
                videos,
                localVideoIds: current.localVideoIds.filter((id) => id !== videoId),
                featuredVideoId:
                  current.featuredVideoId === videoId ? (videos[0]?.id ?? null) : current.featuredVideoId,
              };
            });
          },
          watchVideo(videoId) {
            patch((current) => {
              if (current.watchedCount >= current.maxWatchedVideos) return { notice: { kind: "watchLimit" } };
              const videos = current.videos.map((video) =>
                video.id === videoId ? { ...video, watch: "requesting" as const } : video,
              );
              return { videos, watchedCount: watchedCountOf(videos) };
            });
            setTimeout(
              () =>
                patchVideo(videoId, (video) =>
                  video.watch === "requesting"
                    ? { watch: "watching", stream: canvasStream(video.id, `${video.kind} ${video.id}`, 300) }
                    : {},
                ),
              700,
            );
          },
          unwatchVideo(videoId) {
            patchVideo(videoId, () => ({ watch: "idle", stream: null, blockedReason: null }));
            patch((current) => ({
              featuredVideoId:
                current.featuredVideoId === videoId
                  ? (current.videos.find((video) => video.watch === "watching" || video.isLocal)?.id ?? null)
                  : current.featuredVideoId,
            }));
          },
          setFeaturedVideo(videoId) {
            patch(() => ({ featuredVideoId: videoId }));
          },
          setModerator(participantId, moderator) {
            patch((current) => ({
              participants: current.participants.map((participant) =>
                participant.id === participantId ? { ...participant, isModerator: moderator } : participant,
              ),
            }));
          },
          moderate(action, participantId) {
            patch((current) => {
              if (action === "mute") {
                return {
                  participants: current.participants.map((participant) =>
                    participant.id === participantId ? { ...participant, micMuted: true } : participant,
                  ),
                };
              }
              const participants = current.participants.filter(
                (participant) => participant.id !== participantId,
              );
              return {
                participants,
                videos: current.videos.filter((video) => video.ownerId !== participantId),
                occupancy: { ...current.occupancy, participants: participants.length },
              };
            });
          },
          async sendGold(participantId, amount) {
            await new Promise((resolve) => setTimeout(resolve, 600));
            if (!Number.isInteger(amount) || amount < 1 || amount > GOLD_GIFT_DAILY_LIMIT) {
              return { ok: false, reason: "error" };
            }
            // Same rule as the server: both with an account, never to oneself.
            const target = ACCOUNTS[Number(participantId.slice(1))];
            if (!options.account || participantId === SELF_ID || !target?.canReceiveGold) {
              return { ok: false, reason: "not_allowed" };
            }
            const id = nextId("g");
            patch((current) => {
              const from = current.participants.find((participant) => participant.isSelf);
              const to = current.participants.find((participant) => participant.id === participantId);
              if (!from || !to) return {};
              const gift = {
                id,
                fromId: from.id,
                fromNickname: from.nickname,
                toId: to.id,
                toNickname: to.nickname,
                amount,
              };
              return { gifts: [...current.gifts, gift] };
            });
            setTimeout(
              () => patch((current) => ({ gifts: current.gifts.filter((gift) => gift.id !== id) })),
              6000,
            );
            return { ok: true };
          },
          async copyLink() {
            patch(() => ({ notice: { kind: "linkCopied" } }));
          },
          dismissNotice() {
            patch(() => ({ notice: null }));
          },
        };
      }, [code]);

      return { state, actions };
    },
  };
}
