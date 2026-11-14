import {
  CHAT_HISTORY_SIZE,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_PEOPLE,
  ROOM_MAX_VIDEOS,
  VIDEOS_PER_PERSON,
} from "@sualive/config";
import {
  clientMessageSchema,
  serverMessageSchema,
  WS_CLOSE,
  WS_PING_FRAME,
  WS_PONG_FRAME,
  type ChatMessage,
  type ClientMessage,
  type Participant,
  type RoomVideo,
  type ServerMessage,
} from "@sualive/protocol";
import { DurableObject } from "cloudflare:workers";
import { randomToken, safeEqual, sha256 } from "./crypto";
import type { AppEnv } from "./env";

/**
 * Um Durable Object por sala (`idFromName(código)`). Guarda no próprio storage a meta da sala, as
 * admissões, os banidos e o histórico do chat; o estado de cada conexão fica no attachment do
 * WebSocket para sobreviver à hibernação. Quando a sala acaba, apaga todo o storage.
 *
 * O Worker fala com ele por RPC (`create`, `info`, `admit`, `checkAdmission`) e encaminha o
 * WebSocket por `fetch`, com a identidade num cabeçalho interno que o cliente não alcança (o
 * Worker monta a requisição do zero).
 */

/** Cabeçalho interno com a identidade (JSON em encodeURIComponent), montado pelo Worker. */
export const ROOM_IDENTITY_HEADER = "x-sualive-identity";

export interface RoomIdentity {
  participantId: string;
  nickname: string;
  ip: string;
}

export type AdmitResult = "ok" | "room_ended" | "banned" | "room_full";
export type AdmissionCheck = "ok" | "room_ended" | "banned" | "unauthorized";
export interface RoomInfo {
  status: "open" | "ended";
  participants: number;
}

interface RoomMeta {
  ownerTokenHash: string;
  /** Sal dos hashes de IP guardados para banimento. */
  ipSalt: string;
  createdAt: number;
  chatSeq: number;
}

interface Admission {
  nickname: string;
  admittedAt: number;
}

/** Estado da conexão, no attachment do WebSocket (limite de 2 KiB). */
interface Connection {
  participantId: string;
  nickname: string;
  ipHash: string;
  joinedAt: number;
  /** Já mandou `hello`: está na lista de pessoas. */
  ready: boolean;
  isOwner: boolean;
  micMuted: boolean;
  handRaised: boolean;
  videos: RoomVideo[];
  /** Horários das mensagens recentes do chat, para o limite por pessoa. */
  chatTimes: number[];
  /** Saída já tratada (removido, substituído ou fechado). */
  departed: boolean;
}

const META_KEY = "meta";
const ADMISSION_PREFIX = "admission:";
const BAN_PARTICIPANT_PREFIX = "ban:participant:";
const BAN_IP_PREFIX = "ban:ip:";
const CHAT_PREFIX = "chat:";

function chatKey(seq: number): string {
  return `${CHAT_PREFIX}${seq.toString().padStart(12, "0")}`;
}

export class RoomBase extends DurableObject<AppEnv> {
  /** Cópia em memória da meta (`null` = sala inexistente ou já encerrada). */
  private meta: RoomMeta | null = null;

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    // Responde ao ping sem acordar o objeto hibernado.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING_FRAME, WS_PONG_FRAME));
    void ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<RoomMeta>(META_KEY)) ?? null;
    });
  }

  // ---------- RPC chamado pelo Worker ----------

  /** Inicializa a sala. `false` se o código já está em uso. */
  async create(ownerTokenHash: string): Promise<boolean> {
    if (this.meta) return false;
    const meta: RoomMeta = {
      ownerTokenHash,
      ipSalt: randomToken(16),
      createdAt: Date.now(),
      chatSeq: 0,
    };
    await this.ctx.storage.put(META_KEY, meta);
    this.meta = meta;
    // Sala criada e nunca usada também expira.
    await this.ctx.storage.setAlarm(Date.now() + ROOM_EMPTY_TTL_MS);
    return true;
  }

  /** Estado público. Só lê: não cria nada no storage para código inexistente. */
  info(): RoomInfo {
    if (!this.meta) return { status: "ended", participants: 0 };
    return { status: "open", participants: this.presentIds().size };
  }

  /** Registra a admissão de uma sessão (depois do Turnstile), recusando banidos e sala cheia. */
  async admit(identity: RoomIdentity): Promise<AdmitResult> {
    const meta = this.meta;
    if (!meta) return "room_ended";
    const ipHash = await this.hashIp(meta, identity.ip);
    if (await this.isBanned(identity.participantId, ipHash)) return "banned";
    if (this.isFullFor(identity.participantId)) return "room_full";
    // A sala pode ter acabado durante os awaits.
    if (!this.meta) return "room_ended";
    const admission: Admission = { nickname: identity.nickname, admittedAt: Date.now() };
    await this.ctx.storage.put(ADMISSION_PREFIX + identity.participantId, admission);
    // Sala ainda vazia: o prazo recomeça para dar tempo de a pessoa conectar.
    if (this.liveSockets().length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EMPTY_TTL_MS);
    }
    return "ok";
  }

  /** A sessão foi admitida nesta sala (e não está banida, nem pelo IP)? */
  async checkAdmission(participantId: string, ip: string): Promise<AdmissionCheck> {
    const meta = this.meta;
    if (!meta) return "room_ended";
    if (await this.isBanned(participantId, await this.hashIp(meta, ip))) return "banned";
    const admission = await this.ctx.storage.get<Admission>(ADMISSION_PREFIX + participantId);
    return admission ? "ok" : "unauthorized";
  }

  // ---------- WebSocket ----------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response(null, { status: 426 });
    }
    const identity = parseIdentity(request.headers.get(ROOM_IDENTITY_HEADER));
    if (!identity) return new Response(null, { status: 400 });

    const meta = this.meta;
    if (!meta) return refuse(WS_CLOSE.roomEnded, "room_ended");
    const ipHash = await this.hashIp(meta, identity.ip);
    if (await this.isBanned(identity.participantId, ipHash)) {
      return refuse(WS_CLOSE.banned, "banned");
    }
    const admission = await this.ctx.storage.get<Admission>(ADMISSION_PREFIX + identity.participantId);
    if (!admission || !this.meta) {
      return refuse(this.meta ? WS_CLOSE.unauthorized : WS_CLOSE.roomEnded, "unauthorized");
    }
    // Corrida entre dois joins: a lotação vale também aqui.
    if (this.isFullFor(identity.participantId)) return refuse(WS_CLOSE.roomFull, "room_full");

    // A mesma sessão em outra conexão (outra aba): a antiga sai.
    for (const old of this.liveSockets()) {
      if (attachmentOf(old).participantId !== identity.participantId) continue;
      this.depart(old, "left");
      closeQuietly(old, WS_CLOSE.replaced, "replaced");
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [identity.participantId]);
    const connection: Connection = {
      participantId: identity.participantId,
      nickname: admission.nickname,
      ipHash,
      joinedAt: Date.now(),
      ready: false,
      isOwner: false,
      micMuted: true,
      handRaised: false,
      videos: [],
      chatTimes: [],
      departed: false,
    };
    server.serializeAttachment(connection);
    // Alguém chegou: cancela o encerramento.
    await this.ctx.storage.deleteAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const connection = attachmentOf(ws);
    if (connection.departed) return;
    const message = parseClientMessage(raw);
    if (!message) return this.send(ws, { type: "error", code: "invalid_message" });

    if (message.type === "hello") return this.onHello(ws, message.ownerToken);
    // Antes do `hello`, nada mais é aceito.
    if (!connection.ready) return this.send(ws, { type: "error", code: "invalid_message" });

    switch (message.type) {
      case "ping":
        return this.send(ws, { type: "pong" });
      case "chat.send":
        return this.onChat(ws, message.text);
      case "reaction.send":
        return this.broadcast({
          type: "reaction",
          from: connection.participantId,
          reaction: message.reaction,
        });
      case "hand.set":
        return this.update(ws, (c) => (c.handRaised = message.raised));
      case "mic.set":
        return this.update(ws, (c) => (c.micMuted = message.muted));
      case "video.request":
        return this.onVideoRequest(ws, message.requestId, message.kind);
      case "video.stop":
        return this.onVideoStop(ws, message.videoId);
      case "signal":
        return this.onSignal(ws, message);
      case "moderate":
        return this.onModerate(ws, message);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.depart(ws, "left");
    closeQuietly(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    await this.scheduleEndIfEmpty();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.depart(ws, "left");
    await this.scheduleEndIfEmpty();
  }

  // ---------- Encerramento ----------

  override async alarm(): Promise<void> {
    // Alguém voltou e o alarme ficou para trás: a sala continua.
    if (this.liveSockets().length > 0) return;
    const ended = JSON.stringify(serverMessageSchema.parse({ type: "room.ended" }));
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(ended);
      } catch {
        // conexão já fechada
      }
      closeQuietly(ws, WS_CLOSE.roomEnded, "room_ended");
    }
    this.meta = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async scheduleEndIfEmpty(): Promise<void> {
    if (!this.meta || this.liveSockets().length > 0) return;
    await this.ctx.storage.setAlarm(Date.now() + ROOM_EMPTY_TTL_MS);
  }

  // ---------- Mensagens ----------

  private async onHello(ws: WebSocket, ownerToken: string | undefined): Promise<void> {
    if (attachmentOf(ws).ready) return this.send(ws, { type: "error", code: "invalid_message" });
    const meta = this.meta;
    if (!meta) return;
    const isOwner = ownerToken ? safeEqual(await sha256(ownerToken), meta.ownerTokenHash) : false;
    const history = await this.ctx.storage.list<ChatMessage>({ prefix: CHAT_PREFIX });

    // Depois dos awaits, relê o estado: a conexão pode ter saído ou já ter dito hello.
    const connection = attachmentOf(ws);
    if (connection.departed || connection.ready || ws.readyState !== WebSocket.OPEN) return;
    if (isOwner) {
      // No máximo um dono por vez: quem chega com o token assume.
      for (const other of this.readySockets()) {
        const state = attachmentOf(other);
        if (!state.isOwner) continue;
        state.isOwner = false;
        other.serializeAttachment(state);
        this.broadcast({ type: "participant.updated", participant: toParticipant(state) });
      }
    }
    connection.ready = true;
    connection.isOwner = isOwner;
    connection.micMuted = true;
    ws.serializeAttachment(connection);

    this.send(ws, {
      type: "welcome",
      // Provisório (contrato da entrega 2): a tarefa das salas com conta preenche de verdade.
      room: { theme: "default", fixed: false, ownerHandle: null },
      limits: { videosPerPerson: VIDEOS_PER_PERSON },
      self: connection.participantId,
      participants: this.readySockets().map((s) => toParticipant(attachmentOf(s))),
      chat: [...history.values()].slice(-CHAT_HISTORY_SIZE),
    });
    this.broadcast({ type: "participant.joined", participant: toParticipant(connection) }, ws);
  }

  private async onChat(ws: WebSocket, text: string): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    const connection = attachmentOf(ws);
    const now = Date.now();
    const recent = connection.chatTimes.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (recent.length >= CHAT_RATE_MAX) {
      connection.chatTimes = recent;
      ws.serializeAttachment(connection);
      return this.send(ws, { type: "error", code: "rate_limited" });
    }
    connection.chatTimes = [...recent, now];
    ws.serializeAttachment(connection);

    meta.chatSeq += 1;
    const seq = meta.chatSeq;
    const message: ChatMessage = {
      id: `${seq}-${randomToken(6)}`,
      from: connection.participantId,
      nickname: connection.nickname,
      text,
      sentAt: now,
    };
    this.broadcast({ type: "chat.message", message });
    await this.ctx.storage.put<unknown>({ [META_KEY]: meta, [chatKey(seq)]: message });
    if (seq > CHAT_HISTORY_SIZE) await this.ctx.storage.delete(chatKey(seq - CHAT_HISTORY_SIZE));
  }

  private onVideoRequest(ws: WebSocket, requestId: string, kind: RoomVideo["kind"]): void {
    const connection = attachmentOf(ws);
    if (connection.videos.length >= VIDEOS_PER_PERSON) {
      return this.send(ws, { type: "video.denied", requestId, reason: "person_limit" });
    }
    const roomVideos = this.readySockets().reduce((total, s) => total + attachmentOf(s).videos.length, 0);
    if (roomVideos >= ROOM_MAX_VIDEOS) {
      return this.send(ws, { type: "video.denied", requestId, reason: "room_limit" });
    }
    const video: RoomVideo = { id: randomToken(12), kind };
    connection.videos = [...connection.videos, video];
    ws.serializeAttachment(connection);
    this.send(ws, { type: "video.granted", requestId, video });
    this.broadcast({ type: "participant.updated", participant: toParticipant(connection) });
  }

  private onVideoStop(ws: WebSocket, videoId: string): void {
    const connection = attachmentOf(ws);
    if (!connection.videos.some((v) => v.id === videoId)) {
      return this.send(ws, { type: "error", code: "not_found" });
    }
    this.update(ws, (c) => (c.videos = c.videos.filter((v) => v.id !== videoId)));
  }

  private onSignal(ws: WebSocket, message: Extract<ClientMessage, { type: "signal" }>): void {
    const from = attachmentOf(ws).participantId;
    const target = message.to === from ? undefined : this.findReady(message.to);
    if (!target) return this.send(ws, { type: "error", code: "not_found" });
    this.send(target, { type: "signal", from, data: message.data });
  }

  private async onModerate(
    ws: WebSocket,
    message: Extract<ClientMessage, { type: "moderate" }>,
  ): Promise<void> {
    const actor = attachmentOf(ws);
    if (!actor.isOwner || message.target === actor.participantId) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    const target = this.findReady(message.target);
    if (!target) return this.send(ws, { type: "error", code: "not_found" });

    if (message.action === "mute") {
      this.send(target, { type: "force.muted" });
      this.update(target, (c) => (c.micMuted = true));
      return;
    }

    const reason = message.action === "ban" ? "banned" : "kicked";
    const state = attachmentOf(target);
    // Primeiro tira da sala (síncrono), depois grava: removido perde a admissão (volta pelo
    // join); banido fica barrado, por sessão e por IP, até a sala acabar.
    this.send(target, { type: "removed", reason });
    this.depart(target, reason);
    closeQuietly(target, reason === "banned" ? WS_CLOSE.banned : WS_CLOSE.kicked, reason);
    await this.ctx.storage.delete(ADMISSION_PREFIX + state.participantId);
    if (reason === "banned") {
      await this.ctx.storage.put({
        [BAN_PARTICIPANT_PREFIX + state.participantId]: true,
        [BAN_IP_PREFIX + state.ipHash]: true,
      });
    }
    await this.scheduleEndIfEmpty();
  }

  // ---------- Auxiliares ----------

  /** Aplica uma mudança no estado da conexão e avisa todos com `participant.updated`. */
  private update(ws: WebSocket, change: (connection: Connection) => void): void {
    const connection = attachmentOf(ws);
    change(connection);
    ws.serializeAttachment(connection);
    this.broadcast({ type: "participant.updated", participant: toParticipant(connection) });
  }

  /** Trata a saída de uma conexão uma única vez: libera vídeos e avisa os demais. */
  private depart(ws: WebSocket, reason: "left" | "kicked" | "banned"): void {
    let connection: Connection;
    try {
      connection = attachmentOf(ws);
    } catch {
      return;
    }
    if (connection.departed) return;
    connection.departed = true;
    connection.videos = [];
    try {
      ws.serializeAttachment(connection);
    } catch {
      // conexão já encerrada
    }
    if (connection.ready) {
      this.broadcast({ type: "participant.left", id: connection.participantId, reason }, ws);
    }
  }

  /** Conexões abertas e ainda não tratadas como saída. */
  private liveSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN && !attachmentOf(ws).departed);
  }

  /** Conexões que já disseram `hello` (a lista de pessoas). */
  private readySockets(): WebSocket[] {
    return this.liveSockets().filter((ws) => attachmentOf(ws).ready);
  }

  private presentIds(): Set<string> {
    return new Set(this.liveSockets().map((ws) => attachmentOf(ws).participantId));
  }

  private isFullFor(participantId: string): boolean {
    const present = this.presentIds();
    present.delete(participantId);
    return present.size >= ROOM_MAX_PEOPLE;
  }

  private findReady(participantId: string): WebSocket | undefined {
    return this.readySockets().find((ws) => attachmentOf(ws).participantId === participantId);
  }

  private async isBanned(participantId: string, ipHash: string): Promise<boolean> {
    const found = await this.ctx.storage.get([
      BAN_PARTICIPANT_PREFIX + participantId,
      BAN_IP_PREFIX + ipHash,
    ]);
    return found.size > 0;
  }

  private hashIp(meta: RoomMeta, ip: string): Promise<string> {
    return sha256(`ip:${meta.ipSalt}:${ip}`);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    sendRaw(ws, JSON.stringify(serverMessageSchema.parse(message)));
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(serverMessageSchema.parse(message));
    for (const ws of this.readySockets()) if (ws !== except) sendRaw(ws, data);
  }
}

function attachmentOf(ws: WebSocket): Connection {
  return ws.deserializeAttachment() as Connection;
}

function toParticipant(connection: Connection): Participant {
  return {
    id: connection.participantId,
    nickname: connection.nickname,
    // Provisório (contrato da entrega 2): a tarefa das salas com conta preenche de verdade.
    handle: null,
    avatarUrl: null,
    badges: [],
    isOwner: connection.isOwner,
    micMuted: connection.micMuted,
    handRaised: connection.handRaised,
    videos: connection.videos,
    joinedAt: connection.joinedAt,
  };
}

function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

function parseIdentity(header: string | null): RoomIdentity | null {
  if (!header) return null;
  try {
    const value = JSON.parse(decodeURIComponent(header)) as Partial<RoomIdentity>;
    if (
      typeof value.participantId !== "string" ||
      typeof value.nickname !== "string" ||
      typeof value.ip !== "string"
    ) {
      return null;
    }
    return { participantId: value.participantId, nickname: value.nickname, ip: value.ip };
  } catch {
    return null;
  }
}

function sendRaw(ws: WebSocket, data: string): void {
  try {
    ws.send(data);
  } catch {
    // conexão fechando: a saída é tratada no webSocketClose
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // já fechada
  }
}

/** Recusa o WebSocket com um código de `WS_CLOSE` (o navegador não lê o status HTTP do upgrade). */
export function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}
