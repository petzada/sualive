/**
 * Contrato entre a lógica do cliente da sala (`src/lib`) e as telas. As telas só conhecem
 * `useRoom`, `createRoom` e estes tipos: nada de WebSocket, fetch ou WebRTC em componente.
 */
import type { RoomTheme } from "@sualive/config";
import type { DevicePreview, MediaCapabilities, VideoKind } from "@sualive/media";
import type { Badge, ChatMessage, Cosmetics, GiftFailure } from "@sualive/protocol";

export type { Cosmetics, GiftFailure };

export type RoomPhase =
  | "loading" // consultando a sala
  | "lobby" // sala aberta: escolher apelido, ver a prévia, passar pelo Turnstile
  | "joining" // entrando
  | "connected"
  | "reconnecting" // caiu a rede; volta sozinho
  | "ended" // a sala acabou (ou o link nunca existiu); `endReason` diz se foi por falta de ouro
  | "full" // sala cheia
  | "banned"
  | "kicked" // removido pelo dono ou por um moderador; pode tentar entrar de novo
  | "replaced" // a mesma pessoa abriu a sala em outra aba; `useThisTab()` traz a sala de volta
  | "error"; // falha inesperada

/** Motivo de uma falha mostrada como aviso, sem tirar a pessoa da sala. */
export type RoomNotice =
  | { kind: "videoRoomLimit" } // a sala já tem o máximo de vídeos (só a sala protegida tem teto)
  | { kind: "videoPersonLimit" } // a pessoa já transmite o máximo dela
  | { kind: "watchLimit" } // a pessoa já assiste o máximo de vídeos (`maxWatchedVideos`)
  | { kind: "chatRateLimited" }
  | { kind: "mutedByOwner" }
  | { kind: "mediaPermissionDenied"; device: "microphone" | "camera" | "screen" }
  | { kind: "turnstileFailed" }
  // Limite de requisições por IP (lobby) e, dentro da sala, limite de frequência de reações, mão e
  // microfone (o do chat continua `chatRateLimited`).
  | { kind: "rateLimited" }
  | { kind: "linkCopied" };

/**
 * Situação de um vídeo para ESTA pessoa (vídeo sob demanda, entrega 4):
 * - `local`: é dela (ela transmite);
 * - `idle`: anunciado e não assistido: a tela mostra o cartão com o nome de quem transmite e o
 *   botão "Assistir" (`watchVideo`);
 * - `requesting`: pedido enviado, esperando o servidor;
 * - `watching`: o servidor liberou; o `stream` chega logo depois (até lá é `null`);
 * - `blocked`: liberado, mas o par é retransmitido e quem transmite não pode pagar
 *   (`blockedReason`); volta a `watching` sozinho se isso mudar. Conta como assistido.
 */
export type VideoWatch = "local" | "idle" | "requesting" | "watching" | "blocked";

/**
 * Por que um vídeo não passa num par retransmitido: quem transmite não é Plus (`relay_no_plus`) ou
 * é Plus e está sem ouro (`relay_no_gold`). O caminho é o Plus (ou o ouro) de quem transmite.
 */
export type VideoBlockedReason = "relay_no_plus" | "relay_no_gold";

/** Quem quer assistir um vídeo próprio e não recebe por causa da retransmissão sem pagamento. */
export interface BlockedViewer {
  participantId: string;
  reason: VideoBlockedReason;
}

/** Um vídeo anunciado na sala (de qualquer pessoa, inclusive o próprio), na ordem em que apareceu. */
export interface VideoView {
  id: string;
  kind: VideoKind;
  ownerId: string;
  /** Nos próprios e em `watching`, depois que a mídia chega; `null` nos demais casos. */
  stream: MediaStream | null;
  isLocal: boolean;
  /** Situação para esta pessoa. */
  watch: VideoWatch;
  /** Só em `blocked`; `null` nos demais. */
  blockedReason: VideoBlockedReason | null;
  /** Só nos próprios: quem recebe este vídeo agora (como o servidor mandou). Vazio nos dos outros. */
  viewers: string[];
  /**
   * Só nos próprios: quem quer assistir e está bloqueado por retransmissão sem pagamento. O motivo
   * vem do plano desta pessoa: sem Plus → `relay_no_plus`; com Plus → `relay_no_gold`.
   */
  blockedViewers: BlockedViewer[];
}

/**
 * Cobrança da retransmissão do vídeo próprio, para quem transmite (só existe depois que o servidor
 * manda): `pairs` pares pagos ativos e `goldPerHour` o total por hora; `no_gold` = o ouro acabou e
 * os pares retransmitidos ficaram bloqueados (a voz continua).
 */
export interface RelayMeter {
  pairs: number;
  goldPerHour: number;
  state: "paying" | "no_gold";
}

/**
 * Sala protegida, para todos: quanto tempo o saldo do dono ainda cobre (`remainingMs`; a tela
 * mostra o tempo, não o ouro). `warning` = passou de um aviso de saldo; `grace` = saldo zerado,
 * tolerância correndo até `graceEndsAt` (ms desde a época). Sem recarga, a sala acaba (fase `ended`
 * com `endReason: "no_gold"`).
 */
export interface ProtectedMeter {
  state: "ok" | "warning" | "grace";
  remainingMs: number;
  goldPerHour: number;
  /** Só em `grace`; `null` nos demais. */
  graceEndsAt: number | null;
}

/** Por que a sala acabou (fase `ended`): `no_gold` = sala protegida encerrada sem saldo do dono. */
export type RoomEndReason = "no_gold";

export interface ParticipantView {
  id: string;
  nickname: string;
  isSelf: boolean;
  isOwner: boolean;
  /**
   * Moderador promovido pelo dono: silencia, remove e bane participantes comuns. Não age sobre o
   * dono nem sobre outros moderadores.
   */
  isModerator: boolean;
  /** Conta (entrega 2): nulos e vazio para quem entrou só com apelido. */
  handle: string | null;
  avatarUrl: string | null;
  badges: Badge[];
  /** Cosméticos equipados (cor ou degradê do nome, moldura do avatar); nulo para quem não tem conta. */
  cosmetics: Cosmetics | null;
  /** Tem conta: pode receber ouro pelo botão da sala. */
  canReceiveGold: boolean;
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

/** Aviso de ouro enviado na sala (para todos). Apelidos do momento do envio. */
export interface GiftEvent {
  /** Único por aviso, para animar e descartar. */
  id: string;
  fromId: string;
  fromNickname: string;
  toId: string;
  toNickname: string;
  amount: number;
}

/** Resultado de `sendGold`: `lost` = sem resposta a tempo ou a conexão caiu (pode ter ido ou não). */
export type SendGoldResult = { ok: true } | { ok: false; reason: GiftFailure | "lost" };

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
  /**
   * Sala protegida: toda a mídia passa pela retransmissão. Vale no lobby (consulta da sala) e na
   * sala; não muda com a sala em andamento.
   */
  protected: boolean;
  /** Teto de vídeos ao mesmo tempo na sala: só a protegida tem (`null` = sem teto). */
  maxVideos: number | null;
  /** Quantos vídeos esta pessoa pode transmitir ao mesmo tempo (2; Plus 4), como o servidor mandou. */
  maxOwnVideos: number;
  /** Quantos vídeos esta pessoa pode assistir ao mesmo tempo, como o servidor mandou. */
  maxWatchedVideos: number;
  /** Vídeos de outras pessoas que ela assiste agora (`requesting`, `watching` ou `blocked`). */
  watchedCount: number;
  /** Cobrança da retransmissão do vídeo próprio (`null` até o servidor mandar). */
  relayMeter: RelayMeter | null;
  /** Saldo da sala protegida (`null` fora dela ou até o servidor mandar). */
  protectedMeter: ProtectedMeter | null;
  /** Na fase `ended`: o motivo, quando o servidor disse (`null` nos demais casos). */
  endReason: RoomEndReason | null;
  /**
   * Quem está logado entra com o apelido do perfil: o lobby mostra esse apelido em vez do campo.
   * `null` para quem não tem conta.
   */
  accountNickname: string | null;
  /** Pessoas na sala agora e lotação desta sala (12 na direta, 6 na protegida), no lobby e na sala. */
  occupancy: { participants: number; capacity: number };
  selfId: string | null;
  isOwner: boolean;
  /** A própria pessoa é moderadora (promovida pelo dono). */
  isModerator: boolean;
  participants: ParticipantView[];
  /** Todos os vídeos anunciados na sala, assistidos ou não (veja `VideoView.watch`). */
  videos: VideoView[];
  /**
   * Vídeo em destaque, só entre os próprios e os que a pessoa assiste (`watching`); `null` sem
   * nenhum. Os demais ficam em miniatura ou em cartão.
   */
  featuredVideoId: string | null;
  chat: ChatMessage[];
  /** Reações recentes; cada uma some sozinha depois de alguns segundos. */
  reactions: ReactionEvent[];
  /**
   * Reações que esta pessoa pode enviar: as básicas (`REACTIONS`) mais as dos pacotes equipados,
   * como o servidor mandou no `welcome`. Antes dele, só as básicas.
   */
  availableReactions: string[];
  /** A própria pessoa entrou com conta (primeiro acesso concluído): pode enviar ouro pela sala. */
  canSendGold: boolean;
  /** Avisos recentes de ouro enviado na sala; cada um some sozinho depois de alguns segundos. */
  gifts: GiftEvent[];
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
  /** Só envia reação que está em `availableReactions`. */
  react(reaction: string): void;
  setHandRaised(raised: boolean): void;
  setMicMuted(muted: boolean): Promise<void>;
  /** Pede ao servidor e, se autorizado, captura e anuncia o vídeo (só quem assiste recebe). */
  startVideo(kind: VideoKind): Promise<void>;
  stopVideo(videoId: string): void;
  /**
   * Pede para assistir um vídeo de outra pessoa (`idle` → `requesting` → `watching`). No limite de
   * assistidos não envia e mostra o aviso `watchLimit` (o mesmo de quando o servidor recusa).
   */
  watchVideo(videoId: string): void;
  /** Para de assistir (volta a `idle` na hora). Um vídeo parado de propósito não reabre sozinho. */
  unwatchVideo(videoId: string): void;
  /** Só entre os próprios e os que a pessoa assiste (`watching`). */
  setFeaturedVideo(videoId: string): void;
  /** Só o dono Plus, na sala de link fixo dele. */
  setRoomTheme(theme: RoomTheme): void;
  /**
   * O dono contra qualquer outra pessoa; o moderador só contra participantes comuns (nunca contra o
   * dono nem contra outro moderador). O servidor confere de novo.
   */
  moderate(action: "mute" | "kick" | "ban", participantId: string): void;
  /** Só o dono: promove (`true`) ou rebaixa (`false`) um moderador. Vale quando o servidor confirma. */
  setModerator(participantId: string, moderator: boolean): void;
  /**
   * Envia ouro a outra pessoa da sala (as duas com conta). Resolve com a resposta do servidor. Um
   * envio por vez: o segundo, com o primeiro no ar, e um valor fora de 1..limite diário resolvem
   * `error` sem enviar; fora da sala conectada resolve `lost`. Quando dá certo, o aviso chega a todos
   * em `gifts`; a carteira não é atualizada aqui (use `useWallet().actions.refresh()`).
   */
  sendGold(participantId: string, amount: number): Promise<SendGoldResult>;
  copyLink(): Promise<void>;
  dismissNotice(): void;
}

/** `code` é o código da sala comum ou `@nome` para a sala de link fixo. */
export type UseRoom = (code: string) => { state: RoomState; actions: RoomActions };

/**
 * Falha ao criar a sala. Só na protegida: `plusRequired` (sem Plus ativo), `insufficientFunds`
 * (sem ouro), `protectedUnavailable` (retransmissão não configurada neste ambiente) e
 * `unauthorized` (sem conta logada ou sem o primeiro acesso).
 */
export type CreateRoomFailure =
  | "turnstileFailed"
  | "rateLimited"
  | "plusRequired"
  | "insufficientFunds"
  | "protectedUnavailable"
  | "unauthorized"
  | "error";

export type CreateRoomResult = { ok: true; code: string } | { ok: false; reason: CreateRoomFailure };

export interface CreateRoomOptions {
  /** Sala protegida: só dono com Plus ativo e ouro. Escolhida ao criar; não muda depois. */
  protected?: boolean;
}

/** Cria a sala, guarda o token de dono no navegador e devolve o código. */
export type CreateRoom = (turnstileToken: string, options?: CreateRoomOptions) => Promise<CreateRoomResult>;
