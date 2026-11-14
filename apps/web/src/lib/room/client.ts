/**
 * Núcleo do cliente da sala, sem React: guarda o `RoomState`, fala com a API, o WebSocket e a
 * `MediaSession`, e avisa quem assina (`subscribe`/`getSnapshot`, no formato do
 * `useSyncExternalStore`). Tudo o que toca o navegador chega por `RoomDeps`.
 *
 * Ciclo de vida: `retain()` liga (consulta a sala e passa a ouvir a volta da rede); `release()`
 * desliga quando ninguém mais segura o cliente. O desligamento espera uma microtarefa: o StrictMode
 * do React desmonta e remonta na mesma passada, e assim nada é aberto duas vezes.
 */
import {
  CHAT_HISTORY_SIZE,
  FREE_VIDEO_QUALITY,
  RELAY_VIDEO_QUALITY,
  ROOM_MAX_PEOPLE,
  ROOM_PATH_PREFIX,
  type Reaction,
} from "@sualive/config";
import type { DevicePreview, MediaSession, PeerConnectionState, SignalData, VideoKind } from "@sualive/media";
import {
  clientMessageSchema,
  roomCodeSchema,
  serverMessageSchema,
  WS_CLOSE,
  WS_PING_FRAME,
  type ClientMessage,
  type Participant,
  type RoomVideo,
  type ServerMessage,
} from "@sualive/protocol";
import { createRoomApi, type ApiFailure, type RoomApi } from "./api";
import { socketUrl, type RoomDeps, type SocketLike } from "./deps";
import { pickFeaturedVideo } from "./featured";
import { forgetOwnerToken, readOwnerToken } from "./owner-token";
import type {
  JoinOptions,
  ParticipantView,
  RoomActions,
  RoomNotice,
  RoomPhase,
  RoomState,
  VideoView,
} from "./types";

// ---------- Tempos técnicos (não são regras de produto) ----------

/** Intervalo do ping que mantém o WebSocket vivo (ms). */
export const PING_INTERVAL_MS = 25_000;
/** Sem nenhum quadro do servidor por este tempo, a conexão é dada como caída (ms). */
export const SILENCE_TIMEOUT_MS = 60_000;
/** Primeira espera da reconexão; dobra a cada tentativa até o teto (ms). */
export const RECONNECT_BASE_DELAY_MS = 1_000;
export const RECONNECT_MAX_DELAY_MS = 15_000;
/** Quanto esperar a resposta do servidor a um `video.request` (ms). */
export const VIDEO_REQUEST_TIMEOUT_MS = 10_000;
/** Quanto tempo cada reação fica na tela (ms). */
export const REACTION_LIFETIME_MS = 4_000;
/** Reações simultâneas guardadas no estado (as mais antigas saem antes). */
const MAX_REACTIONS = 30;

/** Fases em que a pessoa está fora da sala e pode (tentar) entrar. */
const CAN_JOIN: ReadonlySet<RoomPhase> = new Set(["lobby", "kicked", "error"]);
/** Fases em que a prévia de aparelhos faz sentido. */
const CAN_PREVIEW: ReadonlySet<RoomPhase> = new Set(["loading", "lobby", "kicked", "error"]);

interface PeerMedia {
  connection: PeerConnectionState;
  relayed: boolean;
  audioStream: MediaStream | null;
}

type VideoReply =
  | { type: "granted"; video: RoomVideo }
  | { type: "denied"; reason: "room_limit" | "person_limit" }
  | { type: "lost" };

interface PendingVideo {
  timer: ReturnType<typeof setTimeout>;
  resolve: (reply: VideoReply) => void;
}

/** Cancelar o seletor de tela não é erro: a pessoa só desistiu. */
function isScreenPickerCancel(kind: VideoKind, error: unknown): boolean {
  if (kind !== "screen" || typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "AbortError";
}

/** Tipo de um quadro inválido, para o relato (nunca o conteúdo). */
function frameType(data: unknown): string {
  if (typeof data !== "object" || data === null) return typeof data;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" ? type.slice(0, 40) : "unknown";
}

export class RoomClient {
  readonly actions: RoomActions;

  private state: RoomState;
  private readonly listeners = new Set<() => void>();
  private readonly api: RoomApi;
  private readonly lifetime = new AbortController();

  private refs = 0;
  private started = false;
  private disposed = false;
  private stopResume: (() => void) | null = null;

  // Prévia do lobby
  private preview: DevicePreview | null = null;
  private previewPending: Promise<void> | null = null;
  private previewRequest = 0;

  // Sessão: do join aceito até sair
  private inSession = false;
  private welcomed = false;
  /** Muda a cada `welcome` e a cada saída: invalida o que estava em andamento. */
  private epoch = 0;
  private socket: SocketLike | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;
  private selfId: string | null = null;
  private handRaised = false;

  private media: MediaSession | null = null;
  private mediaOff: Array<() => void> = [];
  private readonly signalHandlers = new Set<(from: string, data: SignalData) => void>();
  private micEnabled = false;
  private micPending: Promise<boolean> | null = null;

  /** Participantes como o servidor manda, na ordem de chegada. */
  private participants = new Map<string, Participant>();
  private readonly peerMedia = new Map<string, PeerMedia>();
  private readonly speaking = new Set<string>();
  /** videoId → stream recebido. */
  private readonly remoteStreams = new Map<string, MediaStream>();
  /** videoId → stream próprio publicado. */
  private readonly localStreams = new Map<string, MediaStream>();
  /** videoId → ordem em que apareceu (para "o mais antigo"). */
  private readonly videoOrder = new Map<string, number>();
  private videoSeq = 0;
  private chosenFeatured: string | null = null;
  private readonly pendingVideos = new Map<string, PendingVideo>();
  private videoRequestInFlight = false;
  /** Vídeos parados enquanto a captura ainda estava em andamento. */
  private readonly cancelledVideos = new Set<string>();
  private joinRequest = 0;
  private readonly reactionTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.api = createRoomApi(deps.fetch);
    this.state = {
      phase: "loading",
      code,
      link: `${deps.origin}${ROOM_PATH_PREFIX}${code}`,
      occupancy: { participants: 0, capacity: ROOM_MAX_PEOPLE },
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
      capabilities: deps.getMediaCapabilities(),
      preview: null,
    };
    this.actions = {
      startPreview: () => this.startPreview(),
      join: (options) => this.join(options),
      leave: () => this.leave(),
      sendChat: (text) => void this.send({ type: "chat.send", text }),
      react: (reaction) => this.react(reaction),
      setHandRaised: (raised) => this.setHandRaised(raised),
      setMicMuted: (muted) => this.setMicMuted(muted),
      startVideo: (kind) => this.startVideo(kind),
      stopVideo: (videoId) => this.stopVideo(videoId),
      setFeaturedVideo: (videoId) => this.setFeaturedVideo(videoId),
      moderate: (action, participantId) => this.moderate(action, participantId),
      copyLink: () => this.copyLink(),
      dismissNotice: () => this.update({ notice: null }),
    };
  }

  // ---------- Assinatura ----------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): RoomState => this.state;

  private update(patch: Partial<RoomState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  private notify(notice: RoomNotice): void {
    this.update({ notice });
  }

  // ---------- Ciclo de vida ----------

  retain(): void {
    if (this.disposed) return;
    this.refs += 1;
    if (this.started) return;
    this.started = true;
    this.stopResume = this.deps.onResume(() => this.onResume());
    void this.load();
  }

  release(): void {
    if (this.refs === 0) return;
    this.refs -= 1;
    if (this.refs > 0) return;
    queueMicrotask(() => {
      if (this.refs === 0) this.dispose();
    });
  }

  /** Solta tudo: WebSocket, mídia, prévia, timers e listeners. Definitivo. */
  dispose(): void {
    if (this.disposed) return;
    this.endSession();
    this.stopPreview();
    this.disposed = true;
    this.lifetime.abort();
    this.stopResume?.();
    this.stopResume = null;
    this.listeners.clear();
  }

  private async load(): Promise<void> {
    if (!roomCodeSchema.safeParse(this.code).success) {
      this.update({ phase: "ended" });
      return;
    }
    const result = await this.api.getRoom(this.code, this.lifetime.signal);
    if (this.disposed || this.state.phase !== "loading") return;
    if (!result.ok) {
      if (result.error === "room_ended" || result.error === "not_found") this.finish("ended");
      else if (result.error !== "aborted") this.update({ phase: "error" });
      return;
    }
    if (result.data.status === "ended") {
      this.finish("ended");
      return;
    }
    this.update({
      phase: "lobby",
      occupancy: { participants: result.data.participants, capacity: result.data.capacity },
    });
  }

  /** Atualiza a lotação mostrada no lobby (ou descobre que a sala acabou). */
  private async refreshOccupancy(): Promise<void> {
    const result = await this.api.getRoom(this.code, this.lifetime.signal);
    if (this.disposed || this.state.phase !== "lobby" || !result.ok) return;
    if (result.data.status === "ended") {
      this.finish("ended");
      return;
    }
    this.update({
      occupancy: { participants: result.data.participants, capacity: result.data.capacity },
    });
  }

  private onResume(): void {
    if (this.disposed) return;
    if (this.state.phase === "reconnecting" && !this.socket) {
      this.clearReconnectTimer();
      this.openSocket();
    } else if (this.state.phase === "lobby") {
      void this.refreshOccupancy();
    }
  }

  // ---------- Prévia ----------

  private startPreview(): Promise<void> {
    if (this.disposed || this.preview || !CAN_PREVIEW.has(this.state.phase)) return Promise.resolve();
    this.previewPending ??= this.openPreview().finally(() => {
      this.previewPending = null;
    });
    return this.previewPending;
  }

  private async openPreview(): Promise<void> {
    const request = ++this.previewRequest;
    let preview: DevicePreview;
    try {
      preview = await this.deps.createDevicePreview();
    } catch {
      if (request === this.previewRequest && !this.disposed) {
        this.notify({ kind: "mediaPermissionDenied", device: "microphone" });
      }
      return;
    }
    if (this.disposed || request !== this.previewRequest || !CAN_PREVIEW.has(this.state.phase)) {
      preview.stop();
      return;
    }
    this.preview = preview;
    this.update({
      preview,
      ...(preview.hasMicrophone
        ? {}
        : { notice: { kind: "mediaPermissionDenied", device: "microphone" } as const }),
    });
  }

  private stopPreview(): void {
    this.previewRequest += 1;
    const preview = this.preview;
    this.preview = null;
    if (!preview) return;
    preview.stop();
    this.update({ preview: null });
  }

  // ---------- Entrar e sair ----------

  private async join({ nickname, turnstileToken }: JoinOptions): Promise<void> {
    if (this.disposed || !CAN_JOIN.has(this.state.phase)) return;
    const request = ++this.joinRequest;
    this.update({ phase: "joining", notice: null });
    const result = await this.api.joinRoom(this.code, { nickname, turnstileToken }, this.lifetime.signal);
    if (this.disposed || request !== this.joinRequest || this.state.phase !== "joining") return;
    if (!result.ok) {
      this.onJoinFailed(result.error);
      return;
    }
    this.stopPreview();
    this.inSession = true;
    this.welcomed = false;
    this.reconnectAttempt = 0;
    this.selfId = result.data.participantId;
    this.openSocket();
  }

  private onJoinFailed(error: ApiFailure): void {
    switch (error) {
      case "room_full":
        return this.finish("full");
      case "banned":
        return this.finish("banned");
      case "room_ended":
      case "not_found":
        return this.finish("ended");
      case "turnstile_failed":
        return this.update({ phase: "lobby", notice: { kind: "turnstileFailed" } });
      case "rate_limited":
        return this.update({ phase: "lobby", notice: { kind: "rateLimited" } });
      case "invalid_request":
      case "unauthorized":
        return this.update({ phase: "lobby" });
      case "aborted":
        return;
      case "internal_error":
      case "network":
      case "invalid_response":
        if (error !== "network") this.deps.report("room: join failed", { error });
        return this.update({ phase: "error" });
    }
  }

  private leave(): void {
    if (this.disposed) return;
    const phase = this.state.phase;
    if (phase !== "joining" && phase !== "connected" && phase !== "reconnecting") return;
    this.backToLobby();
  }

  private backToLobby(): void {
    this.finish("lobby");
    void this.refreshOccupancy();
  }

  /** Encerra a sessão e vai para uma fase fora da sala. */
  private finish(phase: RoomPhase): void {
    this.endSession();
    if (phase === "ended") forgetOwnerToken(this.deps.storage, this.code);
    if (phase !== "lobby") this.stopPreview();
    this.update({
      phase,
      selfId: null,
      isOwner: false,
      participants: [],
      videos: [],
      featuredVideoId: null,
      chat: [],
      reactions: [],
      micMuted: true,
      handRaised: false,
      localVideoIds: [],
    });
  }

  /** Fecha WebSocket, mídia e timers da sessão e esquece o estado da sala. */
  private endSession(): void {
    this.inSession = false;
    this.welcomed = false;
    this.epoch += 1;
    this.joinRequest += 1;
    this.cancelledVideos.clear();
    this.clearReconnectTimer();
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.closeMedia();
    for (const [requestId, pending] of this.pendingVideos) {
      clearTimeout(pending.timer);
      this.pendingVideos.delete(requestId);
      pending.resolve({ type: "lost" });
    }
    for (const timer of this.reactionTimers) clearTimeout(timer);
    this.reactionTimers.clear();
    this.participants = new Map();
    this.peerMedia.clear();
    this.speaking.clear();
    this.remoteStreams.clear();
    this.localStreams.clear();
    this.videoOrder.clear();
    this.chosenFeatured = null;
    this.selfId = null;
    this.handRaised = false;
  }

  // ---------- WebSocket ----------

  private openSocket(): void {
    const url = socketUrl(this.deps.origin, `/api/rooms/${encodeURIComponent(this.code)}/ws`);
    const socket: SocketLike = this.deps.createSocket(url, {
      onOpen: () => this.onSocketOpen(socket),
      onMessage: (data) => this.onSocketMessage(socket, data),
      onClose: (code) => this.onSocketClose(socket, code),
    });
    this.socket = socket;
  }

  private onSocketOpen(socket: SocketLike): void {
    if (this.socket !== socket) return;
    this.lastFrameAt = Date.now();
    const ownerToken = readOwnerToken(this.deps.storage, this.code);
    this.send(ownerToken ? { type: "hello", ownerToken } : { type: "hello" });
    this.startPing();
  }

  private onSocketMessage(socket: SocketLike, raw: unknown): void {
    if (this.socket !== socket) return;
    this.lastFrameAt = Date.now();
    let data: unknown;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : undefined;
    } catch {
      data = undefined;
    }
    const parsed = serverMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.deps.report("room: invalid server frame", { type: frameType(data) });
      return;
    }
    this.handle(parsed.data);
  }

  private onSocketClose(socket: SocketLike, code: number): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.stopPing();
    switch (code) {
      case WS_CLOSE.kicked:
        return this.finish("kicked");
      case WS_CLOSE.banned:
        return this.finish("banned");
      case WS_CLOSE.roomEnded:
        return this.finish("ended");
      case WS_CLOSE.roomFull:
        return this.finish("full");
      case WS_CLOSE.replaced:
        return this.finish("error");
      case WS_CLOSE.unauthorized:
        return this.backToLobby();
      default:
        if (this.inSession) this.scheduleReconnect();
    }
  }

  /** Queda não intencional: tenta de novo com espera crescente, sem novo join. */
  private scheduleReconnect(): void {
    this.welcomed = false;
    for (const [requestId, pending] of this.pendingVideos) {
      clearTimeout(pending.timer);
      this.pendingVideos.delete(requestId);
      pending.resolve({ type: "lost" });
    }
    if (this.state.phase !== "reconnecting") this.update({ phase: "reconnecting" });
    this.clearReconnectTimer();
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.inSession && !this.socket) this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      const socket = this.socket;
      if (!socket) return;
      if (Date.now() - this.lastFrameAt > SILENCE_TIMEOUT_MS) {
        // Conexão "meio aberta" (rede trocou sem fechar): derruba e reconecta.
        this.socket = null;
        this.stopPing();
        socket.close();
        if (this.inSession) this.scheduleReconnect();
        return;
      }
      if (socket.isOpen()) {
        try {
          socket.send(WS_PING_FRAME);
        } catch {
          // fechando: o onClose cuida
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Valida e envia. `false` se a mensagem não passa no esquema ou o WebSocket não está aberto. */
  private send(message: ClientMessage): boolean {
    const socket = this.socket;
    if (!socket?.isOpen()) return false;
    const parsed = clientMessageSchema.safeParse(message);
    if (!parsed.success) return false;
    try {
      socket.send(JSON.stringify(parsed.data));
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Mensagens do servidor ----------

  private handle(message: ServerMessage): void {
    if (message.type === "welcome") return this.onWelcome(message);
    if (message.type === "removed") return this.finish(message.reason);
    if (message.type === "room.ended") return this.finish("ended");
    if (!this.welcomed) return;
    switch (message.type) {
      case "participant.joined":
      case "participant.updated":
        return this.onParticipant(message.participant);
      case "participant.left":
        return this.onParticipantLeft(message.id);
      case "chat.message": {
        const chat = [...this.state.chat, message.message].slice(-CHAT_HISTORY_SIZE);
        return this.update({ chat });
      }
      case "reaction":
        return this.addReaction(message.from, message.reaction);
      case "video.granted":
        return this.onVideoReply(message.requestId, { type: "granted", video: message.video });
      case "video.denied":
        return this.onVideoReply(message.requestId, { type: "denied", reason: message.reason });
      case "signal":
        for (const handler of [...this.signalHandlers]) handler(message.from, message.data);
        return;
      case "force.muted":
        return this.onForceMuted();
      case "error":
        if (message.code === "rate_limited") this.notify({ kind: "chatRateLimited" });
        return;
      case "pong":
        return;
    }
  }

  private onWelcome(message: Extract<ServerMessage, { type: "welcome" }>): void {
    if (!this.inSession) return;
    const reconnecting = this.media !== null;
    if (this.media && this.selfId !== message.self) this.closeMedia();
    this.welcomed = true;
    this.epoch += 1;
    this.reconnectAttempt = 0;
    this.selfId = message.self;
    this.participants = new Map(message.participants.map((p) => [p.id, p]));
    for (const id of [...this.peerMedia.keys()]) {
      if (!this.participants.has(id)) this.peerMedia.delete(id);
    }
    for (const id of [...this.speaking]) {
      if (!this.participants.has(id)) this.speaking.delete(id);
    }
    const self = this.participants.get(message.self);
    this.handRaised = self?.handRaised ?? false;

    // Vídeos que o servidor liberou na queda: param aqui também.
    const granted = new Set(self?.videos.map((video) => video.id) ?? []);
    for (const videoId of [...this.localStreams.keys()]) {
      if (granted.has(videoId)) continue;
      this.media?.unpublishVideo(videoId);
      this.localStreams.delete(videoId);
    }

    if (!this.media) {
      this.createMedia(message.self);
    } else if (reconnecting) {
      this.media.reconnect();
    }
    this.syncPeers();
    // O servidor recomeça todo mundo mudo; se o microfone está aberto, a lista precisa saber.
    if (this.micEnabled && !this.state.micMuted) this.send({ type: "mic.set", muted: false });
    this.rebuild({ phase: "connected", chat: message.chat.slice(-CHAT_HISTORY_SIZE) });
  }

  private onParticipant(participant: Participant): void {
    const isNew = !this.participants.has(participant.id);
    this.participants.set(participant.id, participant);
    if (participant.id === this.selfId) this.handRaised = participant.handRaised;
    if (isNew) this.syncPeers();
    this.rebuild();
  }

  private onParticipantLeft(id: string): void {
    if (!this.participants.delete(id)) return;
    this.peerMedia.delete(id);
    this.speaking.delete(id);
    this.syncPeers();
    this.rebuild();
  }

  private addReaction(from: string, reaction: Reaction): void {
    const event = { id: this.deps.randomId(), from, reaction };
    const timer = setTimeout(() => {
      this.reactionTimers.delete(timer);
      this.update({ reactions: this.state.reactions.filter((r) => r.id !== event.id) });
    }, REACTION_LIFETIME_MS);
    this.reactionTimers.add(timer);
    this.update({ reactions: [...this.state.reactions, event].slice(-MAX_REACTIONS) });
  }

  private onForceMuted(): void {
    this.media?.setMicrophoneMuted(true);
    this.speaking.delete(this.selfId ?? "");
    this.update({ micMuted: true, notice: { kind: "mutedByOwner" } });
    this.rebuild();
  }

  // ---------- Mídia ----------

  private createMedia(selfId: string): void {
    const media = this.deps.createMediaSession({
      selfId,
      transport: {
        send: (to, data) => {
          this.send({ type: "signal", to, data });
        },
        subscribe: (handler) => {
          this.signalHandlers.add(handler);
          return () => {
            this.signalHandlers.delete(handler);
          };
        },
      },
      getIceServers: async () => {
        const result = await this.api.getIceServers(this.code, this.lifetime.signal);
        if (!result.ok) throw new Error(`ice: ${result.error}`);
        return result.data.iceServers;
      },
      quality: FREE_VIDEO_QUALITY,
      relayQuality: RELAY_VIDEO_QUALITY,
    });
    this.media = media;
    this.mediaOff = [
      media.on("peer", (status) => {
        const current = this.peerMediaOf(status.peerId);
        this.peerMedia.set(status.peerId, {
          ...current,
          connection: status.state,
          relayed: status.relayed,
        });
        this.rebuild();
      }),
      media.on("remoteAudio", (peerId, stream) => {
        this.peerMedia.set(peerId, { ...this.peerMediaOf(peerId), audioStream: stream });
        this.rebuild();
      }),
      media.on("remoteVideoAdded", (video) => {
        this.remoteStreams.set(video.videoId, video.stream);
        this.rebuild();
      }),
      media.on("remoteVideoRemoved", (_peerId, videoId) => {
        if (this.remoteStreams.delete(videoId)) this.rebuild();
      }),
      media.on("speaking", (peerId, speaking) => {
        if (speaking) this.speaking.add(peerId);
        else this.speaking.delete(peerId);
        this.rebuild();
      }),
      media.on("localVideoEnded", (videoId) => this.stopVideo(videoId)),
    ];
    this.micEnabled = false;
    this.update({ micMuted: true });
    void this.enableMicrophone();
  }

  private peerMediaOf(peerId: string): PeerMedia {
    return this.peerMedia.get(peerId) ?? { connection: "connecting", relayed: false, audioStream: null };
  }

  /** Liga o microfone (mudo). A negação vira aviso; a pessoa segue na sala só ouvindo. */
  private enableMicrophone(): Promise<boolean> {
    const media = this.media;
    if (!media) return Promise.resolve(false);
    if (this.micEnabled) return Promise.resolve(true);
    this.micPending ??= media
      .enableMicrophone()
      .then(
        () => {
          if (this.media !== media) return false;
          this.micEnabled = true;
          media.setMicrophoneMuted(this.state.micMuted);
          return true;
        },
        () => {
          if (this.media === media) {
            this.notify({ kind: "mediaPermissionDenied", device: "microphone" });
          }
          return false;
        },
      )
      .finally(() => {
        if (this.media === media) this.micPending = null;
      });
    return this.micPending;
  }

  private closeMedia(): void {
    for (const off of this.mediaOff) off();
    this.mediaOff = [];
    this.media?.close();
    this.media = null;
    this.signalHandlers.clear();
    this.micEnabled = false;
    this.micPending = null;
  }

  private syncPeers(): void {
    this.media?.setPeers([...this.participants.keys()].filter((id) => id !== this.selfId));
  }

  // ---------- Ações dentro da sala ----------

  private isConnected(): boolean {
    return !this.disposed && this.welcomed && this.state.phase === "connected";
  }

  private react(reaction: Reaction): void {
    this.send({ type: "reaction.send", reaction });
  }

  private setHandRaised(raised: boolean): void {
    if (!this.isConnected()) return;
    if (this.send({ type: "hand.set", raised })) {
      this.handRaised = raised;
      this.update({ handRaised: raised });
      this.rebuild();
    }
  }

  private async setMicMuted(muted: boolean): Promise<void> {
    const media = this.media;
    if (!media || !this.isConnected()) return;
    if (!muted && !(await this.enableMicrophone())) return;
    if (this.media !== media) return;
    media.setMicrophoneMuted(muted);
    if (muted) this.speaking.delete(this.selfId ?? "");
    this.update({ micMuted: muted });
    this.send({ type: "mic.set", muted });
    this.rebuild();
  }

  private async startVideo(kind: VideoKind): Promise<void> {
    if (!this.isConnected() || this.videoRequestInFlight) return;
    if (kind === "screen" && !this.state.capabilities.canShareScreen) return;
    this.videoRequestInFlight = true;
    try {
      await this.requestAndPublish(kind);
    } finally {
      this.videoRequestInFlight = false;
    }
  }

  private async requestAndPublish(kind: VideoKind): Promise<void> {
    const requestId = this.deps.randomId();
    const reply = await new Promise<VideoReply>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingVideos.delete(requestId);
        resolve({ type: "lost" });
      }, VIDEO_REQUEST_TIMEOUT_MS);
      this.pendingVideos.set(requestId, { timer, resolve });
      if (!this.send({ type: "video.request", requestId, kind })) {
        clearTimeout(timer);
        this.pendingVideos.delete(requestId);
        resolve({ type: "lost" });
      }
    });
    if (reply.type === "lost") return;
    if (reply.type === "denied") {
      this.notify({ kind: reply.reason === "room_limit" ? "videoRoomLimit" : "videoPersonLimit" });
      return;
    }

    const { video } = reply;
    const media = this.media;
    const epoch = this.epoch;
    if (!media) {
      this.send({ type: "video.stop", videoId: video.id });
      return;
    }
    try {
      const local = await media.publishVideo(video.id, video.kind);
      if (this.media !== media) return; // a sessão acabou; a mídia já foi fechada
      if (this.epoch !== epoch || this.cancelledVideos.delete(video.id)) {
        // Reconectou no meio (o servidor já liberou o vídeo) ou a pessoa parou antes de começar.
        media.unpublishVideo(video.id);
        return;
      }
      this.localStreams.set(video.id, local.stream);
      this.rebuild();
    } catch (error) {
      if (this.media !== media) return;
      if (this.cancelledVideos.delete(video.id)) return; // já devolvido por stopVideo
      if (this.epoch === epoch) this.send({ type: "video.stop", videoId: video.id });
      if (!isScreenPickerCancel(kind, error)) {
        this.notify({ kind: "mediaPermissionDenied", device: kind });
      }
    }
  }

  private onVideoReply(requestId: string, reply: VideoReply): void {
    const pending = this.pendingVideos.get(requestId);
    if (!pending) {
      // Autorização que chegou depois do prazo: ninguém espera, devolve.
      if (reply.type === "granted") this.send({ type: "video.stop", videoId: reply.video.id });
      return;
    }
    clearTimeout(pending.timer);
    this.pendingVideos.delete(requestId);
    pending.resolve(reply);
  }

  private stopVideo(videoId: string): void {
    const selfId = this.selfId;
    const self = selfId ? this.participants.get(selfId) : undefined;
    const granted = self?.videos.some((video) => video.id === videoId) ?? false;
    if (!granted && !this.localStreams.has(videoId)) return;
    this.media?.unpublishVideo(videoId);
    if (!this.localStreams.delete(videoId)) this.cancelledVideos.add(videoId);
    if (self && granted) {
      this.participants.set(self.id, {
        ...self,
        videos: self.videos.filter((video) => video.id !== videoId),
      });
    }
    this.send({ type: "video.stop", videoId });
    this.rebuild();
  }

  private setFeaturedVideo(videoId: string): void {
    if (!this.state.videos.some((video) => video.id === videoId)) return;
    this.chosenFeatured = videoId;
    this.rebuild();
  }

  private moderate(action: "mute" | "kick" | "ban", participantId: string): void {
    if (!this.isConnected() || !this.state.isOwner || participantId === this.selfId) return;
    this.send({ type: "moderate", action, target: participantId });
  }

  private async copyLink(): Promise<void> {
    try {
      await this.deps.writeClipboard(this.state.link);
    } catch {
      return; // sem permissão de área de transferência: as telas mostram o link para copiar à mão
    }
    this.notify({ kind: "linkCopied" });
  }

  // ---------- Estado derivado ----------

  /** Recalcula pessoas, vídeos e destaque a partir do que veio do servidor e da mídia. */
  private rebuild(extra: Partial<RoomState> = {}): void {
    if (!this.welcomed) return;
    const selfId = this.selfId;
    const participants: ParticipantView[] = [];
    const videos: VideoView[] = [];
    for (const p of this.participants.values()) {
      const isSelf = p.id === selfId;
      const media = this.peerMediaOf(p.id);
      participants.push({
        id: p.id,
        nickname: p.nickname,
        isSelf,
        isOwner: p.isOwner,
        micMuted: isSelf ? this.state.micMuted : p.micMuted,
        handRaised: isSelf ? this.handRaised : p.handRaised,
        speaking: this.speaking.has(p.id),
        connection: isSelf ? "connected" : media.connection,
        relayed: isSelf ? false : media.relayed,
        audioStream: isSelf ? null : media.audioStream,
      });
      for (const video of p.videos) {
        if (!this.videoOrder.has(video.id)) this.videoOrder.set(video.id, this.videoSeq++);
        videos.push({
          id: video.id,
          kind: video.kind,
          ownerId: p.id,
          stream: (isSelf ? this.localStreams : this.remoteStreams).get(video.id) ?? null,
          isLocal: isSelf,
        });
      }
    }
    videos.sort((a, b) => (this.videoOrder.get(a.id) ?? 0) - (this.videoOrder.get(b.id) ?? 0));
    const present = new Set(videos.map((video) => video.id));
    for (const id of [...this.videoOrder.keys()]) if (!present.has(id)) this.videoOrder.delete(id);
    if (this.chosenFeatured && !present.has(this.chosenFeatured)) this.chosenFeatured = null;

    const self = selfId ? this.participants.get(selfId) : undefined;
    this.update({
      selfId,
      isOwner: self?.isOwner ?? false,
      handRaised: this.handRaised,
      participants,
      videos,
      featuredVideoId: pickFeaturedVideo(videos, this.chosenFeatured),
      localVideoIds: videos.filter((video) => video.isLocal).map((video) => video.id),
      occupancy: { participants: participants.length, capacity: this.state.occupancy.capacity },
      ...extra,
    });
  }
}
