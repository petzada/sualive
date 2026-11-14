import { captureException } from "@sentry/cloudflare";
import {
  CHAT_HISTORY_SIZE,
  FIXED_ROOM_MODERATORS_MAX,
  METER_INTERVAL_MS,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_GRACE_MS,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  RELAY_VIDEO_GOLD_PER_HOUR,
  ROOM_EMPTY_TTL_MS,
  ROOM_MAX_PEOPLE,
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
  type WatchReason,
} from "@sualive/protocol";
import { DurableObject } from "cloudflare:workers";
import { and, count, eq } from "drizzle-orm";
import { findUserById } from "./account";
import { isOnboarded } from "./auth/viewer";
import { getPlanStatus } from "./billing/plan";
import { randomToken, safeEqual, sha256 } from "./crypto";
import { createDb } from "./db";
import { roomModerators, users } from "./db/schema";
import type { AppEnv } from "./env";
import { protectedSignal } from "./room/ice";
import { takeRate, type RateKind, type RateState } from "./room/rate";
import { allowedReactions } from "./shop/equipped";
import { getWallet, transferGold, type LedgerOutcome } from "./wallet/ledger";
import { debitMeter, meterCharge, meterRemainingMs, meterWarnings } from "./wallet/meter";

/**
 * Um Durable Object por sala: `idFromName(código)` na sala comum e `idFromName("@<nome>")` na sala
 * de link fixo de um assinante. Guarda no próprio storage a meta da sala, as admissões, os banidos,
 * o histórico do chat, os moderadores, os limites de frequência, o que cada par informou sobre
 * retransmissão e o estado dos medidores de cobrança; o estado de cada conexão (inclusive o que ela
 * assiste) fica no attachment do WebSocket para sobreviver à hibernação. Quando a sala acaba, apaga
 * todo o storage.
 *
 * O Worker fala com ele por RPC (`create`, `ensureFixed`, `endFixed`, `info`, `admit`,
 * `checkAdmission`) e encaminha o WebSocket por `fetch`, com a identidade num cabeçalho interno que
 * o cliente não alcança (o Worker monta a requisição do zero). Conta, perfil, plano, cosméticos
 * equipados e reações de pacote chegam prontos do Worker, consultados no servidor a cada entrada e a
 * cada conexão. O envio de ouro pela sala (`gift.send`) usa o livro-razão (`wallet/ledger.ts`); as
 * cobranças por minuto usam `wallet/meter.ts`.
 *
 * Sala de link fixo: não é criada por `create`; o Worker chama `ensureFixed` enquanto o dono tem
 * Plus. Ela não acaba quando esvazia: depois de ROOM_EMPTY_TTL_MS vazia, apaga o chat, as admissões,
 * os banidos e os moderadores convidados (a "sessão" da sala acaba, o link continua). Enquanto há
 * gente, o alarme confere a cada ROOM_EMPTY_TTL_MS se o dono ainda tem Plus e ainda é dono do @nome.
 *
 * Entrega 4:
 * - Vídeo sob demanda: um vídeo autorizado é só um anúncio. Cada pessoa pede `video.watch`; o objeto
 *   guarda quem assiste o quê (no máximo WATCHED_VIDEOS_PER_PERSON) e diz a quem transmite, em
 *   `video.viewers`, para quem enviar.
 * - Retransmissão paga: cada ponta informa (`peer.relay`) se a conexão com a outra é retransmitida.
 *   Num par retransmitido o vídeo só vai se quem transmite é Plus e tem ouro, e cada minuto de cada
 *   par é debitado dele.
 * - Sala protegida: até PROTECTED_ROOM_MAX_PEOPLE pessoas e PROTECTED_ROOM_MAX_VIDEOS vídeos; só
 *   candidatos de retransmissão passam na sinalização; o dono paga por minuto, com avisos e
 *   tolerância; sem saldo (ou sem Plus) a sala encerra, nunca vira sala direta.
 * - Um único alarme serve a dois prazos guardados no storage: o do ciclo de vida (sala vazia, link
 *   fixo) e o dos medidores; o alarme é armado no mais próximo.
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
  /** A conta escolheu abrir a sala de link fixo como protegida. */
  protected: boolean;
  /**
   * Na sala protegida: a retransmissão está configurada e o dono tem ouro. Sem isso a sala vazia
   * não abre (a ocupada segue até a tolerância).
   */
  canOpenProtected: boolean;
}

/** Sala comum protegida: a conta que criou (é quem paga). */
export interface ProtectedOwner {
  ownerUserId: string;
}

export type AdmitResult = "ok" | "room_ended" | "banned" | "room_full";
export type AdmissionCheck = "ok" | "room_ended" | "banned" | "unauthorized";
export interface RoomInfo {
  status: "open" | "ended";
  participants: number;
  capacity: number;
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
  fixed?: Omit<FixedOwner, "canOpenProtected">;
  /** Sala comum protegida: quem criou. Na de link fixo, o dono é `fixed.userId`. */
  protectedOwner?: ProtectedOwner;
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
  isModerator: boolean;
  micMuted: boolean;
  handRaised: boolean;
  videos: RoomVideo[];
  /** Vídeos (de outras pessoas) que esta conexão pediu para assistir. Zera quando a conexão cai. */
  watching: string[];
  /** Saída já tratada (removido, substituído ou fechado). */
  departed: boolean;
  userId: string | null;
  handle: string | null;
  avatarUrl: string | null;
  badges: Badge[];
  /** Plus ativo ao conectar (lido do D1 pelo Worker). */
  plus: boolean;
  videosPerPerson: number;
  cosmetics: Cosmetics | null;
  /** Reações de pacote desta pessoa (as básicas valem para todos e não ficam aqui). */
  packReactions: string[];
}

/** Prazos do único alarme do objeto. */
interface Alarms {
  /** Ciclo de vida: sala vazia expira; link fixo confere o plano do dono. */
  lifecycle: number | null;
  /** Próximo tique dos medidores de cobrança. */
  meter: number | null;
}

/** Medidor da retransmissão de quem transmite (um por pagante). */
interface RelayMeter {
  userId: string;
  /** Fração de ouro ainda não cobrada (de `meterCharge`). */
  carry: number;
  /** Pares × ms acumulados desde o último tique. */
  unitMs: number;
  /** Desde quando `units` vale. */
  since: number;
  /** Pares pagos ativos agora. */
  units: number;
  /** Sem ouro (saldo zerado). `null` = ainda não consultado. */
  noGold: boolean | null;
}

/** Medidor da sala protegida, pago pelo dono. */
interface ProtectedMeter {
  carry: number;
  /** Último instante cobrado; nulo com a sala vazia. */
  lastTick: number | null;
  /** Avisos de saldo já dados (minutos). */
  warned: number[];
  /** Fim da tolerância com o saldo zerado; nulo fora dela. */
  graceEndsAt: number | null;
}

type WatchState = { state: "watching" | "blocked"; reason?: WatchReason; paid: boolean };
/** Por vídeo de quem transmite: quem assiste e em que situação. */
type StreamerSnapshot = Map<string, Map<string, WatchState>>;

const META_KEY = "meta";
const ALARMS_KEY = "alarms";
const PROTECTED_METER_KEY = "pmeter";
const ADMISSION_PREFIX = "admission:";
const BAN_PREFIX = "ban:";
const BAN_PARTICIPANT_PREFIX = "ban:participant:";
const BAN_IP_PREFIX = "ban:ip:";
const CHAT_PREFIX = "chat:";
/** Moderadores por participante (sala comum e protegida; convidados na sala de link fixo). */
const MODERATOR_PREFIX = "mod:";
const RATE_PREFIX = "rate:";
/** Pares que este participante informou como retransmitidos. */
const RELAY_PREFIX = "relay:";
const RELAY_METER_PREFIX = "rmeter:";
/** Máximo de chaves por chamada de `storage.delete`. */
const DELETE_BATCH = 128;

function chatKey(seq: number): string {
  return `${CHAT_PREFIX}${seq.toString().padStart(12, "0")}`;
}

function newProtectedMeter(): ProtectedMeter {
  return { carry: 0, lastTick: null, warned: [], graceEndsAt: null };
}

export class RoomBase extends DurableObject<AppEnv> {
  /** Cópia em memória da meta (`null` = sala inexistente ou já encerrada). */
  private meta: RoomMeta | null = null;
  private alarms: Alarms = { lifecycle: null, meter: null };
  /** Moderadores guardados no storage do objeto (não inclui os permanentes do link fixo, no D1). */
  private moderators = new Set<string>();
  private rates = new Map<string, RateState>();
  private relay = new Map<string, Set<string>>();
  private relayMeters = new Map<string, RelayMeter>();
  private protectedMeter: ProtectedMeter | null = null;
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
      const storage = ctx.storage;
      this.meta = (await storage.get<RoomMeta>(META_KEY)) ?? null;
      this.alarms = (await storage.get<Alarms>(ALARMS_KEY)) ?? { lifecycle: null, meter: null };
      this.protectedMeter = (await storage.get<ProtectedMeter>(PROTECTED_METER_KEY)) ?? null;
      for (const key of (await storage.list({ prefix: MODERATOR_PREFIX })).keys()) {
        this.moderators.add(key.slice(MODERATOR_PREFIX.length));
      }
      for (const [key, value] of await storage.list<RateState>({ prefix: RATE_PREFIX })) {
        this.rates.set(key.slice(RATE_PREFIX.length), value);
      }
      for (const [key, value] of await storage.list<string[]>({ prefix: RELAY_PREFIX })) {
        this.relay.set(key.slice(RELAY_PREFIX.length), new Set(value));
      }
      for (const [key, value] of await storage.list<RelayMeter>({ prefix: RELAY_METER_PREFIX })) {
        this.relayMeters.set(key.slice(RELAY_METER_PREFIX.length), value);
      }
    });
  }

  // ---------- RPC chamado pelo Worker ----------

  /**
   * Inicializa a sala comum. `false` se o código já está em uso. Com `protectedOwner`, é sala
   * protegida, paga por essa conta (o Worker já conferiu Plus, ouro e retransmissão).
   */
  async create(ownerTokenHash: string, protectedOwner?: ProtectedOwner): Promise<boolean> {
    if (this.meta) return false;
    const meta: RoomMeta = {
      ownerTokenHash,
      ipSalt: randomToken(16),
      createdAt: Date.now(),
      chatSeq: 0,
      ...(protectedOwner ? { protectedOwner: { ownerUserId: protectedOwner.ownerUserId } } : {}),
    };
    await this.ctx.storage.put(META_KEY, meta);
    this.meta = meta;
    // Sala criada e nunca usada também expira.
    this.alarms = { lifecycle: Date.now() + ROOM_EMPTY_TTL_MS, meter: null };
    await this.armAlarm();
    return true;
  }

  /**
   * A sala de link fixo existe enquanto o dono tem Plus (o Worker confere antes de chamar). Cria a
   * meta se faltar e atualiza o tema; se o storage era de outra conta (o @nome mudou de dono),
   * começa do zero. O tipo (direta ou protegida) só muda com a sala vazia. Devolve `false` se a
   * sala não abre: protegida, vazia, e sem retransmissão ou sem ouro do dono.
   */
  async ensureFixed(owner: FixedOwner): Promise<boolean> {
    const current = this.meta;
    if (current && current.fixed?.userId !== owner.userId) await this.end();
    const occupied = this.liveSockets().length > 0;
    const { canOpenProtected, ...stored } = owner;
    const meta = this.meta;
    if (!meta) {
      if (owner.protected && !canOpenProtected) return false;
      const created: RoomMeta = {
        ownerTokenHash: null,
        ipSalt: randomToken(16),
        createdAt: Date.now(),
        chatSeq: 0,
        fixed: { ...stored },
      };
      await this.ctx.storage.put(META_KEY, created);
      this.meta = created;
      return true;
    }
    const fixed = meta.fixed!;
    // Em andamento, a sala não muda de tipo: vale o que estava.
    const nextProtected = occupied ? fixed.protected : owner.protected;
    if (!occupied && nextProtected && !canOpenProtected) return false;
    const typeChanged = nextProtected !== fixed.protected;
    if (fixed.theme === owner.theme && fixed.handle === owner.handle && !typeChanged) return true;
    meta.fixed = { ...stored, protected: nextProtected };
    if (typeChanged) {
      this.protectedMeter = null;
      await this.ctx.storage.delete(PROTECTED_METER_KEY);
    }
    await this.ctx.storage.put(META_KEY, meta);
    // O dono trocou o tema pelo perfil: vale na hora para quem está na sala.
    this.broadcast({ type: "room.updated", room: this.settings() });
    return true;
  }

  /** O dono do link fixo perdeu o Plus (ou o @nome): avisa, desconecta todos e apaga a sala. */
  async endFixed(): Promise<void> {
    if (this.meta?.fixed) await this.end();
  }

  /** Estado público. Só lê: não cria nada no storage para código inexistente. */
  info(): RoomInfo {
    if (!this.meta) {
      return { status: "ended", participants: 0, capacity: ROOM_MAX_PEOPLE, fixed: false, protected: false };
    }
    return {
      status: "open",
      participants: this.presentIds().size,
      capacity: this.capacity(),
      fixed: Boolean(this.meta.fixed),
      protected: this.isProtected(),
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
      this.alarms.lifecycle = Date.now() + ROOM_EMPTY_TTL_MS;
      await this.armAlarm();
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
      isModerator: false,
      micMuted: true,
      handRaised: false,
      videos: [],
      watching: [],
      departed: false,
      userId: account?.userId ?? null,
      handle: account?.handle ?? null,
      avatarUrl: account?.avatarUrl ?? null,
      badges: account?.badges ?? [],
      plus: account?.plus ?? false,
      videosPerPerson: account?.videosPerPerson ?? VIDEOS_PER_PERSON,
      cosmetics: account?.cosmetics ?? null,
      packReactions: account?.reactions ?? [],
    };
    server.serializeAttachment(connection);
    // Alguém chegou: a sala comum cancela o encerramento; a de link fixo passa a conferir o plano;
    // a protegida começa a cobrar.
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
        return this.onReaction(ws, message.reaction);
      case "hand.set":
        if (!this.takeRate(ws, "hand")) return;
        return this.updateIfPresent(ws, (c) => (c.handRaised = message.raised));
      case "mic.set":
        if (!this.takeRate(ws, "mic")) return;
        return this.updateIfPresent(ws, (c) => (c.micMuted = message.muted));
      case "video.request":
        return this.onVideoRequest(ws, message.requestId, message.kind);
      case "video.stop":
        return this.onVideoStop(ws, message.videoId);
      case "video.watch":
        return this.onWatch(ws, message.videoId);
      case "video.unwatch":
        return this.onUnwatch(ws, message.videoId);
      case "peer.relay":
        return this.onPeerRelay(ws, message.peer, message.relayed);
      case "signal":
        return this.onSignal(ws, message);
      case "moderate":
        return this.onModerate(ws, message);
      case "moderator.set":
        return this.onModeratorSet(ws, message.target, message.moderator);
      case "room.setTheme":
        return this.onSetTheme(ws, message.theme);
      case "gift.send":
        return this.onGift(ws, message);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.depart(ws, "left");
    closeQuietly(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    await this.afterDeparture();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.depart(ws, "left");
    await this.afterDeparture();
  }

  // ---------- Alarme ----------

  override async alarm(): Promise<void> {
    if (!this.meta) return;
    const now = Date.now();
    const { lifecycle, meter } = this.alarms;
    let runMeter = meter !== null && meter <= now;
    let runLifecycle = lifecycle !== null && lifecycle <= now;
    // Disparado antes do prazo (ex.: pelos testes): vale o prazo mais próximo.
    if (!runMeter && !runLifecycle) {
      if (meter !== null && (lifecycle === null || meter <= lifecycle)) runMeter = true;
      else if (lifecycle !== null) runLifecycle = true;
    }
    if (runMeter) {
      this.alarms.meter = null;
      await this.meterTick(now);
      if (!this.meta) return;
    }
    if (runLifecycle) {
      this.alarms.lifecycle = null;
      await this.lifecycleCheck();
      if (!this.meta) return;
    }
    await this.armAlarm();
  }

  /** Grava os prazos e arma o alarme no mais próximo (ou desarma). */
  private async armAlarm(): Promise<void> {
    if (!this.meta) return;
    await this.ctx.storage.put(ALARMS_KEY, this.alarms);
    const next = [this.alarms.lifecycle, this.alarms.meter].filter((t): t is number => t !== null);
    if (next.length === 0) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(Math.min(...next));
  }

  private async lifecycleCheck(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    if (!meta.fixed) {
      // Alguém voltou e o alarme ficou para trás: a sala continua.
      if (this.liveSockets().length > 0) return;
      return this.end();
    }
    // Link fixo: o dono ainda tem Plus e ainda é dono deste @nome?
    if (!(await this.ownerStillQualifies(meta.fixed))) return this.end();
    if (!this.meta) return;
    if (this.liveSockets().length > 0) {
      this.alarms.lifecycle = Date.now() + ROOM_EMPTY_TTL_MS;
      return;
    }
    // Vazia pelo prazo: a sala continua, mas nada da conversa fica guardado.
    await this.clearSession();
  }

  // ---------- Encerramento ----------

  /** Acaba a sala: avisa e desconecta todos e apaga todo o storage. */
  private async end(reason?: "no_gold"): Promise<void> {
    const ended = JSON.stringify(
      serverMessageSchema.parse(reason ? { type: "room.ended", reason } : { type: "room.ended" }),
    );
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(ended);
      } catch {
        // conexão já fechada
      }
      // Saída tratada sem avisar os demais: todos recebem `room.ended`.
      try {
        const connection = attachmentOf(ws);
        if (connection) ws.serializeAttachment({ ...connection, departed: true, videos: [], watching: [] });
      } catch {
        // conexão já encerrada
      }
      closeQuietly(ws, WS_CLOSE.roomEnded, "room_ended");
    }
    this.meta = null;
    this.alarms = { lifecycle: null, meter: null };
    this.moderators.clear();
    this.rates.clear();
    this.relay.clear();
    this.relayMeters.clear();
    this.protectedMeter = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  /**
   * Sala de link fixo vazia: apaga chat, admissões, banidos, moderadores convidados e limites; a sala
   * (e o tema) continuam.
   */
  private async clearSession(): Promise<void> {
    const keys: string[] = [];
    for (const prefix of [CHAT_PREFIX, ADMISSION_PREFIX, BAN_PREFIX, MODERATOR_PREFIX, RATE_PREFIX]) {
      keys.push(...(await this.ctx.storage.list({ prefix })).keys());
    }
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.ctx.storage.delete(keys.slice(i, i + DELETE_BATCH));
    }
    this.moderators.clear();
    this.rates.clear();
    const meta = this.meta;
    if (!meta) return;
    meta.chatSeq = 0;
    meta.ipSalt = randomToken(16);
    await this.ctx.storage.put(META_KEY, meta);
  }

  private async ownerStillQualifies(owner: { userId: string; handle: string }): Promise<boolean> {
    const user = await findUserById(this.env, owner.userId);
    if (!user || user.handle !== owner.handle || !isOnboarded(user)) return false;
    return (await getPlanStatus(this.env, owner.userId)).plan.plus;
  }

  private async scheduleOccupied(): Promise<void> {
    if (!this.meta) return;
    this.alarms.lifecycle = this.meta.fixed ? Date.now() + ROOM_EMPTY_TTL_MS : null;
    if (this.isProtected()) {
      const meter = this.protectedMeter ?? newProtectedMeter();
      if (meter.lastTick === null) meter.lastTick = Date.now();
      await this.saveProtectedMeter(meter);
      if (this.alarms.meter === null) this.alarms.meter = Date.now() + METER_INTERVAL_MS;
    }
    await this.armAlarm();
  }

  /** Depois de uma saída: sala vazia começa a contar o prazo; a protegida para de cobrar. */
  private async afterDeparture(): Promise<void> {
    if (!this.meta) return;
    if (this.liveSockets().length > 0) {
      await this.armAlarm();
      return;
    }
    if (this.isProtected()) await this.settleProtected(Date.now());
    if (!this.meta) return;
    this.alarms.lifecycle = Date.now() + ROOM_EMPTY_TTL_MS;
    await this.armAlarm();
  }

  // ---------- Mensagens ----------

  private async onHello(ws: WebSocket, ownerToken: string | undefined): Promise<void> {
    if (attachmentOf(ws).ready) return this.send(ws, { type: "error", code: "invalid_message" });
    const meta = this.meta;
    if (!meta) return;
    const { userId, participantId } = attachmentOf(ws);
    // Link fixo: o dono é a conta dona do @nome (o token não vale). Sala comum: o token secreto; na
    // protegida, também a conta que criou.
    const byToken =
      !meta.fixed && ownerToken && meta.ownerTokenHash
        ? safeEqual(await sha256(ownerToken), meta.ownerTokenHash)
        : false;
    const isOwner = meta.fixed
      ? userId !== null && userId === meta.fixed.userId
      : byToken || (userId !== null && userId === meta.protectedOwner?.ownerUserId);
    const isModerator = !isOwner && (await this.storedModerator(participantId, userId));
    const history = await this.ctx.storage.list<ChatMessage>({ prefix: CHAT_PREFIX });
    const payer = this.protectedPayer();
    const balance = payer ? await this.goldOf(payer) : 0;

    // Depois dos awaits, relê o estado: a conexão pode ter saído ou já ter dito hello.
    const connection = attachmentOf(ws);
    if (!this.meta || connection.departed || connection.ready || ws.readyState !== WebSocket.OPEN) return;
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
    connection.isModerator = isModerator;
    connection.micMuted = true;
    connection.watching = [];
    ws.serializeAttachment(connection);

    this.send(ws, {
      type: "welcome",
      room: this.settings(),
      limits: {
        videosPerPerson: connection.videosPerPerson,
        reactions: reactionsOf(connection),
        watchedVideos: WATCHED_VIDEOS_PER_PERSON,
        relayVideo: connection.plus,
      },
      self: connection.participantId,
      participants: this.readySockets().map((s) => toParticipant(attachmentOf(s))),
      chat: [...history.values()].slice(-CHAT_HISTORY_SIZE),
    });
    this.broadcast({ type: "participant.joined", participant: toParticipant(connection) }, ws);
    if (payer) this.send(ws, this.protectedMeterMessage(balance));
  }

  /** Moderador guardado: no D1 (conta, na sala de link fixo) ou no storage (os demais). */
  private async storedModerator(participantId: string, userId: string | null): Promise<boolean> {
    const fixed = this.meta?.fixed;
    if (fixed && userId !== null) {
      const rows = await createDb(this.env.DB)
        .select({ userId: roomModerators.userId })
        .from(roomModerators)
        .where(and(eq(roomModerators.ownerUserId, fixed.userId), eq(roomModerators.userId, userId)))
        .limit(1);
      return rows.length > 0;
    }
    return this.moderators.has(participantId);
  }

  /** Aplica o limite de frequência da pessoa; acima dele responde `rate_limited` e devolve `false`. */
  private takeRate(ws: WebSocket, kind: RateKind): boolean {
    const { participantId } = attachmentOf(ws);
    const result = takeRate(this.rates.get(participantId) ?? {}, kind, Date.now());
    this.rates.set(participantId, result.state);
    // Sem await: a escrita é ordenada e confirmada antes de qualquer resposta sair (output gate), e
    // escritas seguidas se juntam numa só.
    void this.ctx.storage.put(RATE_PREFIX + participantId, result.state);
    if (!result.allowed) this.send(ws, { type: "error", code: "rate_limited" });
    return result.allowed;
  }

  private async onChat(ws: WebSocket, text: string): Promise<void> {
    if (!this.takeRate(ws, "chat")) return;
    const meta = this.meta;
    const connection = attachmentOf(ws);
    if (!meta || connection.departed) return;
    const now = Date.now();
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

  private async onReaction(ws: WebSocket, reaction: string): Promise<void> {
    const connection = attachmentOf(ws);
    // Só as reações da lista desta pessoa (básicas + pacotes equipados ao conectar).
    if (!reactionsOf(connection).includes(reaction)) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    if (!this.takeRate(ws, "reaction")) return;
    if (attachmentOf(ws).departed) return;
    this.broadcast({ type: "reaction", from: connection.participantId, reaction });
  }

  private onVideoRequest(ws: WebSocket, requestId: string, kind: RoomVideo["kind"]): void {
    const connection = attachmentOf(ws);
    // Limite pelo plano de cada pessoa, decidido no servidor ao conectar.
    if (connection.videos.length >= connection.videosPerPerson) {
      return this.send(ws, { type: "video.denied", requestId, reason: "person_limit" });
    }
    // Só a sala protegida tem teto de vídeos na sala.
    if (this.isProtected()) {
      const roomVideos = this.readySockets().reduce((total, s) => total + attachmentOf(s).videos.length, 0);
      if (roomVideos >= PROTECTED_ROOM_MAX_VIDEOS) {
        return this.send(ws, { type: "video.denied", requestId, reason: "room_limit" });
      }
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
    // Quem assistia recebe `stopped` (pela diferença entre antes e depois).
    this.changeAndNotify([connection.participantId], () => {
      this.update(ws, (c) => (c.videos = c.videos.filter((v) => v.id !== videoId)));
    });
  }

  // ---------- Vídeo sob demanda ----------

  private async onWatch(ws: WebSocket, videoId: string): Promise<void> {
    const viewer = attachmentOf(ws);
    const denied = (reason: WatchReason) =>
      this.send(ws, { type: "video.watch.state", videoId, state: "denied", reason });
    const streamerWs = this.streamerOf(videoId);
    // Ninguém assiste o próprio vídeo.
    if (!streamerWs || streamerWs === ws) return denied("not_found");
    if (viewer.watching.includes(videoId)) {
      // Já assiste: repete a situação atual.
      const state = this.watchState(attachmentOf(streamerWs), viewer);
      return this.sendWatchState(ws, videoId, state);
    }
    if (viewer.watching.length >= WATCHED_VIDEOS_PER_PERSON) return denied("watch_limit");
    const streamerId = attachmentOf(streamerWs).participantId;
    // Par retransmitido: o saldo de quem transmite precisa estar conhecido antes de decidir.
    if (this.isRelayed(streamerId, viewer.participantId)) await this.ensureGoldKnown(streamerId);

    // Relê depois do await.
    const current = attachmentOf(ws);
    const streamer = this.streamerOf(videoId);
    if (current.departed || !streamer || streamer === ws) return denied("not_found");
    if (current.watching.includes(videoId)) return;
    if (current.watching.length >= WATCHED_VIDEOS_PER_PERSON) return denied("watch_limit");
    this.changeAndNotify([attachmentOf(streamer).participantId], () => {
      current.watching = [...current.watching, videoId];
      ws.serializeAttachment(current);
    });
    await this.ensureMeterAlarm();
  }

  private async onUnwatch(ws: WebSocket, videoId: string): Promise<void> {
    const viewer = attachmentOf(ws);
    if (!viewer.watching.includes(videoId)) {
      return this.send(ws, { type: "video.watch.state", videoId, state: "stopped" });
    }
    const streamer = this.streamerOf(videoId);
    this.changeAndNotify(streamer ? [attachmentOf(streamer).participantId] : [], () => {
      viewer.watching = viewer.watching.filter((id) => id !== videoId);
      ws.serializeAttachment(viewer);
    });
    // Sem quem transmite (não deveria acontecer): avisa direto.
    if (!streamer) this.send(ws, { type: "video.watch.state", videoId, state: "stopped" });
    await this.ensureMeterAlarm();
  }

  /** Cada ponta diz se a conexão de mídia com `peer` passa pela retransmissão. */
  private async onPeerRelay(ws: WebSocket, peer: string, relayed: boolean): Promise<void> {
    const self = attachmentOf(ws).participantId;
    if (peer === self || !this.findReady(peer)) return this.send(ws, { type: "error", code: "not_found" });
    if (relayed && !this.isProtected()) {
      // Os dois podem transmitir um ao outro: saldo conhecido antes de o par virar retransmitido.
      await this.ensureGoldKnown(self);
      await this.ensureGoldKnown(peer);
    }
    if (attachmentOf(ws).departed || !this.findReady(peer)) return;
    const reported = this.relay.get(self) ?? new Set<string>();
    if (reported.has(peer) === relayed) return;
    this.changeAndNotify([self, peer], () => {
      if (relayed) reported.add(peer);
      else reported.delete(peer);
      this.relay.set(self, reported);
    });
    if (reported.size > 0) await this.ctx.storage.put(RELAY_PREFIX + self, [...reported]);
    else {
      this.relay.delete(self);
      await this.ctx.storage.delete(RELAY_PREFIX + self);
    }
    await this.ensureMeterAlarm();
  }

  /** Conexão de quem transmite o vídeo, ou `undefined`. */
  private streamerOf(videoId: string): WebSocket | undefined {
    return this.readySockets().find((s) => attachmentOf(s).videos.some((v) => v.id === videoId));
  }

  /** O par (A, B) é retransmitido se qualquer uma das pontas disse que sim. */
  private isRelayed(a: string, b: string): boolean {
    return Boolean(this.relay.get(a)?.has(b) || this.relay.get(b)?.has(a));
  }

  /** Situação de um vídeo de `streamer` para `viewer`. */
  private watchState(streamer: Connection, viewer: Connection): WatchState {
    // Na sala protegida toda a mídia passa pela retransmissão e é paga pelo dono.
    if (this.isProtected() || !this.isRelayed(streamer.participantId, viewer.participantId)) {
      return { state: "watching", paid: false };
    }
    if (!streamer.plus) return { state: "blocked", reason: "relay_no_plus", paid: false };
    if (this.relayMeters.get(streamer.participantId)?.noGold !== false) {
      return { state: "blocked", reason: "relay_no_gold", paid: false };
    }
    return { state: "watching", paid: true };
  }

  private snapshot(streamerId: string, leaving?: WebSocket): StreamerSnapshot {
    const result: StreamerSnapshot = new Map();
    // Conta quem ainda não teve a saída tratada, mesmo com a conexão já fechando (`leaving`, que o
    // runtime pode já não listar): a saída, em `depart`, precisa do "antes" com a pessoa dentro.
    const sockets = this.ctx.getWebSockets();
    if (leaving && !sockets.includes(leaving)) sockets.push(leaving);
    const present = sockets.filter((s) => {
      const state = attachmentOf(s);
      return state.ready && !state.departed;
    });
    const streamerWs = present.find((s) => attachmentOf(s).participantId === streamerId);
    if (!streamerWs) return result;
    const streamer = attachmentOf(streamerWs);
    const viewers = present.filter((s) => s !== streamerWs).map(attachmentOf);
    for (const video of streamer.videos) {
      const states = new Map<string, WatchState>();
      for (const viewer of viewers) {
        if ((viewer.watching ?? []).includes(video.id)) {
          states.set(viewer.participantId, this.watchState(streamer, viewer));
        }
      }
      result.set(video.id, states);
    }
    return result;
  }

  /**
   * Aplica uma mudança e avisa o que mudou para os vídeos de `streamerIds`: `video.watch.state` a
   * cada pessoa cuja situação mudou (`stopped` para quem deixou de assistir ou cujo vídeo acabou) e
   * `video.viewers` a quem transmite quando as listas mudaram. Depois atualiza o medidor de cada um.
   * Síncrono: nada muda no meio.
   */
  private changeAndNotify(streamerIds: string[], mutate: () => void, leaving?: WebSocket): void {
    const ids = [...new Set(streamerIds)];
    const before = new Map(ids.map((id) => [id, this.snapshot(id, leaving)]));
    mutate();
    for (const id of ids) {
      const after = this.snapshot(id, leaving);
      const previous = before.get(id)!;
      const streamerWs = this.findReady(id);
      for (const [videoId, states] of previous) {
        if (after.has(videoId)) continue;
        // O vídeo acabou (ou quem transmite saiu): quem assistia para.
        for (const viewerId of states.keys()) {
          const viewerWs = this.findReady(viewerId);
          if (!viewerWs) continue;
          const viewer = attachmentOf(viewerWs);
          viewer.watching = viewer.watching.filter((v) => v !== videoId);
          viewerWs.serializeAttachment(viewer);
          this.send(viewerWs, { type: "video.watch.state", videoId, state: "stopped" });
        }
      }
      for (const [videoId, states] of after) {
        const old = previous.get(videoId) ?? new Map<string, WatchState>();
        let changed = false;
        for (const [viewerId, state] of states) {
          const was = old.get(viewerId);
          if (was && was.state === state.state && was.reason === state.reason) continue;
          changed = true;
          const viewerWs = this.findReady(viewerId);
          if (viewerWs) this.sendWatchState(viewerWs, videoId, state);
        }
        for (const viewerId of old.keys()) {
          if (states.has(viewerId)) continue;
          changed = true;
          const viewerWs = this.findReady(viewerId);
          if (viewerWs) this.send(viewerWs, { type: "video.watch.state", videoId, state: "stopped" });
        }
        if (changed && streamerWs) {
          const viewers: string[] = [];
          const blocked: string[] = [];
          for (const [viewerId, state] of states)
            (state.state === "watching" ? viewers : blocked).push(viewerId);
          this.send(streamerWs, { type: "video.viewers", videoId, viewers, blocked });
        }
      }
      this.syncRelayUnits(id, after);
    }
  }

  private sendWatchState(ws: WebSocket, videoId: string, state: WatchState): void {
    this.send(ws, {
      type: "video.watch.state",
      videoId,
      state: state.state,
      ...(state.reason ? { reason: state.reason } : {}),
    });
  }

  // ---------- Retransmissão paga ----------

  /** Atualiza os pares pagos de quem transmite, acumulando o tempo do valor anterior. */
  private syncRelayUnits(streamerId: string, snapshot: StreamerSnapshot): void {
    let units = 0;
    for (const states of snapshot.values()) for (const state of states.values()) if (state.paid) units++;
    const meter = this.relayMeters.get(streamerId);
    if (!meter) return;
    if (meter.units === units) return;
    const now = Date.now();
    meter.unitMs += meter.units * Math.max(0, now - meter.since);
    meter.since = now;
    meter.units = units;
    void this.ctx.storage.put(RELAY_METER_PREFIX + streamerId, meter);
    const ws = this.findReady(streamerId);
    if (ws && meter.noGold === false) {
      this.send(ws, {
        type: "relay.meter",
        pairs: units,
        goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR,
        state: "paying",
      });
    }
  }

  /**
   * Garante que o saldo de quem transmite (Plus, com conta, na sala direta) está consultado: cria o
   * medidor dele com `noGold` lido do D1.
   */
  private async ensureGoldKnown(streamerId: string): Promise<void> {
    if (this.isProtected()) return;
    const ws = this.findReady(streamerId);
    const connection = ws ? attachmentOf(ws) : null;
    if (!connection?.plus || connection.userId === null) return;
    const existing = this.relayMeters.get(streamerId);
    if (existing && existing.noGold !== null) return;
    const userId = connection.userId;
    const gold = await this.goldOf(userId);
    if (!this.findReady(streamerId)) return;
    this.changeAndNotify([streamerId], () => {
      const meter = this.relayMeters.get(streamerId) ?? {
        userId,
        carry: 0,
        unitMs: 0,
        since: Date.now(),
        units: 0,
        noGold: null,
      };
      meter.noGold = gold <= 0;
      this.relayMeters.set(streamerId, meter);
    });
    const meter = this.relayMeters.get(streamerId);
    if (meter) await this.ctx.storage.put(RELAY_METER_PREFIX + streamerId, meter);
  }

  /** Há gente na sala protegida ou algum medidor de retransmissão ativo: arma o tique. */
  private async ensureMeterAlarm(): Promise<void> {
    if (!this.meta || this.alarms.meter !== null || !this.needsMeter()) return;
    this.alarms.meter = Date.now() + METER_INTERVAL_MS;
    await this.armAlarm();
  }

  private needsMeter(): boolean {
    if (this.isProtected() && this.liveSockets().length > 0) return true;
    return this.relayMeters.size > 0;
  }

  /** Quem transmite tem algum vídeo assistido por par retransmitido (pago ou bloqueado por ouro)? */
  private hasRelayedViewers(streamerId: string): boolean {
    for (const states of this.snapshot(streamerId).values()) {
      for (const state of states.values()) if (state.paid || state.reason === "relay_no_gold") return true;
    }
    return false;
  }

  private async meterTick(now: number): Promise<void> {
    if (this.isProtected()) {
      await this.protectedTick(now);
      if (!this.meta) return;
    }
    await this.relayTick(now);
    if (!this.meta) return;
    if (this.needsMeter()) this.alarms.meter = now + METER_INTERVAL_MS;
  }

  /**
   * Tique da retransmissão: cada pagante paga os pares × tempo acumulados desde o último tique
   * (`meterCharge` com o tempo já multiplicado pelos pares). Sem ouro, os pares pagos dele passam a
   * `blocked` / `relay_no_gold`; com ouro de volta, voltam a `watching`.
   */
  private async relayTick(now: number): Promise<void> {
    if (this.isProtected()) return;
    const roomRef = this.ctx.id.toString();
    for (const [streamerId, meter] of [...this.relayMeters]) {
      meter.unitMs += meter.units * Math.max(0, now - meter.since);
      meter.since = now;
      const unitMs = meter.unitMs;
      const charge = meterCharge(RELAY_VIDEO_GOLD_PER_HOUR, 1, unitMs, meter.carry);
      meter.unitMs = 0;
      const present = Boolean(this.findReady(streamerId));
      let balance: number;
      let exhausted = false;
      try {
        if (charge.gold > 0) {
          const result = await debitMeter(this.env, {
            userId: meter.userId,
            gold: charge.gold,
            reason: "relay_video",
            reference: `relay_video:${roomRef}:${streamerId}:${now}`,
            now,
          });
          balance = result.balance;
          exhausted = result.exhausted;
        } else {
          balance = present ? await this.goldOf(meter.userId) : 0;
        }
      } catch (error) {
        // Falha do D1: o tempo volta para o próximo tique.
        captureException(error);
        meter.unitMs += unitMs;
        continue;
      }
      if (!this.meta) return;
      meter.carry = exhausted ? 0 : charge.carry;
      if (!this.findReady(streamerId)) {
        // Quem transmite saiu: o que devia foi cobrado; o medidor some.
        if (meter.units === 0 && meter.unitMs === 0) {
          this.relayMeters.delete(streamerId);
          await this.ctx.storage.delete(RELAY_METER_PREFIX + streamerId);
        }
        continue;
      }
      const noGold = exhausted || balance <= 0;
      const unitsBefore = meter.units;
      this.changeAndNotify([streamerId], () => {
        meter.noGold = noGold;
      });
      const ws = this.findReady(streamerId);
      if (ws) {
        if (noGold && (unitsBefore > 0 || this.hasRelayedViewers(streamerId))) {
          this.send(ws, {
            type: "relay.meter",
            pairs: 0,
            goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR,
            state: "no_gold",
          });
        } else if (!noGold && meter.units > 0 && meter.units === unitsBefore) {
          // Mudou o número de pares: `syncRelayUnits` já avisou.
          this.send(ws, {
            type: "relay.meter",
            pairs: meter.units,
            goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR,
            state: "paying",
          });
        }
      }
      if (meter.units === 0 && meter.unitMs === 0 && !this.hasRelayedViewers(streamerId)) {
        this.relayMeters.delete(streamerId);
        await this.ctx.storage.delete(RELAY_METER_PREFIX + streamerId);
      } else {
        await this.ctx.storage.put(RELAY_METER_PREFIX + streamerId, meter);
      }
    }
  }

  // ---------- Sala protegida ----------

  private isProtected(): boolean {
    const meta = this.meta;
    return Boolean(meta?.protectedOwner || meta?.fixed?.protected);
  }

  /** Conta que paga a sala protegida, ou `null` se a sala não é protegida. */
  private protectedPayer(): string | null {
    const meta = this.meta;
    if (meta?.fixed?.protected) return meta.fixed.userId;
    return meta?.protectedOwner?.ownerUserId ?? null;
  }

  private capacity(): number {
    return this.isProtected() ? PROTECTED_ROOM_MAX_PEOPLE : ROOM_MAX_PEOPLE;
  }

  private async goldOf(userId: string): Promise<number> {
    return (await getWallet(this.env, userId, Date.now())).gold;
  }

  private async saveProtectedMeter(meter: ProtectedMeter): Promise<void> {
    this.protectedMeter = meter;
    await this.ctx.storage.put(PROTECTED_METER_KEY, meter);
  }

  private protectedMeterMessage(balance: number): ServerMessage {
    const meter = this.protectedMeter ?? newProtectedMeter();
    if (meter.graceEndsAt !== null) {
      return {
        type: "protected.meter",
        state: "grace",
        remainingMs: 0,
        goldPerHour: PROTECTED_ROOM_GOLD_PER_HOUR,
        graceEndsAt: meter.graceEndsAt,
      };
    }
    const remainingMs = meterRemainingMs(balance, PROTECTED_ROOM_GOLD_PER_HOUR, 1, meter.carry);
    return {
      type: "protected.meter",
      state: meter.warned.length > 0 ? "warning" : "ok",
      remainingMs,
      goldPerHour: PROTECTED_ROOM_GOLD_PER_HOUR,
    };
  }

  /** Cobra do dono o tempo desde o último tique. Devolve o saldo depois e se o débito se esgotou. */
  private async chargeProtected(
    payer: string,
    meter: ProtectedMeter,
    now: number,
  ): Promise<{ balance: number; exhausted: boolean }> {
    const elapsed = meter.lastTick === null ? 0 : Math.max(0, now - meter.lastTick);
    // Marca o intervalo como cobrado antes de qualquer await: outro evento (a última pessoa saindo)
    // não cobra o mesmo tempo duas vezes.
    meter.lastTick = now;
    const charge = meterCharge(PROTECTED_ROOM_GOLD_PER_HOUR, 1, elapsed, meter.carry);
    if (charge.gold === 0) {
      meter.carry = charge.carry;
      return { balance: await this.goldOf(payer), exhausted: false };
    }
    const result = await debitMeter(this.env, {
      userId: payer,
      gold: charge.gold,
      reason: "protected_room",
      reference: `protected_room:${this.ctx.id.toString()}:${now}`,
      now,
    });
    // O que não coube no saldo não é cobrado depois (o saldo nunca fica negativo).
    meter.carry = result.exhausted ? 0 : charge.carry;
    return { balance: result.balance, exhausted: result.exhausted };
  }

  /**
   * Tique da sala protegida com gente dentro: o dono precisa ter Plus; debita o minuto; saldo zerado
   * abre a tolerância (PROTECTED_ROOM_GRACE_MS); se ela passa sem recarga, a sala encerra para
   * todos. Todos recebem o tempo que o saldo ainda cobre.
   */
  private async protectedTick(now: number): Promise<void> {
    const payer = this.protectedPayer();
    if (!payer) return;
    const meter = this.protectedMeter ?? newProtectedMeter();
    if (this.liveSockets().length === 0) {
      meter.lastTick = null;
      await this.saveProtectedMeter(meter);
      return;
    }
    // Sem Plus o dono não mantém a sala protegida (e ela nunca vira direta).
    if (!(await getPlanStatus(this.env, payer)).plan.plus) return this.end();
    if (!this.meta) return;
    let outcome: { balance: number; exhausted: boolean };
    try {
      outcome = await this.chargeProtected(payer, meter, now);
    } catch (error) {
      captureException(error);
      return;
    }
    if (!this.meta) return;
    if (outcome.exhausted || outcome.balance <= 0) {
      if (meter.graceEndsAt === null) meter.graceEndsAt = now + PROTECTED_ROOM_GRACE_MS;
      else if (meter.graceEndsAt <= now) {
        await this.saveProtectedMeter(meter);
        return this.end("no_gold");
      }
      meter.warned = [];
    } else {
      // Recarga (ou ouro recebido) dentro da tolerância: volta ao normal.
      meter.graceEndsAt = null;
      const remaining = meterRemainingMs(outcome.balance, PROTECTED_ROOM_GOLD_PER_HOUR, 1, meter.carry);
      meter.warned = meterWarnings(remaining, meter.warned).warned;
    }
    await this.saveProtectedMeter(meter);
    this.broadcast(this.protectedMeterMessage(outcome.balance));
  }

  /** A sala protegida esvaziou: cobra o tempo até agora e para de contar. */
  private async settleProtected(now: number): Promise<void> {
    const payer = this.protectedPayer();
    const meter = this.protectedMeter;
    if (!payer || !meter || meter.lastTick === null) return;
    try {
      await this.chargeProtected(payer, meter, now);
    } catch (error) {
      captureException(error);
    }
    if (!this.meta) return;
    meter.lastTick = null;
    await this.saveProtectedMeter(meter);
  }

  // ---------- Sinalização e moderação ----------

  private onSignal(ws: WebSocket, message: Extract<ClientMessage, { type: "signal" }>): void {
    const from = attachmentOf(ws).participantId;
    const target = message.to === from ? undefined : this.findReady(message.to);
    if (!target) return this.send(ws, { type: "error", code: "not_found" });
    // Sala protegida: só candidatos de retransmissão passam, avulsos ou no SDP.
    const data = this.isProtected() ? protectedSignal(message.data) : message.data;
    if (!data) return;
    this.send(target, { type: "signal", from, data });
  }

  private async onModerate(
    ws: WebSocket,
    message: Extract<ClientMessage, { type: "moderate" }>,
  ): Promise<void> {
    const actor = attachmentOf(ws);
    if ((!actor.isOwner && !actor.isModerator) || message.target === actor.participantId) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    const target = this.findReady(message.target);
    if (!target) return this.send(ws, { type: "error", code: "not_found" });
    const state = attachmentOf(target);
    // O moderador age só sobre participantes comuns; o dono, sobre todos.
    if (!actor.isOwner && (state.isOwner || state.isModerator)) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }

    if (message.action === "mute") {
      this.send(target, { type: "force.muted" });
      this.update(target, (c) => (c.micMuted = true));
      return;
    }

    const reason = message.action === "ban" ? "banned" : "kicked";
    // Primeiro tira da sala (síncrono), depois grava: removido perde a admissão (volta pelo
    // join); banido fica barrado, por sessão (ou conta) e por IP, até a sala acabar.
    this.send(target, { type: "removed", reason });
    this.depart(target, reason);
    closeQuietly(target, reason === "banned" ? WS_CLOSE.banned : WS_CLOSE.kicked, reason);
    await this.ctx.storage.delete(ADMISSION_PREFIX + state.participantId);
    if (reason === "banned") {
      this.moderators.delete(state.participantId);
      await this.ctx.storage.delete(MODERATOR_PREFIX + state.participantId);
      await this.ctx.storage.put({
        [BAN_PARTICIPANT_PREFIX + state.participantId]: true,
        [BAN_IP_PREFIX + state.ipHash]: true,
      });
    }
    await this.afterDeparture();
  }

  /**
   * Só o dono promove ou rebaixa. Na sala de link fixo, quem tem conta vira moderador permanente
   * (D1, no máximo FIXED_ROOM_MODERATORS_MAX); convidado vale até a sala esvaziar. Nas demais, vale
   * até a sala acabar (storage do objeto), inclusive depois de reconectar.
   */
  private async onModeratorSet(ws: WebSocket, targetId: string, moderator: boolean): Promise<void> {
    const actor = attachmentOf(ws);
    if (!actor.isOwner || targetId === actor.participantId) {
      return this.send(ws, { type: "error", code: "not_allowed" });
    }
    const target = this.findReady(targetId);
    if (!target) return this.send(ws, { type: "error", code: "not_found" });
    const state = attachmentOf(target);
    if (state.isOwner) return this.send(ws, { type: "error", code: "not_allowed" });

    const fixed = this.meta?.fixed;
    if (fixed && state.userId !== null) {
      const db = createDb(this.env.DB);
      const where = and(
        eq(roomModerators.ownerUserId, fixed.userId),
        eq(roomModerators.userId, state.userId),
      );
      if (moderator) {
        const existing = await db.select({ userId: roomModerators.userId }).from(roomModerators).where(where);
        if (existing.length === 0) {
          const [total] = await db
            .select({ n: count() })
            .from(roomModerators)
            .where(eq(roomModerators.ownerUserId, fixed.userId));
          if ((total?.n ?? 0) >= FIXED_ROOM_MODERATORS_MAX) {
            return this.send(ws, { type: "error", code: "not_allowed" });
          }
          await db
            .insert(roomModerators)
            .values({ ownerUserId: fixed.userId, userId: state.userId, createdAt: Date.now() })
            .onConflictDoNothing();
        }
      } else {
        await db.delete(roomModerators).where(where);
      }
    } else if (moderator) {
      this.moderators.add(targetId);
      await this.ctx.storage.put(MODERATOR_PREFIX + targetId, true);
    } else {
      this.moderators.delete(targetId);
      await this.ctx.storage.delete(MODERATOR_PREFIX + targetId);
    }
    // Relê depois dos awaits.
    const current = this.findReady(targetId);
    if (!current) return;
    this.update(current, (c) => (c.isModerator = moderator && !c.isOwner));
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
    const isProtected = this.isProtected();
    return {
      theme: fixed?.theme ?? "default",
      fixed: Boolean(fixed),
      ownerHandle: fixed?.handle ?? null,
      protected: isProtected,
      capacity: this.capacity(),
      maxVideos: isProtected ? PROTECTED_ROOM_MAX_VIDEOS : null,
    };
  }

  /** Aplica uma mudança no estado da conexão e avisa todos com `participant.updated`. */
  private update(ws: WebSocket, change: (connection: Connection) => void): void {
    const connection = attachmentOf(ws);
    change(connection);
    ws.serializeAttachment(connection);
    this.broadcast({ type: "participant.updated", participant: toParticipant(connection) });
  }

  /** `update`, se a conexão ainda está na sala (depois de um await). */
  private updateIfPresent(ws: WebSocket, change: (connection: Connection) => void): void {
    if (attachmentOf(ws).departed) return;
    this.update(ws, change);
  }

  /**
   * Trata a saída de uma conexão uma única vez: libera vídeos (quem assistia recebe `stopped`), tira
   * o que ela assistia das listas de quem transmite, esquece os pares retransmitidos dela e avisa os
   * demais.
   */
  private depart(ws: WebSocket, reason: "left" | "kicked" | "banned"): void {
    let connection: Connection;
    try {
      connection = attachmentOf(ws);
    } catch {
      return;
    }
    if (connection.departed) return;
    const id = connection.participantId;
    // Quem transmite e é afetado: a própria pessoa, quem ela assistia e quem tem par com ela.
    const affected = new Set<string>([id]);
    for (const videoId of connection.watching ?? []) {
      const streamer = this.streamerOf(videoId);
      if (streamer) affected.add(attachmentOf(streamer).participantId);
    }
    for (const peer of this.relay.get(id) ?? []) affected.add(peer);
    for (const [other, peers] of this.relay) if (peers.has(id)) affected.add(other);

    this.changeAndNotify(
      [...affected],
      () => {
        connection.departed = true;
        connection.videos = [];
        connection.watching = [];
        try {
          ws.serializeAttachment(connection);
        } catch {
          // conexão já encerrada
        }
        this.forgetRelay(id);
      },
      ws,
    );
    if (connection.ready) {
      this.broadcast({ type: "participant.left", id, reason }, ws);
    }
  }

  /** Esquece os pares retransmitidos de quem saiu (dos dois lados). */
  private forgetRelay(id: string): void {
    if (this.relay.delete(id)) void this.ctx.storage.delete(RELAY_PREFIX + id);
    for (const [other, peers] of this.relay) {
      if (!peers.delete(id)) continue;
      if (peers.size === 0) {
        this.relay.delete(other);
        void this.ctx.storage.delete(RELAY_PREFIX + other);
      } else {
        void this.ctx.storage.put(RELAY_PREFIX + other, [...peers]);
      }
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
    return present.size >= this.capacity();
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
  const connection = ws.deserializeAttachment() as Connection;
  // Conexões abertas antes da entrega 4 não têm os campos novos.
  if (connection && connection.watching === undefined) connection.watching = [];
  return connection;
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
    isModerator: Boolean(connection.isModerator) && !connection.isOwner,
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
