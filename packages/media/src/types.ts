/**
 * Interface única de mídia. O resto do front fala só com `MediaSession` e não sabe qual caminho
 * está em uso (no MVP só existe a malha direta).
 */
import type { VideoQuality } from "@sualive/config";
import type { SignalData, VideoKind } from "@sualive/protocol";

export type { SignalData, VideoKind };

/** Canal de sinalização entregue por quem usa o pacote (o WebSocket da sala). */
export interface SignalTransport {
  send(to: string, data: SignalData): void;
  /** Registra o recebimento; devolve a função que cancela. */
  subscribe(handler: (from: string, data: SignalData) => void): () => void;
}

export interface MediaSessionOptions {
  /** Identificador do próprio participante na sala. */
  selfId: string;
  transport: SignalTransport;
  /** Busca credenciais novas de STUN/TURN (curta duração). Chamado ao conectar e ao reconectar. */
  getIceServers: () => Promise<RTCIceServer[]>;
  /** Teto do que esta pessoa transmite (plano dela). */
  quality: VideoQuality;
  /** Teto quando a conexão com um par usa retransmissão (TURN). */
  relayQuality: VideoQuality;
  /**
   * Teto (bps) do áudio da tela compartilhada enviado a um par retransmitido. Sai quando o par deixa
   * de ser retransmitido. Nunca vale para a voz (microfone). Sem valor, o áudio da tela não tem teto.
   */
  relayScreenAudioMaxBitrate?: number;
  /**
   * Sala protegida: toda conexão só por retransmissão (`iceTransportPolicy: "relay"`), para não
   * expor o IP. Todo par conta como retransmitido desde o início. Sem servidor TURN nas
   * credenciais, a conexão não é tentada e o par fica em `failed`.
   */
  relayOnly?: boolean;
}

export type PeerConnectionState = "connecting" | "connected" | "reconnecting" | "failed";

export interface PeerStatus {
  peerId: string;
  state: PeerConnectionState;
  /** A conexão com este par passa por retransmissão (TURN). */
  relayed: boolean;
}

export interface RemoteVideo {
  peerId: string;
  /** Vídeo autorizado pelo servidor (`RoomVideo.id`). */
  videoId: string;
  /** Vídeo e, na tela compartilhada, o áudio da aba ou do sistema quando houver. */
  stream: MediaStream;
}

export interface LocalVideo {
  videoId: string;
  kind: VideoKind;
  stream: MediaStream;
}

export interface MediaSessionEvents {
  /** Mudou a conexão com um par. */
  peer: (status: PeerStatus) => void;
  /** Chegou ou mudou a voz de um par (`null` quando sai). */
  remoteAudio: (peerId: string, stream: MediaStream | null) => void;
  /** Chegou um vídeo que o par abriu para esta pessoa. */
  remoteVideoAdded: (video: RemoteVideo) => void;
  /** O par fechou o envio, o vídeo acabou ou o par saiu. */
  remoteVideoRemoved: (peerId: string, videoId: string) => void;
  /** Quem está falando agora. `peerId` é `selfId` para a própria pessoa. */
  speaking: (peerId: string, speaking: boolean) => void;
  /** Um vídeo local acabou sozinho (ex.: a pessoa parou o compartilhamento pelo navegador). */
  localVideoEnded: (videoId: string) => void;
}

export interface PublishVideoOptions {
  /** Câmera específica (só para `camera`). */
  deviceId?: string;
}

export interface MediaSession {
  /**
   * Informa quem está na sala agora. A sessão abre conexão com quem entrou e fecha com quem saiu.
   * Malha completa: uma conexão com cada outro participante.
   */
  setPeers(peerIds: string[]): void;

  /** Liga a captura do microfone (eco e ruído tratados pelo navegador). Começa mudo. */
  enableMicrophone(deviceId?: string): Promise<void>;
  setMicrophoneMuted(muted: boolean): void;
  isMicrophoneMuted(): boolean;

  /**
   * Captura e publica um vídeo já autorizado pelo servidor (`videoId` do `video.granted`).
   * `screen` inclui o áudio da aba ou do sistema quando o navegador oferece e prefere nitidez;
   * `camera` prefere fluidez. Rejeita se a pessoa negar a permissão.
   */
  publishVideo(videoId: string, kind: VideoKind, options?: PublishVideoOptions): Promise<LocalVideo>;
  /** Para de capturar e fecha o envio do vídeo para todos. */
  unpublishVideo(videoId: string): void;
  /**
   * A quem enviar este vídeo local. Abre o envio para quem entrou na lista e fecha para quem saiu.
   * Publicar não envia o vídeo a ninguém: só quem está na lista (decidida pelo servidor) recebe.
   * Pode chegar antes de `publishVideo` terminar; a lista vale quando a captura começar. Quem sai
   * da sala sai também das listas.
   */
  setVideoViewers(videoId: string, peerIds: string[]): void;

  getPeers(): PeerStatus[];
  getRemoteVideos(): RemoteVideo[];
  getLocalVideos(): LocalVideo[];

  on<E extends keyof MediaSessionEvents>(event: E, handler: MediaSessionEvents[E]): () => void;

  /** Reabre as conexões (ex.: o WebSocket voltou depois de queda de rede). */
  reconnect(): void;
  /** Encerra tudo e solta câmera, microfone e tela. */
  close(): void;
}

export type CreateMediaSession = (options: MediaSessionOptions) => MediaSession;

/** Prévia de microfone e câmera antes de entrar na sala. */
export interface DevicePreview {
  /** Câmera para mostrar na prévia (`null` se negada ou inexistente). */
  readonly cameraStream: MediaStream | null;
  readonly hasMicrophone: boolean;
  /** Nível do microfone de 0 a 1, para o medidor. Devolve a função que cancela. */
  onMicrophoneLevel(handler: (level: number) => void): () => void;
  stop(): void;
}

export interface MediaCapabilities {
  /** `false` em navegador de celular: o botão de compartilhar tela não aparece. */
  canShareScreen: boolean;
  canUseCamera: boolean;
}
