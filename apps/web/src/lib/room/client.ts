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
  AUTO_WATCH_MAX_PEOPLE,
  CHAT_HISTORY_SIZE,
  FIXED_ROOM_PATH_PREFIX,
  FREE_VIDEO_QUALITY,
  MIC_RATE_WINDOW_MS,
  PLUS_VIDEO_QUALITY,
  REACTIONS,
  RELAY_SCREEN_AUDIO_MAX_BITRATE,
  RELAY_VIDEO_QUALITY,
  ROOM_MAX_PEOPLE,
  VIDEOS_PER_PERSON,
  ROOM_PATH_PREFIX,
  WATCHED_VIDEOS_PER_PERSON,
  type RoomTheme,
} from "@sualive/config";
import type { DevicePreview, MediaSession, PeerConnectionState, SignalData, VideoKind } from "@sualive/media";
import {
  clientMessageSchema,
  giftAmountSchema,
  roomKeySchema,
  serverMessageSchema,
  WS_CLOSE,
  WS_PING_FRAME,
  type ClientMessage,
  type JoinRoomRequest,
  type MeUser,
  type Participant,
  type RoomInfoResponse,
  type RoomSettings,
  type RoomVideo,
  type ServerMessage,
} from "@sualive/protocol";
import { createRoomApi, roomPath, type ApiFailure, type RoomApi } from "./api";
import { socketUrl, type RoomDeps, type SocketLike } from "./deps";
import { pickFeaturedVideo } from "./featured";
import { forgetOwnerToken, readOwnerToken } from "./owner-token";
import type {
  GiftEvent,
  JoinOptions,
  ParticipantView,
  RoomActions,
  RoomEndReason,
  RoomNotice,
  RoomPhase,
  RoomState,
  SendGoldResult,
  VideoBlockedReason,
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
/** Quanto esperar a resposta do servidor a um `gift.send` (ms). */
export const GIFT_REQUEST_TIMEOUT_MS = 10_000;
/** Quanto tempo cada aviso de ouro enviado fica na tela (ms). */
export const GIFT_LIFETIME_MS = 6_000;
/** Avisos de ouro simultâneos guardados no estado (os mais antigos saem antes). */
const MAX_GIFTS = 10;

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

interface PendingGift {
  requestId: string;
  timer: ReturnType<typeof setTimeout>;
  resolve: (result: SendGoldResult) => void;
}

/** Pedido de assistir um vídeo de outra pessoa, como o servidor respondeu. */
interface WatchEntry {
  state: "requesting" | "watching" | "blocked";
  reason: VideoBlockedReason | null;
  /** Pedido pela pessoa (`watchVideo`), não pela abertura automática: só ele vira aviso de limite. */
  manual: boolean;
}

/**
 * Última ação com limite de frequência enviada. O `error` `rate_limited` não diz a que se refere;
 * o servidor responde em ordem, então vale a mais recente.
 */
type LimitedAction =
  | { kind: "chat" }
  | { kind: "reaction" }
  | { kind: "hand"; previous: boolean }
  | { kind: "mic"; muted: boolean };

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

/** Só os próprios e os que a pessoa assiste vão para o destaque. */
function canFeature(video: VideoView): boolean {
  return video.watch === "local" || video.watch === "watching";
}

/** `@nome` é a chave da sala de link fixo; o resto é código de sala comum. */
function isFixedKey(key: string): boolean {
  return key.startsWith("@");
}

/** Endereço da sala para copiar: `/s/<código>` ou `/@<nome>`. */
export function roomLink(origin: string, key: string): string {
  return isFixedKey(key)
    ? `${origin}${FIXED_ROOM_PATH_PREFIX}${key.slice(1)}`
    : `${origin}${ROOM_PATH_PREFIX}${key}`;
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
  private stopAccount: (() => void) | null = null;
  /** Só vale a leitura mais nova da conta. */
  private accountRead = 0;
  /** Conta com que a pessoa entrou (decide a qualidade do que ela transmite). */
  private sessionAccount: MeUser | null = null;

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
  /** O envio de ouro no ar (um por vez). */
  private pendingGift: PendingGift | null = null;
  private readonly giftTimers = new Set<ReturnType<typeof setTimeout>>();

  // Sala (do `welcome` e de `room.updated`; a lotação também da consulta do lobby)
  private capacity: number = ROOM_MAX_PEOPLE;
  private roomProtected = false;
  /** `GET .../ice` pediu só retransmissão numa sessão que nasceu sem: a próxima nasce com. */
  private relayOnlyFromIce = false;
  /** Quantos vídeos esta pessoa assiste ao mesmo tempo (do servidor). */
  private maxWatched: number = WATCHED_VIDEOS_PER_PERSON;
  /** Esta pessoa pode ter o próprio vídeo retransmitido (é Plus): decide o motivo dos bloqueios. */
  private relayVideo = false;

  // Vídeo sob demanda
  /** videoId (de outra pessoa) → pedido de assistir em andamento ou aceito. */
  private readonly watching = new Map<string, WatchEntry>();
  /** Vídeos que a pessoa parou de assistir de propósito: não reabrem sozinhos. */
  private readonly optedOut = new Set<string>();
  /** Vídeos de outras pessoas já conhecidos (o que não está aqui é novo). */
  private readonly knownVideos = new Set<string>();
  /** videoId (próprio) → quem recebe e quem está bloqueado, como o servidor mandou. */
  private readonly localViewers = new Map<string, { viewers: string[]; blocked: string[] }>();
  /** peerId → último `relayed` enviado ao servidor (sem entrada = `false`). */
  private readonly sentRelay = new Map<string, boolean>();

  // Limites de frequência
  private lastLimited: LimitedAction | null = null;
  private micResendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
  ) {
    this.api = createRoomApi(deps.fetch);
    this.state = {
      phase: "loading",
      code,
      link: roomLink(deps.origin, code),
      occupancy: { participants: 0, capacity: ROOM_MAX_PEOPLE },
      // Até a consulta da sala (e depois o `welcome`) dizer o contrário.
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
      capabilities: deps.getMediaCapabilities(),
      preview: null,
    };
    this.actions = {
      startPreview: () => this.startPreview(),
      setRoomTheme: (theme) => this.setRoomTheme(theme),
      join: (options) => this.join(options),
      leave: () => this.leave(),
      useThisTab: () => void this.useThisTab(),
      sendChat: (text) => this.sendChat(text),
      react: (reaction) => this.react(reaction),
      setHandRaised: (raised) => this.setHandRaised(raised),
      setMicMuted: (muted) => this.setMicMuted(muted),
      startVideo: (kind) => this.startVideo(kind),
      stopVideo: (videoId) => this.stopVideo(videoId),
      watchVideo: (videoId) => this.watchVideo(videoId),
      unwatchVideo: (videoId) => this.unwatchVideo(videoId),
      setFeaturedVideo: (videoId) => this.setFeaturedVideo(videoId),
      moderate: (action, participantId) => this.moderate(action, participantId),
      setModerator: (participantId, moderator) => this.setModerator(participantId, moderator),
      sendGold: (participantId, amount) => this.sendGold(participantId, amount),
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
    this.stopAccount = this.deps.account.subscribe(() => void this.syncAccount());
    void this.syncAccount();
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
    this.stopAccount?.();
    this.stopAccount = null;
    this.listeners.clear();
  }

  /** Lê a conta logada e mostra o apelido do perfil (o lobby não pede apelido a quem tem conta). */
  private async syncAccount(): Promise<MeUser | null> {
    const read = ++this.accountRead;
    let account: MeUser | null;
    try {
      account = await this.deps.account.current();
    } catch {
      account = null;
    }
    if (read === this.accountRead && !this.disposed) {
      const accountNickname = account?.nickname ?? null;
      if (accountNickname !== this.state.accountNickname) this.update({ accountNickname });
    }
    return account;
  }

  private async load(): Promise<void> {
    if (!roomKeySchema.safeParse(this.code).success) {
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
    this.update({ phase: "lobby", ...this.fromInfo(result.data) });
  }

  /**
   * `GET /api/rooms/:key`: lotação, sala fixa (o @nome do dono é a própria chave) e protegida.
   */
  private fromInfo(
    info: RoomInfoResponse,
  ): Pick<RoomState, "occupancy" | "fixed" | "ownerHandle" | "protected"> {
    this.capacity = info.capacity;
    return {
      occupancy: { participants: info.participants, capacity: info.capacity },
      fixed: info.fixed,
      ownerHandle: info.fixed && isFixedKey(this.code) ? this.code.slice(1) : null,
      protected: info.protected,
    };
  }

  private applyRoomSettings(
    room: RoomSettings,
  ): Pick<RoomState, "fixed" | "ownerHandle" | "theme" | "protected" | "maxVideos"> {
    this.capacity = room.capacity;
    this.roomProtected = room.protected;
    return {
      fixed: room.fixed,
      ownerHandle: room.ownerHandle,
      theme: room.theme,
      protected: room.protected,
      maxVideos: room.maxVideos,
    };
  }

  /** Atualiza a lotação mostrada no lobby (ou descobre que a sala acabou). */
  private async refreshOccupancy(): Promise<void> {
    const result = await this.api.getRoom(this.code, this.lifetime.signal);
    if (this.disposed || this.state.phase !== "lobby" || !result.ok) return;
    if (result.data.status === "ended") {
      this.finish("ended");
      return;
    }
    this.update(this.fromInfo(result.data));
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
    // Quem está logado entra com o apelido do perfil: o servidor o tira da conta.
    const account = await this.syncAccount();
    if (this.disposed || request !== this.joinRequest || this.state.phase !== "joining") return;
    const body: JoinRoomRequest = account ? { turnstileToken } : { nickname, turnstileToken };
    const result = await this.api.joinRoom(this.code, body, this.lifetime.signal);
    if (this.disposed || request !== this.joinRequest || this.state.phase !== "joining") return;
    if (!result.ok) {
      this.onJoinFailed(result.error);
      return;
    }
    this.sessionAccount = account;
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
        return this.update({ phase: "lobby" });
      case "unauthorized":
      case "onboarding_required":
        // A conta mudou (sessão perdida) ou falta o primeiro acesso: volta ao lobby e atualiza a
        // conta, para a tela (que lê `useAccount`) levar ao primeiro acesso ou pedir o apelido.
        void this.deps.account
          .refresh()
          .catch(() => undefined)
          .then(() => this.syncAccount());
        return this.update({ phase: "lobby" });
      case "aborted":
        return;
      case "network":
        return this.update({ phase: "error" });
      default:
        this.deps.report("room: join failed", { error });
        return this.update({ phase: "error" });
    }
  }

  private leave(): void {
    if (this.disposed) return;
    const phase = this.state.phase;
    if (phase !== "joining" && phase !== "connected" && phase !== "reconnecting") return;
    this.backToLobby();
  }

  /**
   * Aba derrubada por outra da mesma pessoa: abre a conexão de novo, sem novo join (a admissão na
   * sala continua valendo), e o servidor derruba a outra aba. Se a admissão não vale mais, o
   * fechamento `unauthorized` leva ao lobby.
   */
  private async useThisTab(): Promise<void> {
    const phase: RoomPhase = this.state.phase;
    if (this.disposed || phase !== "replaced") return;
    const request = ++this.joinRequest;
    this.update({ phase: "joining", notice: null });
    const account = await this.syncAccount();
    if (this.disposed || request !== this.joinRequest || this.state.phase !== "joining") return;
    this.sessionAccount = account;
    this.inSession = true;
    this.welcomed = false;
    this.reconnectAttempt = 0;
    this.openSocket();
  }

  private backToLobby(): void {
    this.finish("lobby");
    void this.refreshOccupancy();
  }

  /** Encerra a sessão e vai para uma fase fora da sala. */
  private finish(phase: RoomPhase, endReason: RoomEndReason | null = null): void {
    this.endSession();
    if (phase === "ended") forgetOwnerToken(this.deps.storage, this.code);
    if (phase !== "lobby") this.stopPreview();
    this.update({
      phase,
      endReason: phase === "ended" ? endReason : null,
      selfId: null,
      isOwner: false,
      isModerator: false,
      watchedCount: 0,
      relayMeter: null,
      protectedMeter: null,
      participants: [],
      videos: [],
      featuredVideoId: null,
      chat: [],
      reactions: [],
      gifts: [],
      canSendGold: false,
      availableReactions: [...REACTIONS],
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
    this.resolveGift({ ok: false, reason: "lost" });
    for (const timer of this.reactionTimers) clearTimeout(timer);
    this.reactionTimers.clear();
    for (const timer of this.giftTimers) clearTimeout(timer);
    this.giftTimers.clear();
    this.participants = new Map();
    this.peerMedia.clear();
    this.speaking.clear();
    this.remoteStreams.clear();
    this.localStreams.clear();
    this.videoOrder.clear();
    this.chosenFeatured = null;
    this.watching.clear();
    this.optedOut.clear();
    this.knownVideos.clear();
    this.localViewers.clear();
    this.sentRelay.clear();
    this.relayOnlyFromIce = false;
    this.lastLimited = null;
    this.clearMicResend();
    this.selfId = null;
    this.handRaised = false;
    this.sessionAccount = null;
  }

  // ---------- WebSocket ----------

  private openSocket(): void {
    const url = socketUrl(this.deps.origin, roomPath(this.code, "/ws"));
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
        return this.finish("replaced");
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
    this.resolveGift({ ok: false, reason: "lost" });
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
    if (message.type === "room.ended") return this.finish("ended", message.reason ?? null);
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
      case "gift.result":
        if (this.pendingGift?.requestId !== message.requestId) return; // tarde demais: ninguém espera
        return this.resolveGift(message.ok ? { ok: true } : { ok: false, reason: message.reason ?? "error" });
      case "gift":
        return this.addGift({
          id: this.deps.randomId(),
          fromId: message.from,
          fromNickname: message.fromNickname,
          toId: message.to,
          toNickname: message.toNickname,
          amount: message.amount,
        });
      case "signal":
        for (const handler of [...this.signalHandlers]) handler(message.from, message.data);
        return;
      case "force.muted":
        return this.onForceMuted();
      case "room.updated":
        this.update(this.applyRoomSettings(message.room));
        return this.rebuild();
      case "video.watch.state":
        return this.onWatchState(message);
      case "video.viewers":
        return this.onViewers(message.videoId, message.viewers, message.blocked);
      case "relay.meter":
        return this.update({
          relayMeter: { pairs: message.pairs, goldPerHour: message.goldPerHour, state: message.state },
        });
      case "protected.meter":
        return this.update({
          protectedMeter: {
            state: message.state,
            remainingMs: message.remainingMs,
            goldPerHour: message.goldPerHour,
            graceEndsAt: message.graceEndsAt ?? null,
          },
        });
      case "error":
        if (message.code === "rate_limited") this.onRateLimited();
        return;
      case "pong":
        return;
    }
  }

  private onWelcome(message: Extract<ServerMessage, { type: "welcome" }>): void {
    if (!this.inSession) return;
    const reconnecting = this.media !== null;
    if (this.media && this.selfId !== message.self) this.closeMedia();
    // O servidor zera o que a pessoa assiste quando a conexão cai: pede de novo abaixo.
    const watchedBefore = new Set(this.watching.keys());
    this.watching.clear();
    this.welcomed = true;
    this.epoch += 1;
    this.reconnectAttempt = 0;
    this.selfId = message.self;
    const roomSettings = this.applyRoomSettings(message.room);
    this.maxWatched = message.limits.watchedVideos;
    this.relayVideo = message.limits.relayVideo;
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
    // E esquece quais pares são retransmitidos: reenvia o que a mídia sabe.
    this.sentRelay.clear();
    for (const [peerId, media] of this.peerMedia) {
      if (this.participants.has(peerId)) this.sendRelay(peerId, media.relayed, true);
    }
    this.rewatchAfterWelcome(watchedBefore);
    this.rebuild({
      phase: "connected",
      chat: message.chat.slice(-CHAT_HISTORY_SIZE),
      ...roomSettings,
      // O servidor decide quantos vídeos esta pessoa pode transmitir (depende do plano dela) e quais
      // reações ela pode enviar (as básicas mais as dos pacotes equipados).
      maxOwnVideos: message.limits.videosPerPerson,
      availableReactions: message.limits.reactions,
    });
  }

  private onParticipant(participant: Participant): void {
    const isNew = !this.participants.has(participant.id);
    this.participants.set(participant.id, participant);
    if (participant.id === this.selfId) this.handRaised = participant.handRaised;
    if (isNew) this.syncPeers();
    this.reconcileVideos();
    this.rebuild();
  }

  private onParticipantLeft(id: string): void {
    if (!this.participants.delete(id)) return;
    this.peerMedia.delete(id);
    this.sentRelay.delete(id);
    this.speaking.delete(id);
    this.syncPeers();
    this.reconcileVideos();
    this.rebuild();
  }

  // ---------- Vídeo sob demanda ----------

  /** A sala tem poucas pessoas: vídeo novo abre sozinho. */
  private isSmallRoom(): boolean {
    return this.participants.size <= AUTO_WATCH_MAX_PEOPLE;
  }

  /** Vídeos anunciados por outras pessoas, na ordem da lista de participantes. */
  private remoteVideoIds(): string[] {
    const ids: string[] = [];
    for (const p of this.participants.values()) {
      if (p.id === this.selfId) continue;
      for (const video of p.videos) ids.push(video.id);
    }
    return ids;
  }

  /**
   * Depois de cada `welcome` (entrada ou reconexão): numa sala pequena, pede todos os vídeos (os que
   * a pessoa já assistia primeiro), menos os que ela parou de propósito; numa sala maior, só os que
   * ela assistia antes da queda.
   */
  private rewatchAfterWelcome(watchedBefore: ReadonlySet<string>): void {
    const remote = this.remoteVideoIds();
    const present = new Set(remote);
    this.knownVideos.clear();
    for (const id of remote) this.knownVideos.add(id);
    for (const id of [...this.optedOut]) if (!present.has(id)) this.optedOut.delete(id);
    const before = remote.filter((id) => watchedBefore.has(id));
    const candidates = this.isSmallRoom()
      ? [...before, ...remote.filter((id) => !watchedBefore.has(id) && !this.optedOut.has(id))]
      : before;
    for (const id of candidates) this.requestWatch(id, false);
  }

  /**
   * Depois de cada mudança na lista de pessoas: esquece o que sumiu (vídeo parado ou quem transmitia
   * saiu) e, numa sala pequena, pede sozinho o vídeo novo de outra pessoa.
   */
  private reconcileVideos(): void {
    const remote = this.remoteVideoIds();
    const present = new Set(remote);
    for (const id of [...this.watching.keys()]) {
      if (present.has(id)) continue;
      this.watching.delete(id);
      this.remoteStreams.delete(id);
    }
    for (const id of [...this.optedOut]) if (!present.has(id)) this.optedOut.delete(id);
    for (const id of [...this.knownVideos]) if (!present.has(id)) this.knownVideos.delete(id);
    const self = this.selfId ? this.participants.get(this.selfId) : undefined;
    const own = new Set(self?.videos.map((video) => video.id) ?? []);
    for (const id of [...this.localViewers.keys()]) {
      if (!own.has(id) && !this.localStreams.has(id)) this.localViewers.delete(id);
    }
    const small = this.isSmallRoom();
    for (const id of remote) {
      if (this.knownVideos.has(id)) continue;
      this.knownVideos.add(id);
      if (small && !this.optedOut.has(id)) this.requestWatch(id, false);
    }
  }

  /**
   * Pede para assistir. No limite de assistidos não envia (o pedido da pessoa vira aviso). `false`
   * se não pediu.
   */
  private requestWatch(videoId: string, manual: boolean): boolean {
    if (this.watching.has(videoId)) return true;
    if (this.watching.size >= this.maxWatched) {
      if (manual) this.notify({ kind: "watchLimit" });
      return false;
    }
    if (!this.send({ type: "video.watch", videoId })) return false;
    this.watching.set(videoId, { state: "requesting", reason: null, manual });
    return true;
  }

  private watchVideo(videoId: string): void {
    if (!this.isConnected() || !this.remoteVideoIds().includes(videoId)) return;
    if (this.watching.has(videoId)) return;
    this.optedOut.delete(videoId);
    this.requestWatch(videoId, true);
    this.rebuild();
  }

  private unwatchVideo(videoId: string): void {
    if (!this.isConnected() || !this.watching.has(videoId)) return;
    this.send({ type: "video.unwatch", videoId });
    this.watching.delete(videoId);
    this.remoteStreams.delete(videoId);
    this.optedOut.add(videoId);
    if (this.chosenFeatured === videoId) this.chosenFeatured = null;
    this.rebuild();
  }

  private onWatchState(message: Extract<ServerMessage, { type: "video.watch.state" }>): void {
    const { videoId } = message;
    if (!this.remoteVideoIds().includes(videoId)) return; // vídeo que já sumiu (ou é próprio)
    const entry = this.watching.get(videoId);
    const manual = entry?.manual ?? false;
    switch (message.state) {
      case "watching":
        this.watching.set(videoId, { state: "watching", reason: null, manual });
        break;
      case "blocked":
        this.watching.set(videoId, {
          state: "blocked",
          reason: message.reason === "relay_no_gold" ? "relay_no_gold" : "relay_no_plus",
          manual,
        });
        break;
      case "denied":
        this.watching.delete(videoId);
        // A recusa da abertura automática não vira aviso: a pessoa não pediu.
        if (message.reason === "watch_limit" && manual) this.notify({ kind: "watchLimit" });
        break;
      case "stopped":
        this.watching.delete(videoId);
        this.remoteStreams.delete(videoId);
        break;
    }
    this.rebuild();
  }

  /** Só quem transmite recebe: a quem enviar o vídeo e quem está bloqueado por retransmissão. */
  private onViewers(videoId: string, viewers: string[], blocked: string[]): void {
    this.localViewers.set(videoId, { viewers: [...viewers], blocked: [...blocked] });
    this.media?.setVideoViewers(videoId, viewers);
    this.rebuild();
  }

  /** Avisa o servidor se o par é retransmitido; sem `force`, só quando muda. */
  private sendRelay(peerId: string, relayed: boolean, force: boolean): void {
    if (!force && (this.sentRelay.get(peerId) ?? false) === relayed) return;
    if (this.send({ type: "peer.relay", peer: peerId, relayed })) this.sentRelay.set(peerId, relayed);
  }

  // ---------- Limites de frequência ----------

  /**
   * O servidor recusou uma mensagem por frequência. Chat → `chatRateLimited`; reação, mão e
   * microfone → `rateLimited`, desfazendo o que foi mostrado antes da confirmação.
   */
  private onRateLimited(): void {
    const last = this.lastLimited;
    if (!last || last.kind === "chat") return this.notify({ kind: "chatRateLimited" });
    const notice: RoomNotice = { kind: "rateLimited" };
    if (last.kind === "hand") {
      this.handRaised = last.previous;
      this.update({ handRaised: last.previous, notice });
      return this.rebuild();
    }
    if (last.kind === "mic") {
      if (!last.muted) {
        // Abrir o microfone foi recusado: fecha de novo, para não transmitir sem a lista mostrar.
        this.media?.setMicrophoneMuted(true);
        this.speaking.delete(this.selfId ?? "");
        this.update({ micMuted: true, notice });
        return this.rebuild();
      }
      // Fechar foi recusado: continua fechado aqui; a lista é corrigida quando a janela passar.
      this.clearMicResend();
      this.micResendTimer = setTimeout(() => {
        this.micResendTimer = null;
        if (this.isConnected() && this.state.micMuted) this.send({ type: "mic.set", muted: true });
      }, MIC_RATE_WINDOW_MS);
    }
    this.notify(notice);
  }

  private clearMicResend(): void {
    if (this.micResendTimer !== null) clearTimeout(this.micResendTimer);
    this.micResendTimer = null;
  }

  private addReaction(from: string, reaction: string): void {
    const event = { id: this.deps.randomId(), from, reaction };
    const timer = setTimeout(() => {
      this.reactionTimers.delete(timer);
      this.update({ reactions: this.state.reactions.filter((r) => r.id !== event.id) });
    }, REACTION_LIFETIME_MS);
    this.reactionTimers.add(timer);
    this.update({ reactions: [...this.state.reactions, event].slice(-MAX_REACTIONS) });
  }

  private addGift(event: GiftEvent): void {
    const timer = setTimeout(() => {
      this.giftTimers.delete(timer);
      this.update({ gifts: this.state.gifts.filter((gift) => gift.id !== event.id) });
    }, GIFT_LIFETIME_MS);
    this.giftTimers.add(timer);
    this.update({ gifts: [...this.state.gifts, event].slice(-MAX_GIFTS) });
  }

  private onForceMuted(): void {
    this.media?.setMicrophoneMuted(true);
    this.speaking.delete(this.selfId ?? "");
    this.update({ micMuted: true, notice: { kind: "mutedByOwner" } });
    this.rebuild();
  }

  // ---------- Mídia ----------

  private createMedia(selfId: string): void {
    // Sala protegida: só retransmissão desde o início, para nenhum IP aparecer.
    const relayOnly = this.roomProtected || this.relayOnlyFromIce;
    const media: MediaSession = this.deps.createMediaSession({
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
        if (result.data.relayOnly && !relayOnly) {
          // O servidor pede só retransmissão e esta sessão nasceu sem: não conecta assim; recria.
          this.relayOnlyFromIce = true;
          queueMicrotask(() => this.restartMedia(media));
          throw new Error("ice: relay only");
        }
        return result.data.iceServers;
      },
      // Única regra de plano aplicada pelo navegador: a qualidade do que a própria pessoa transmite
      // na sala direta. A retransmissão continua limitada para todos.
      quality: this.sessionAccount?.plan.plus ? PLUS_VIDEO_QUALITY : FREE_VIDEO_QUALITY,
      relayQuality: RELAY_VIDEO_QUALITY,
      relayScreenAudioMaxBitrate: RELAY_SCREEN_AUDIO_MAX_BITRATE,
      relayOnly,
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
        if (this.welcomed && this.participants.has(status.peerId)) {
          this.sendRelay(status.peerId, status.relayed, false);
        }
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

  /**
   * Troca a sessão de mídia por uma só de retransmissão (o servidor pediu e a sessão nasceu sem).
   * Os vídeos próprios param; o microfone volta mudo.
   */
  private restartMedia(old: MediaSession): void {
    const selfId = this.selfId;
    if (this.disposed || this.media !== old || !selfId) return;
    this.deps.report("room: relay-only ice for a session without it");
    const micWasOpen = this.micEnabled && !this.state.micMuted;
    for (const videoId of [...this.localStreams.keys()]) this.stopVideo(videoId);
    this.closeMedia();
    this.peerMedia.clear();
    this.remoteStreams.clear();
    this.sentRelay.clear();
    this.createMedia(selfId);
    this.syncPeers();
    for (const [videoId, entry] of this.localViewers) this.media?.setVideoViewers(videoId, entry.viewers);
    if (micWasOpen) this.send({ type: "mic.set", muted: true });
    this.rebuild();
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

  private sendChat(text: string): void {
    if (this.send({ type: "chat.send", text })) this.lastLimited = { kind: "chat" };
  }

  private react(reaction: string): void {
    // A lista é a que o servidor mandou; fora dela, ele só recusaria.
    if (!this.state.availableReactions.includes(reaction)) return;
    if (this.send({ type: "reaction.send", reaction })) this.lastLimited = { kind: "reaction" };
  }

  private sendGold(participantId: string, amount: number): Promise<SendGoldResult> {
    if (!this.isConnected()) return Promise.resolve({ ok: false, reason: "lost" });
    if (this.pendingGift || !giftAmountSchema.safeParse(amount).success) {
      return Promise.resolve({ ok: false, reason: "error" });
    }
    const requestId = this.deps.randomId();
    return new Promise<SendGoldResult>((resolve) => {
      const timer = setTimeout(
        () => this.resolveGift({ ok: false, reason: "lost" }),
        GIFT_REQUEST_TIMEOUT_MS,
      );
      this.pendingGift = { requestId, timer, resolve };
      if (!this.send({ type: "gift.send", requestId, to: participantId, amount })) {
        this.resolveGift({ ok: false, reason: "lost" });
      }
    });
  }

  /** Encerra o envio de ouro no ar (se houver) com o resultado dado. */
  private resolveGift(result: SendGoldResult): void {
    const pending = this.pendingGift;
    if (!pending) return;
    this.pendingGift = null;
    clearTimeout(pending.timer);
    pending.resolve(result);
  }

  private setHandRaised(raised: boolean): void {
    if (!this.isConnected()) return;
    if (this.send({ type: "hand.set", raised })) {
      this.lastLimited = { kind: "hand", previous: this.handRaised };
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
    this.clearMicResend();
    this.update({ micMuted: muted });
    if (this.send({ type: "mic.set", muted })) this.lastLimited = { kind: "mic", muted };
    this.rebuild();
  }

  private async startVideo(kind: VideoKind): Promise<void> {
    // Um pedido por vez; o segundo vídeo (Plus) pode ser pedido depois que o primeiro foi autorizado.
    if (!this.isConnected() || this.videoRequestInFlight) return;
    if (kind === "screen" && !this.state.capabilities.canShareScreen) return;
    const self = this.selfId ? this.participants.get(this.selfId) : undefined;
    if ((self?.videos.length ?? 0) >= this.state.maxOwnVideos) {
      // O limite é o que o servidor mandou no `welcome`; pedir de novo só traria a mesma recusa.
      this.notify({ kind: "videoPersonLimit" });
      return;
    }
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
    this.localViewers.delete(videoId);
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
    const video = this.state.videos.find((candidate) => candidate.id === videoId);
    if (!video || !canFeature(video)) return;
    this.chosenFeatured = videoId;
    this.rebuild();
  }

  /** Só o dono da sala de link fixo; o tema muda quando o servidor confirma com `room.updated`. */
  private setRoomTheme(theme: RoomTheme): void {
    if (!this.isConnected() || !this.state.isOwner || !this.state.fixed) return;
    this.send({ type: "room.setTheme", theme });
  }

  /** Dono contra qualquer outra pessoa; moderador só contra participantes comuns. */
  private moderate(action: "mute" | "kick" | "ban", participantId: string): void {
    if (!this.isConnected() || participantId === this.selfId) return;
    const target = this.participants.get(participantId);
    if (!target) return;
    const allowed = this.state.isOwner || (this.state.isModerator && !target.isOwner && !target.isModerator);
    if (allowed) this.send({ type: "moderate", action, target: participantId });
  }

  /** Só o dono; o papel muda quando o servidor confirma (`participant.updated`). */
  private setModerator(participantId: string, moderator: boolean): void {
    if (!this.isConnected() || !this.state.isOwner || participantId === this.selfId) return;
    const target = this.participants.get(participantId);
    if (!target || target.isOwner) return;
    this.send({ type: "moderator.set", target: participantId, moderator });
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
        isModerator: p.isModerator,
        handle: p.handle,
        avatarUrl: p.avatarUrl,
        badges: p.badges,
        cosmetics: p.cosmetics,
        canReceiveGold: p.canReceiveGold,
        micMuted: isSelf ? this.state.micMuted : p.micMuted,
        handRaised: isSelf ? this.handRaised : p.handRaised,
        speaking: this.speaking.has(p.id),
        connection: isSelf ? "connected" : media.connection,
        relayed: isSelf ? false : media.relayed,
        audioStream: isSelf ? null : media.audioStream,
      });
      for (const video of p.videos) {
        if (!this.videoOrder.has(video.id)) this.videoOrder.set(video.id, this.videoSeq++);
        videos.push(isSelf ? this.localVideoView(video, p.id) : this.remoteVideoView(video, p.id));
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
      isModerator: self?.isModerator ?? false,
      maxWatchedVideos: this.maxWatched,
      watchedCount: this.watching.size,
      // O servidor marca quem entrou com conta; é o mesmo que a deixa enviar ouro.
      canSendGold: self?.canReceiveGold ?? false,
      handRaised: this.handRaised,
      participants,
      videos,
      featuredVideoId: pickFeaturedVideo(videos.filter(canFeature), this.chosenFeatured),
      localVideoIds: videos.filter((video) => video.isLocal).map((video) => video.id),
      occupancy: { participants: participants.length, capacity: this.capacity },
      ...extra,
    });
  }

  private localVideoView(video: RoomVideo, ownerId: string): VideoView {
    const entry = this.localViewers.get(video.id);
    const inRoom = (id: string) => this.participants.has(id);
    // O servidor bloqueia o par retransmitido de quem não é Plus, ou de quem é Plus sem ouro.
    const reason: VideoBlockedReason = this.relayVideo ? "relay_no_gold" : "relay_no_plus";
    return {
      id: video.id,
      kind: video.kind,
      ownerId,
      stream: this.localStreams.get(video.id) ?? null,
      isLocal: true,
      watch: "local",
      blockedReason: null,
      viewers: entry?.viewers.filter(inRoom) ?? [],
      blockedViewers: (entry?.blocked.filter(inRoom) ?? []).map((participantId) => ({
        participantId,
        reason,
      })),
    };
  }

  private remoteVideoView(video: RoomVideo, ownerId: string): VideoView {
    const entry = this.watching.get(video.id);
    const watch = entry?.state ?? "idle";
    return {
      id: video.id,
      kind: video.kind,
      ownerId,
      stream: watch === "watching" ? (this.remoteStreams.get(video.id) ?? null) : null,
      isLocal: false,
      watch,
      blockedReason: entry?.state === "blocked" ? entry.reason : null,
      viewers: [],
      blockedViewers: [],
    };
  }
}
