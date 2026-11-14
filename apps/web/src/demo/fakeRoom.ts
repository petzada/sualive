/**
 * Fake room client for the dev-only demo (`/demo`). Nothing here talks to a server or to WebRTC:
 * videos are animated canvases and every action just edits local state.
 */
import { PLUS_VIDEOS_PER_PERSON, ROOM_MAX_PEOPLE, ROOM_MAX_VIDEOS, VIDEOS_PER_PERSON } from "@sualive/config";
import type { RoomTheme } from "@sualive/config";
import type { DevicePreview, VideoKind } from "@sualive/media";
import { useMemo, useState } from "react";
import type { RoomClient } from "../components/room/RoomClient";
import type { ParticipantView, RoomActions, RoomNotice, RoomPhase, RoomState, VideoView } from "../lib/room";
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
}

const NAMES = ["Marina", "Caio", "Beatriz Albuquerque Lima", "Téo", "Jô", "Rafa"];
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

/** Who has an account among the others, to see pictures, handles and badges beside guests. */
const ACCOUNTS: Record<number, Pick<ParticipantView, "handle" | "avatarUrl" | "badges">> = {
  1: { handle: "caio", avatarUrl: demoAvatar(20), badges: ["plus", "early_supporter"] },
  2: { handle: "bia_albuquerque", avatarUrl: null, badges: ["plus"] },
  // Broken on purpose: the picture fails and the initial takes its place.
  4: { handle: "jo", avatarUrl: "/demo-missing-avatar.png", badges: [] },
};

function initialState(code: string, options: DemoOptions): RoomState {
  const count = Math.min(Math.max(options.people, 1), ROOM_MAX_PEOPLE);
  const account = options.account ?? null;
  const fixedHandle = code.startsWith("@") ? code.slice(1) : (options.fixedHandle ?? null);
  const self: Pick<ParticipantView, "handle" | "avatarUrl" | "badges"> = account
    ? { handle: account.handle, avatarUrl: account.avatarUrl, badges: account.plus ? ["plus"] : [] }
    : { handle: null, avatarUrl: null, badges: [] };
  const participants: ParticipantView[] = Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    ...(index === 0 ? self : (ACCOUNTS[index] ?? { handle: null, avatarUrl: null, badges: [] })),
    nickname: index === 0 && account ? account.nickname : (NAMES[index] ?? `Pessoa ${index + 1}`),
    isSelf: index === 0,
    isOwner: options.isOwner ? index === 0 : index === 1,
    micMuted: index % 2 === 0,
    handRaised: index === 3,
    speaking: index === 1,
    connection: index === 4 ? "reconnecting" : "connected",
    relayed: index === 2,
    audioStream: null,
  }));
  const videos: VideoView[] = Array.from(
    { length: Math.min(options.videos, ROOM_MAX_VIDEOS, Math.max(count - 1, 0)) },
    (_, index) => {
      const kind: VideoKind = index === 0 ? "screen" : "camera";
      const ownerId = `p${index + 1}`;
      return {
        id: `v${index + 1}`,
        kind,
        ownerId,
        stream: index === 3 ? null : canvasStream(`v${index + 1}`, `${kind} ${index + 1}`, 30 + index * 80),
        isLocal: false,
      };
    },
  );
  const inside = options.phase === "connected" || options.phase === "reconnecting";

  return {
    phase: options.phase,
    fixed: fixedHandle !== null,
    ownerHandle: fixedHandle,
    theme: options.theme ?? "default",
    maxOwnVideos: account?.plus ? PLUS_VIDEOS_PER_PERSON : VIDEOS_PER_PERSON,
    accountNickname: account?.nickname ?? null,
    code,
    link: `${window.location.origin}/${fixedHandle ? `@${fixedHandle}` : `s/${code}`}`,
    occupancy: { participants: inside ? count : count - 1, capacity: ROOM_MAX_PEOPLE },
    selfId: inside ? SELF_ID : null,
    isOwner: options.isOwner,
    participants: inside ? participants : [],
    videos: inside ? videos : [],
    featuredVideoId: inside ? (videos[0]?.id ?? null) : null,
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

      const actions = useMemo<RoomActions>(() => {
        const patch = (change: (current: RoomState) => Partial<RoomState>) =>
          setState((current) => ({ ...current, ...change(current) }));
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
              if (current.videos.length >= ROOM_MAX_VIDEOS) return { notice: { kind: "videoRoomLimit" } };
              const id = nextId("local");
              const video: VideoView = {
                id,
                kind,
                ownerId: SELF_ID,
                stream: canvasStream(id, `meu vídeo (${kind})`, 150),
                isLocal: true,
              };
              return {
                videos: [...current.videos, video],
                localVideoIds: [...current.localVideoIds, id],
                featuredVideoId: current.featuredVideoId ?? id,
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
          setFeaturedVideo(videoId) {
            patch(() => ({ featuredVideoId: videoId }));
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
