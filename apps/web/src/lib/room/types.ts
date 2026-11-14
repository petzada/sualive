/**
 * Contrato entre a lógica do cliente da sala (`src/lib`) e as telas. As telas só conhecem
 * `useRoom`, `createRoom` e estes tipos: nada de WebSocket, fetch ou WebRTC em componente.
 */
import type { RoomTheme } from "@sualive/config";
import type { DevicePreview, MediaCapabilities, VideoKind } from "@sualive/media";
import type { Badge, ChatMessage } from "@sualive/protocol";

export type RoomPhase =
  | "loading" // consultando a sala
  | "lobby" // sala aberta: escolher apelido, ver a prévia, passar pelo Turnstile
  | "joining" // entrando
  | "connected"
  | "reconnecting" // caiu a rede; volta sozinho
  | "ended" // a sala acabou (ou o link nunca existiu)
  | "full" // sala cheia
  | "banned"
  | "kicked" // removido pelo dono; pode tentar entrar de novo
  | "replaced" // a mesma pessoa abriu a sala em outra aba; `useThisTab()` traz a sala de volta
  | "error"; // falha inesperada

/** Motivo de uma falha mostrada como aviso, sem tirar a pessoa da sala. */
export type RoomNotice =
  | { kind: "videoRoomLimit" } // a sala já tem o máximo de vídeos
  | { kind: "videoPersonLimit" } // a pessoa já transmite o máximo dela
  | { kind: "chatRateLimited" }
  | { kind: "mutedByOwner" }
  | { kind: "mediaPermissionDenied"; device: "microphone" | "camera" | "screen" }
  | { kind: "turnstileFailed" }
  | { kind: "rateLimited" } // limite de requisições por IP
  | { kind: "linkCopied" };

export interface VideoView {
  id: string;
  kind: VideoKind;
  ownerId: string;
  /** `null` enquanto a mídia ainda não chegou. */
  stream: MediaStream | null;
  isLocal: boolean;
}

export interface ParticipantView {
  id: string;
  nickname: string;
  isSelf: boolean;
  isOwner: boolean;
  /** Conta (entrega 2): nulos e vazio para quem entrou só com apelido. */
  handle: string | null;
  avatarUrl: string | null;
  badges: Badge[];
  micMuted: boolean;
  handRaised: boolean;
  speaking: boolean;
  /** Conexão de mídia com esta pessoa ("connected" para a própria). */
  connection: "connecting" | "connected" | "reconnecting" | "failed";
  /** A conexão com esta pessoa passa por retransmissão. */
  relayed: boolean;
  /** Voz da pessoa para tocar (`null` para a própria ou enquanto não chega). */
  audioStream: MediaStream | null;
}

export interface ReactionEvent {
  /** Único por reação, para animar e descartar. */
  id: string;
  from: string;
  /** Uma das básicas ou de um pacote equipado por quem enviou. */
  reaction: string;
}

export interface RoomState {
  phase: RoomPhase;
  code: string;
  /** Endereço completo da sala, para copiar. */
  link: string;
  /** Sala de link fixo de um assinante; `ownerHandle` aparece no cabeçalho no lugar do código. */
  fixed: boolean;
  ownerHandle: string | null;
  /** Tema da sala (um dos temas prontos). */
  theme: RoomTheme;
  /** Quantos vídeos esta pessoa pode transmitir ao mesmo tempo (1; Plus 2). */
  maxOwnVideos: number;
  /**
   * Quem está logado entra com o apelido do perfil: o lobby mostra esse apelido em vez do campo.
   * `null` para quem não tem conta.
   */
  accountNickname: string | null;
  /** Pessoas na sala agora e lotação (vale no lobby também). */
  occupancy: { participants: number; capacity: number };
  selfId: string | null;
  isOwner: boolean;
  participants: ParticipantView[];
  videos: VideoView[];
  /** Vídeo em destaque (`null` sem vídeos). Os demais ficam em miniatura. */
  featuredVideoId: string | null;
  chat: ChatMessage[];
  /** Reações recentes; cada uma some sozinha depois de alguns segundos. */
  reactions: ReactionEvent[];
  /** Aviso mais recente a mostrar (`null` sem aviso). */
  notice: RoomNotice | null;
  /** Microfone da própria pessoa. Entra-se sempre mudo. */
  micMuted: boolean;
  handRaised: boolean;
  /** Vídeos que a própria pessoa transmite. */
  localVideoIds: string[];
  capabilities: MediaCapabilities;
  /** Prévia de microfone e câmera no lobby (`null` fora dele ou antes de permitir). */
  preview: DevicePreview | null;
}

export interface JoinOptions {
  /** Ignorado quando há conta logada (vale o apelido do perfil). */
  nickname: string;
  turnstileToken: string;
}

export interface RoomActions {
  /** Pede permissão e liga a prévia de microfone e câmera no lobby. */
  startPreview(): Promise<void>;
  join(options: JoinOptions): Promise<void>;
  leave(): void;
  /** Só na fase `replaced`: volta a usar esta aba (a outra é que passa a ser derrubada). */
  useThisTab(): void;
  sendChat(text: string): void;
  react(reaction: string): void;
  setHandRaised(raised: boolean): void;
  setMicMuted(muted: boolean): Promise<void>;
  /** Pede ao servidor e, se autorizado, captura e transmite. */
  startVideo(kind: VideoKind): Promise<void>;
  stopVideo(videoId: string): void;
  setFeaturedVideo(videoId: string): void;
  /** Só o dono Plus, na sala de link fixo dele. */
  setRoomTheme(theme: RoomTheme): void;
  /** Só o dono. */
  moderate(action: "mute" | "kick" | "ban", participantId: string): void;
  copyLink(): Promise<void>;
  dismissNotice(): void;
}

/** `code` é o código da sala comum ou `@nome` para a sala de link fixo. */
export type UseRoom = (code: string) => { state: RoomState; actions: RoomActions };

export type CreateRoomResult =
  { ok: true; code: string } | { ok: false; reason: "turnstileFailed" | "rateLimited" | "error" };

/** Cria a sala, guarda o token de dono no navegador e devolve o código. */
export type CreateRoom = (turnstileToken: string) => Promise<CreateRoomResult>;
