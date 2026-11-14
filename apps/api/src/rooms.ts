import { captureException } from "@sentry/cloudflare";
import {
  PLUS_VIDEOS_PER_PERSON,
  ROOM_MAX_PEOPLE,
  ROOM_THEMES,
  VIDEOS_PER_PERSON,
  type RoomTheme,
} from "@sualive/config";
import {
  createRoomRequestSchema,
  createRoomResponseSchema,
  iceServersResponseSchema,
  joinRoomRequestSchema,
  joinRoomResponseSchema,
  roomInfoResponseSchema,
  roomKeySchema,
  WS_CLOSE,
  type ApiErrorCode,
} from "@sualive/protocol";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { recordAccess } from "./access/log";
import { findUserByHandle, findUserById } from "./account";
import { getViewer, type Viewer } from "./auth/viewer";
import { getPlanStatus } from "./billing/plan";
import { generateRoomCode, randomToken, sha256 } from "./crypto";
import type { AppEnv } from "./env";
import { apiError } from "./errors";
import { generateIceServers, isTurnConfigured, verifyTurnstile } from "./external";
import { refuse, ROOM_IDENTITY_HEADER, type FixedOwner, type RoomAccount, type RoomIdentity } from "./room";
import { getEquipped } from "./shop/equipped";
import { getWallet } from "./wallet/ledger";
import {
  accountParticipantIdFor,
  newSessionId,
  participantIdFor,
  readSession,
  writeSession,
} from "./session";

type Env = { Bindings: AppEnv };
type Ctx = Context<Env>;

/** Avatar maior que isto não vai para a sala (o estado da conexão tem limite de 2 KiB). */
const MAX_AVATAR_URL_LENGTH = 512;

function clientIp(c: Ctx): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

async function readJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** Durable Object da sala: o código da sala comum ou `@nome` da sala de link fixo. */
function roomStub(env: AppEnv, key: string) {
  return env.ROOM.get(env.ROOM.idFromName(key));
}

/** Chave da rota já validada (código ou `@nome`), ou `null`. */
function parseKey(c: Ctx): string | null {
  const key = roomKeySchema.safeParse(c.req.param("key"));
  return key.success ? key.data : null;
}

function isFixedKey(key: string): boolean {
  return key.startsWith("@");
}

function toTheme(value: string): RoomTheme {
  return (ROOM_THEMES as readonly string[]).includes(value) ? (value as RoomTheme) : "default";
}

type RoomTarget =
  | { kind: "code" }
  | { kind: "fixed"; owner: FixedOwner }
  /** Não abre. `ownerLostPlus`: a conta do @nome existe, mas não tem Plus (a sala, se aberta, acaba). */
  | { kind: "ended"; ownerLostPlus: boolean };

/** Conta com ouro para pagar a sala protegida (o saldo é lido agora, no servidor). */
async function hasGold(env: AppEnv, userId: string): Promise<boolean> {
  return (await getWallet(env, userId, Date.now())).gold > 0;
}

/**
 * O que a chave abre. Código: a sala comum (o Durable Object diz se existe). `@nome`: a sala de link
 * fixo, que existe enquanto a conta dona do @nome tem Plus ativo, segundo a cobrança. Se a conta
 * escolheu a sala protegida, ela só abre com a retransmissão configurada e ouro do dono.
 */
async function resolveTarget(env: AppEnv, key: string): Promise<RoomTarget> {
  if (!isFixedKey(key)) return { kind: "code" };
  const account = await findUserByHandle(env, key.slice(1));
  if (!account?.onboarded) return { kind: "ended", ownerLostPlus: false };
  const { plan } = await getPlanStatus(env, account.userId);
  if (!plan.plus) return { kind: "ended", ownerLostPlus: true };
  const row = await findUserById(env, account.userId);
  const isProtected = row?.fixedRoomProtected === 1;
  const canOpenProtected = isProtected && isTurnConfigured(env) && (await hasGold(env, account.userId));
  return {
    kind: "fixed",
    owner: {
      userId: account.userId,
      handle: account.handle,
      theme: toTheme(account.roomTheme),
      protected: isProtected,
      canOpenProtected,
    },
  };
}

/**
 * Confere a chave: na sala de link fixo, garante a sala aberta (e o tema atual) ou, se o dono perdeu
 * o Plus, encerra quem ainda está nela. `false` = a sala não abre.
 */
async function openTarget(env: AppEnv, key: string): Promise<boolean> {
  const target = await resolveTarget(env, key);
  if (target.kind === "ended") {
    if (target.ownerLostPlus) await roomStub(env, key).endFixed();
    return false;
  }
  if (target.kind === "fixed") return roomStub(env, key).ensureFixed(target.owner);
  return true;
}

function safeAvatarUrl(value: string | null): string | null {
  if (!value || value.length > MAX_AVATAR_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Perfil, selos, limite de vídeos, cosméticos equipados e reações de pacote de quem entra logado,
 * consultados agora no servidor (nunca vindos do navegador).
 */
async function roomAccountFor(env: AppEnv, viewer: Viewer & { handle: string }): Promise<RoomAccount> {
  const [{ plan, badges }, equipped] = await Promise.all([
    getPlanStatus(env, viewer.userId),
    getEquipped(env, viewer.userId),
  ]);
  return {
    userId: viewer.userId,
    handle: viewer.handle,
    avatarUrl: safeAvatarUrl(viewer.avatarUrl),
    badges,
    plus: plan.plus,
    videosPerPerson: plan.plus ? PLUS_VIDEOS_PER_PERSON : VIDEOS_PER_PERSON,
    cosmetics: equipped.cosmetics,
    reactions: equipped.reactions,
  };
}

/** Conta logada com o primeiro acesso concluído (o @nome existe), ou `null`. */
function onboardedViewer(viewer: Viewer | null): (Viewer & { handle: string }) | null {
  if (!viewer?.onboarded || viewer.handle === null) return null;
  return { ...viewer, handle: viewer.handle };
}

/** Limite de requisições por IP (binding de Rate Limiting do Workers). */
const rateLimit: MiddlewareHandler<Env> = async (c, next) => {
  const { success } = await c.env.API_RATE_LIMITER.limit({ key: `ip:${clientIp(c)}` });
  if (!success) return apiError(c, "rate_limited");
  await next();
};

export const rooms = new Hono<Env>();

// Cria a sala comum e devolve o token do dono (só sai aqui; o Durable Object guarda o hash). A sala
// de link fixo não é criada aqui: existe sozinha enquanto o dono tem Plus. A sala protegida exige
// conta com o primeiro acesso concluído, Plus ativo, ouro e a retransmissão configurada; a conta que
// cria é quem paga.
rooms.post("/", rateLimit, async (c) => {
  const body = createRoomRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  if (!(await verifyTurnstile(c.env, body.data.turnstileToken, clientIp(c)))) {
    return apiError(c, "turnstile_failed");
  }
  let protectedOwner: { ownerUserId: string } | undefined;
  if (body.data.protected) {
    const viewer = await getViewer(c);
    if (!viewer) return apiError(c, "unauthorized");
    const member = onboardedViewer(viewer);
    if (!member) return apiError(c, "onboarding_required");
    if (!(await getPlanStatus(c.env, member.userId)).plan.plus) return apiError(c, "plus_required");
    if (!(await hasGold(c.env, member.userId))) return apiError(c, "insufficient_funds");
    if (!isTurnConfigured(c.env)) return apiError(c, "protected_unavailable");
    protectedOwner = { ownerUserId: member.userId };
  }
  const ownerToken = randomToken(32);
  const ownerTokenHash = await sha256(ownerToken);
  let code = generateRoomCode();
  // Colisão é praticamente impossível (32^10 códigos), mas o código em uso nunca é reaproveitado.
  while (!(await roomStub(c.env, code).create(ownerTokenHash, protectedOwner))) code = generateRoomCode();
  return c.json(createRoomResponseSchema.parse({ code, ownerToken }));
});

rooms.get("/:key", async (c) => {
  const ended = {
    status: "ended" as const,
    participants: 0,
    capacity: ROOM_MAX_PEOPLE,
    fixed: false,
    protected: false,
  };
  const key = parseKey(c);
  if (!key || !(await openTarget(c.env, key))) return c.json(roomInfoResponseSchema.parse(ended));
  const info = await roomStub(c.env, key).info();
  return c.json(roomInfoResponseSchema.parse(info));
});

/**
 * Registro de acesso da entrada em sala (D28). Falha de escrita não impede a entrada: vai ao Sentry
 * sem o IP nem os valores da consulta.
 */
async function logRoomJoin(
  env: AppEnv,
  entry: { userId: string | null; sessionId: string | null; ip: string; roomKey: string },
): Promise<void> {
  try {
    await recordAccess(env, { kind: "room_join", ...entry, now: Date.now() });
  } catch (error) {
    captureException(
      new Error("registro de acesso: falha ao gravar a entrada em sala", {
        cause: error instanceof Error ? error.name : undefined,
      }),
    );
  }
}

rooms.post("/:key/join", rateLimit, async (c) => {
  const key = parseKey(c);
  if (!key) return apiError(c, "room_ended");
  const body = joinRoomRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const viewer = await getViewer(c);
  // Logado sem o primeiro acesso: precisa concluir antes de entrar com a conta.
  if (viewer && !viewer.onboarded) return apiError(c, "onboarding_required");
  const member = onboardedViewer(viewer);
  // Sem conta, o apelido é obrigatório (como sempre foi). Com conta, o do corpo é ignorado.
  if (!member && !body.data.nickname) return apiError(c, "invalid_request");
  const ip = clientIp(c);
  if (!(await verifyTurnstile(c.env, body.data.turnstileToken, ip))) {
    return apiError(c, "turnstile_failed");
  }
  if (!(await openTarget(c.env, key))) return apiError(c, "room_ended");
  const stub = roomStub(c.env, key);

  if (member) {
    const participantId = await accountParticipantIdFor(key, member.userId);
    const account = await roomAccountFor(c.env, member);
    const result = await stub.admit({ participantId, nickname: member.nickname, ip, account });
    if (result !== "ok") return apiError(c, result);
    await logRoomJoin(c.env, { userId: member.userId, sessionId: null, ip, roomKey: key });
    return c.json(joinRoomResponseSchema.parse({ participantId, nickname: member.nickname }));
  }

  const nickname = body.data.nickname!;
  const existing = await readSession(c);
  const sid = existing?.sid ?? newSessionId();
  const participantId = await participantIdFor(key, sid);
  const result = await stub.admit({ participantId, nickname, ip, account: null });
  if (result !== "ok") return apiError(c, result);

  await writeSession(c, sid, nickname);
  await logRoomJoin(c.env, { userId: null, sessionId: sid, ip, roomKey: key });
  return c.json(joinRoomResponseSchema.parse({ participantId, nickname }));
});

/**
 * Identidade admitida nesta sala, ou o erro correspondente. Quem está logado (com o primeiro acesso
 * concluído) é identificado pela conta, com perfil e plano relidos agora; os demais, pelo cookie de
 * convidado.
 */
async function admittedIdentity(
  c: Ctx,
): Promise<{ key: string; identity: RoomIdentity } | { error: ApiErrorCode }> {
  const key = parseKey(c);
  if (!key) return { error: "room_ended" };
  const ip = clientIp(c);
  const member = onboardedViewer(await getViewer(c));
  let identity: RoomIdentity;
  if (member) {
    identity = {
      participantId: await accountParticipantIdFor(key, member.userId),
      nickname: member.nickname,
      ip,
      account: await roomAccountFor(c.env, member),
    };
  } else {
    const session = await readSession(c);
    if (!session) return { error: "unauthorized" };
    identity = {
      participantId: await participantIdFor(key, session.sid),
      nickname: session.nickname,
      ip,
      account: null,
    };
  }
  if (!(await openTarget(c.env, key))) return { error: "room_ended" };
  const check = await roomStub(c.env, key).checkAdmission(identity.participantId, ip);
  if (check !== "ok") return { error: check };
  return { key, identity };
}

rooms.get("/:key/ice", async (c) => {
  const admitted = await admittedIdentity(c);
  if ("error" in admitted) return apiError(c, admitted.error);
  const { key, identity } = admitted;
  const info = await roomStub(c.env, key).info();
  // Identificador por sessão (risco 10): sem dado pessoal em claro, derivado da sala e do
  // participante, para conferir o uso de cada credencial na análise do TURN.
  const customIdentifier = (await sha256(`turn:${key}:${identity.participantId}`)).slice(0, 32);
  const body = iceServersResponseSchema.parse(
    await generateIceServers(c.env, { customIdentifier, relayOnly: info.protected }),
  );
  c.header("Cache-Control", "no-store");
  return c.json(body);
});

const WS_CLOSE_FOR: Partial<Record<ApiErrorCode, number>> = {
  room_ended: WS_CLOSE.roomEnded,
  banned: WS_CLOSE.banned,
  unauthorized: WS_CLOSE.unauthorized,
};

rooms.get("/:key/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return apiError(c, "invalid_request");
  }
  const admitted = await admittedIdentity(c);
  if ("error" in admitted) {
    return refuse(WS_CLOSE_FOR[admitted.error] ?? WS_CLOSE.unauthorized, admitted.error);
  }
  // Requisição montada do zero: nenhum cabeçalho do cliente chega ao Durable Object.
  const forwarded = new Request("https://room.internal/ws", {
    headers: {
      Upgrade: "websocket",
      [ROOM_IDENTITY_HEADER]: encodeURIComponent(JSON.stringify(admitted.identity)),
    },
  });
  return roomStub(c.env, admitted.key).fetch(forwarded);
});
