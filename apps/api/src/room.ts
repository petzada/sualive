import {
  CHAT_HISTORY_SIZE,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_PEOPLE,
  ROOM_MAX_VIDEOS,
  VIDEOS_PER_PERSON,
  WATCHED_VIDEOS_PER_PERSON,
  type RoomTheme,
} from "@sualive/config";
import {
  badgeSchema,
  clientMessageSchema,
  cosmeticsSchema,
  reactionListSchema,
  serverMessageSchema,
  WS_CLOSE,
  WS_PING_FRAME,
  WS_PONG_FRAME,
  type Badge,
  type ChatMessage,
  type ClientMessage,
  type Cosmetics,
  type GiftFailure,
  type Participant,
  type RoomSettings,
  type RoomVideo,
  type ServerMessage,
} from "@sualive/protocol";
import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { findUserById } from "./account";
import { isOnboarded } from "./auth/viewer";
import { getPlanStatus } from "./billing/plan";
import { randomToken, safeEqual, sha256 } from "./crypto";
import { createDb } from "./db";
import { users } from "./db/schema";
import type { AppEnv } from "./env";
import { allowedReactions } from "./shop/equipped";
import { transferGold, type LedgerOutcome } from "./wallet/ledger";

/**
 * Um Durable Object por sala: `idFromName(código)` na sala comum e `idFromName("@<nome>")` na sala
 * de link fixo de um assinante. Guarda no próprio storage a meta da sala, as admissões, os banidos
 * e o histórico do chat; o estado de cada conexão fica no attachment do WebSocket para sobreviver à
 * hibernação. Quando a sala acaba, apaga todo o storage.
 *
 * O Worker fala com ele por RPC (`create`, `ensureFixed`, `endFixed`, `info`, `admit`,
 * `checkAdmission`) e encaminha o WebSocket por `fetch`, com a identidade num cabeçalho interno que
 * o cliente não alcança (o Worker monta a requisição do zero). Conta, perfil, plano, cosméticos
 * equipados e reações de pacote chegam prontos do Worker, consultados no servidor a cada entrada e a
 * cada conexão. O envio de ouro pela sala (`gift.send`) usa o livro-razão (`wallet/ledger.ts`).
 *
 * Sala de link fixo: não é criada por `create`; o Worker chama `ensureFixed` enquanto o dono tem
 * Plus. Ela não acaba quando esvazia: depois de ROOM_EMPTY_TTL_MS vazia, apaga o chat, as admissões e
 * os banidos (a "sessão" da sala acaba, o link continua). Enquanto há gente, um alarme confere a
 * cada ROOM_EMPTY_TTL_MS se o dono ainda tem Plus e ainda é dono do @nome; se não, a sala acaba.
 */

/** Cabeçalho interno com a identidade (JSON em encodeURIComponent), montado pelo Worker. */
export const ROOM_IDENTITY_HEADER = "x-sualive-identity";

/** Conta de quem entra logado, com o plano consultado no servidor. */
export interface RoomAccount {
  userId: string;
  handle: string;
  avatarUrl: string | null;
  badges: Badge[];
  /** Plus ativo agora (segundo a cobrança). */
  plus: boolean;
  /** Limite de vídeos simultâneos desta pessoa (pelo plano dela, não o do dono). */
  videosPerPerson: number;
  /** Cosméticos equipados, lidos do D1 pelo Worker; nulo se nada está equipado. */
  cosmetics: Cosmetics | null;
  /** Reações dos pacotes equipados (sem as básicas). */
  reactions: string[];
}

export interface RoomIdentity {
  participantId: string;
  nickname: string;
  ip: string;
  /** `null` para quem não tem conta. */
  account: RoomAccount | null;
}

/** Dono da sala de link fixo, resolvido pelo Worker a partir do @nome. */
export interface FixedOwner {
  userId: string;
  handle: string;
  theme: RoomTheme;
}

export type AdmitResult = "ok" | "room_ended" | "banned" | "room_full";
export type AdmissionCheck = "ok" | "room_ended" | "banned" | "unauthorized";
export interface RoomInfo {
  status: "open" | "ended";
  participants: number;
  fixed: boolean;
  protected: boolean;
}

interface RoomMeta {
  /** Hash do token do dono. Nulo na sala de link fixo (o dono é reconhecido pela conta). */
  ownerTokenHash: string | null;
  /** Sal dos hashes de IP guardados para banimento. */
  ipSalt: string;
  createdAt: number;
  chatSeq: number;
  /** Presente só na sala de link fixo. */
  fixed?: FixedOwner;
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
  userId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  badges: Badge[];
  videosPerPerson: number;
  cosmetics: Cosmetics | null;
  /** Reações de pacote desta pessoa (as básicas valem para todos e não ficam aqui). */
  packReactions: string[];
}

const META_KEY = "meta";
const ADMISSION_PREFIX = "admission:";
const BAN_PREFIX = "ban:";
const BAN_PARTICIPANT_PREFIX = "ban:participant:";
const BAN_IP_PREFIX = "ban:ip:";
const CHAT_PREFIX = "chat:";
/** Máximo de chaves por chamada de `storage.delete`. */
const DELETE_BATCH = 128;

// Entrega 4: valor provisório do contrato; a tarefa da sala troca pelo definitivo.
const DEFAULT_ROOM: RoomSettings = {
  theme: "default",
  fixed: false,
  ownerHandle: null,
  protected: false,
  capacity: ROOM_MAX_PEOPLE,
  maxVideos: null,
};

function chatKey(seq: number): string {
  return `${CHAT_PREFIX}${seq.toString().padStart(12, "0")}`;
}

export class RoomBase extends DurableObject<AppEnv> {
  /** Cópia em memória da meta (`null` = sala inexistente ou já encerrada). */
  private meta: RoomMeta | null = null;
  /**
   * Pessoas com um envio de ouro em andamento. Só em memória: o objeto não hiberna enquanto espera o
   * D1, então o conjunto não se perde no meio de um envio.
   */
  private readonly giftsInFlight = new Set<string>();

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    // Responde ao ping sem acordar o objeto hibernado.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING_FRAME, WS_PONG_FRAME));
    void ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<RoomMeta>(META_KEY)) ?? null;
    });
  }

  // ---------- RPC chamado pelo Worker ----------

  /** Inicializa a sala comum. `false` se o código já está em uso. */
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

  /**
   * A sala de link fixo existe enquanto o dono tem Plus (o Worker confere antes de chamar). Cria a
   * meta se faltar e atualiza o tema; se o storage era de outra conta (o @nome mudou de dono),
   * começa do zero.
   */
  async ensureFixed(owner: FixedOwner): Promise<void> {
    const current = this.meta;
    if (current && current.fixed?.userId !== owner.userId) await this.end();
    const meta = this.meta;
    if (!meta) {
      const created: RoomMeta = {
        ownerTokenHash: null,
        ipSalt: randomToken(16),
        createdAt: Date.now(),
        chatSeq: 0,
        fixed: { ...owner },
      };
      await this.ctx.storage.put(META_KEY, created);
      this.meta = created;
      return;
    }
    const fixed = meta.fixed!;
    if (fixed.theme === owner.theme && fixed.handle === owner.handle) return;
    meta.fixed = { ...owner };
    await this.ctx.storage.put(META_KEY, meta);
    // O dono trocou o tema pelo perfil: vale na hora para quem está na sala.
    this.broadcast({ type: "room.updated", room: this.settings() });
  }

  /** O dono do link fixo perdeu o Plus (ou o @nome): avisa, desconecta todos e apaga a sala. */
  async endFixed(): Promise<void> {
    if (this.meta?.fixed) await this.end();
  }

  /** Estado público. Só lê: não cria nada no storage para código inexistente. */
  info(): RoomInfo {
    if (!this.meta) return { status: "ended", participants: 0, fixed: false, protected: false };
    return {
      status: "open",
      participants: this.presentIds().size,
      fixed: Boolean(this.meta.fixed),
      protected: false,
    };
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

    // A mesma sessão (ou a mesma conta) em outra conexão: a antiga sai.
    for (const old of this.liveSockets()) {
      if (attachmentOf(old).participantId !== identity.participantId) continue;
      this.depart(old, "left");
      closeQuietly(old, WS_CLOSE.replaced, "replaced");
    }

    const account = identity.account;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [identity.participantId]);
    const connection: Connection = {
      participantId: identity.participantId,
      // Quem tem conta usa o apelido atual do perfil; quem não tem, o do join nesta sala.
      nickname: account ? identity.nickname : admission.nickname,
      ipHash,
      joinedAt: Date.now(),
      ready: false,
      isOwner: false,
      micMuted: true,
      handRaised: false,
      videos: [],
      chatTimes: [],
      departed: false,
      userId: account?.userId ?? null,
      handle: account?.handle ?? null,
      avatarUrl: account?.avatarUrl ?? null,
      badges: account?.badges ?? [],
      videosPerPerson: account?.videosPerPerson ?? VIDEOS_PER_PERSON,
      cosmetics: account?.cosmetics ?? null,
      packReactions: account?.reactions ?? [],
    };
    server.serializeAttachment(connection);
    // Alguém chegou: a sala comum cancela o encerramento; a de link fixo passa a conferir o plano.
    await this.scheduleOccupied();
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
        // Só as reações da lista desta pessoa (básicas + pacotes equipados ao conectar).
        if (!reactionsOf(connection).includes(message.reaction)) {
          return this.send(ws, { type: "error", code: "not_allowed" });
        }
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
      case "room.setTheme":
        return this.onSetTheme(ws, message.theme);
      case "gift.send":
        return this.onGift(ws, message);
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
    const meta = this.meta;
    if (!meta) return;
    const occupied = this.liveSockets().length > 0;

    if (!meta.fixed) {
      // Alguém voltou e o alarme ficou para trás: a sala continua.
      if (occupied) return;
      return this.end();
    }

    // Link fixo: o dono ainda tem Plus e ainda é dono deste @nome?
    if (!(await this.ownerStillQualifies(meta.fixed))) return this.end();
    if (!this.meta) return;
    if (this.liveSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EMPTY_TTL_MS);
      return;
    }
    // Vazia pelo prazo: a sala continua, mas nada da conversa fica guardado.
    await this.clearSession();
  }

  /** Acaba a sala: avisa e desconecta todos e apaga todo o storage. */
  private async end(): Promise<void> {
    const ended = JSON.stringify(serverMessageSchema.parse({ type: "room.ended" }));
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(ended);
      } catch {
        // conexão já fechada
      }
      // Saída tratada sem avisar os demais: todos recebem `room.ended`.
      try {
        const connection = attachmentOf(ws);
        if (connection) ws.serializeAttachment({ ...connection, departed: true, videos: [] });
      } catch {
        // conexão já encerrada
      }
      closeQuietly(ws, WS_CLOSE.roomEnded, "room_ended");
    }
    this.meta = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /** Sala de link fixo vazia: apaga chat, admissões e banidos; a sala (e o tema) continuam. */
  private async clearSession(): Promise<void> {
    const keys: string[] = [];
    for (const prefix of [CHAT_PREFIX, ADMISSION_PREFIX, BAN_PREFIX]) {
      keys.push(...(await this.ctx.storage.list({ prefix })).keys());
    }
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.ctx.storage.delete(keys.slice(i, i + DELETE_BATCH));
    }
    const meta = this.meta;
    if (!meta) return;
    meta.chatSeq = 0;
    meta.ipSalt = randomToken(16);
    await this.ctx.storage.put(META_KEY, meta);
  }

  private async ownerStillQualifies(owner: FixedOwner): Promise<boolean> {
    const user = await findUserById(this.env, owner.userId);
    if (!user || user.handle !== owner.handle || !isOnboarded(user)) return false;
    return (await getPlanStatus(this.env, owner.userId)).plan.plus;
  }

  private async scheduleOccupied(): Promise<void> {
    if (this.meta?.fixed) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EMPTY_TTL_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
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
    const userId = attachmentOf(ws).userId;
    // Link fixo: o dono é a conta dona do @nome (o token não vale). Sala comum: o token secreto.
    const isOwner = meta.fixed
      ? userId !== null && userId === meta.fixed.userId
      : ownerToken && meta.ownerTokenHash
        ? safeEqual(await sha256(ownerToken), meta.ownerTokenHash)
        : false;
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
      room: this.settings(),
      // Entrega 4: valor provisório do contrato; a tarefa da sala troca pelo definitivo.
      limits: {
        videosPerPerson: connection.videosPerPerson,
        reactions: reactionsOf(connection),
        watchedVideos: WATCHED_VIDEOS_PER_PERSON,
        relayVideo: false,
      },
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
    // Limite pelo plano de cada pessoa, decidido no servidor ao conectar.
    if (connection.videos.length >= connection.videosPerPerson) {
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
    // join); banido fica barrado, por sessão (ou conta) e por IP, até a sala acabar.
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

  /** Tema: só o dono Plus, na sala de link fixo dele. Grava no perfil e vale na hora para todos. */
  private async onSetTheme(ws: WebSocket, theme: RoomTheme): Promise<void> {
    const meta = this.meta;
    const actor = attachmentOf(ws);
    const owner = meta?.fixed;
    if (!owner || !actor.isOwner || actor.userId !== owner.userId) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    if (!(await getPlanStatus(this.env, owner.userId)).plan.plus) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    await createDb(this.env.DB).update(users).set({ roomTheme: theme }).where(eq(users.id, owner.userId));
    // Relê depois dos awaits: a sala pode ter acabado.
    const current = this.meta;
    if (!current?.fixed || current.fixed.userId !== owner.userId) return;
    current.fixed = { ...current.fixed, theme };
    await this.ctx.storage.put(META_KEY, current);
    this.broadcast({ type: "room.updated", room: this.settings() });
  }

  /**
   * Envia ouro a outra pessoa da sala: as duas com conta, presentes e diferentes. Mesmo livro-razão
   * e mesmo limite diário do envio por @nome (`transferGold`). Responde `gift.result` só a quem
   * enviou e, se deu certo, avisa a sala inteira com `gift`. Um envio por vez por pessoa: o segundo
   * pedido enquanto o primeiro está em andamento é recusado.
   */
  private async onGift(ws: WebSocket, message: Extract<ClientMessage, { type: "gift.send" }>): Promise<void> {
    const sender = attachmentOf(ws);
    const { requestId, amount } = message;
    const fail = (reason: GiftFailure) =>
      this.send(ws, { type: "gift.result", requestId, ok: false, reason });

    if (message.to === sender.participantId || sender.userId === null) return fail("not_allowed");
    const target = this.findReady(message.to);
    if (!target) return fail("not_found");
    const recipient = attachmentOf(target);
    if (recipient.userId === null || recipient.userId === sender.userId) return fail("not_allowed");
    if (this.giftsInFlight.has(sender.participantId)) return fail("error");

    const fromUserId = sender.userId;
    const toUserId = recipient.userId;
    // Apelidos do momento do envio (alguém pode sair durante a transferência).
    const notice: ServerMessage = {
      type: "gift",
      from: sender.participantId,
      fromNickname: sender.nickname,
      to: recipient.participantId,
      toNickname: recipient.nickname,
      amount,
    };
    this.giftsInFlight.add(sender.participantId);
    let outcome: LedgerOutcome | "not_allowed" | "error";
    try {
      // As contas foram conferidas ao conectar; confere de novo (uma delas pode ter sido excluída).
      const [from, to] = await Promise.all([
        findUserById(this.env, fromUserId),
        findUserById(this.env, toUserId),
      ]);
      outcome =
        from && to && isOnboarded(from) && isOnboarded(to)
          ? await transferGold(this.env, { fromUserId, toUserId, amount, now: Date.now() })
          : "not_allowed";
    } catch (error) {
      console.error("gift.send: falha na transferência", error);
      outcome = "error";
    } finally {
      this.giftsInFlight.delete(sender.participantId);
    }

    if (outcome !== "ok") {
      return fail(
        outcome === "insufficient_funds" || outcome === "daily_limit" || outcome === "not_allowed"
          ? outcome
          : "error",
      );
    }
    this.send(ws, { type: "gift.result", requestId, ok: true });
    this.broadcast(notice);
  }

  // ---------- Auxiliares ----------

  private settings(): RoomSettings {
    const fixed = this.meta?.fixed;
    if (!fixed) return DEFAULT_ROOM;
    return { ...DEFAULT_ROOM, theme: fixed.theme, fixed: true, ownerHandle: fixed.handle };
  }

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
    handle: connection.handle,
    avatarUrl: connection.avatarUrl,
    badges: connection.badges,
    isOwner: connection.isOwner,
    micMuted: connection.micMuted,
    handRaised: connection.handRaised,
    videos: connection.videos,
    joinedAt: connection.joinedAt,
    // Lidos da conta ao conectar; trocar o que está equipado vale na próxima conexão.
    cosmetics: connection.userId !== null ? (connection.cosmetics ?? null) : null,
    canReceiveGold: connection.userId !== null,
    // Entrega 4: valor provisório do contrato; a tarefa da sala troca pelo definitivo.
    isModerator: false,
  };
}

/** Reações que esta pessoa pode enviar: as básicas e as dos pacotes equipados. */
function reactionsOf(connection: Connection): string[] {
  return allowedReactions(connection.packReactions ?? []);
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

function parseAccount(value: unknown): RoomAccount | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const { userId, handle, avatarUrl, badges, plus, videosPerPerson, cosmetics, reactions } = value as Record<
    string,
    unknown
  >;
  if (typeof userId !== "string" || typeof handle !== "string" || typeof plus !== "boolean") return undefined;
  if (avatarUrl !== null && typeof avatarUrl !== "string") return undefined;
  if (typeof videosPerPerson !== "number" || !Number.isInteger(videosPerPerson) || videosPerPerson < 1) {
    return undefined;
  }
  const parsedBadges = badgeSchema.array().safeParse(badges);
  if (!parsedBadges.success) return undefined;
  // Cosméticos e reações de pacote vêm do D1, lidos pelo Worker; validados pelos esquemas.
  const parsedCosmetics = cosmeticsSchema.nullable().safeParse(cosmetics ?? null);
  const parsedReactions = reactionListSchema.safeParse(reactions ?? []);
  if (!parsedCosmetics.success || !parsedReactions.success) return undefined;
  return {
    userId,
    handle,
    avatarUrl,
    badges: parsedBadges.data,
    plus,
    videosPerPerson,
    cosmetics: parsedCosmetics.data,
    reactions: parsedReactions.data,
  };
}

function parseIdentity(header: string | null): RoomIdentity | null {
  if (!header) return null;
  try {
    const value = JSON.parse(decodeURIComponent(header)) as Record<string, unknown>;
    if (
      typeof value.participantId !== "string" ||
      typeof value.nickname !== "string" ||
      typeof value.ip !== "string"
    ) {
      return null;
    }
    const account = parseAccount(value.account ?? null);
    if (account === undefined) return null;
    return { participantId: value.participantId, nickname: value.nickname, ip: value.ip, account };
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
