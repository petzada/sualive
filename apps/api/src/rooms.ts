import { ROOM_MAX_PEOPLE } from "@sualive/config";
import {
  createRoomRequestSchema,
  createRoomResponseSchema,
  iceServersResponseSchema,
  joinRoomRequestSchema,
  joinRoomResponseSchema,
  roomCodeSchema,
  roomInfoResponseSchema,
  WS_CLOSE,
  type ApiErrorCode,
} from "@sualive/protocol";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { generateRoomCode, randomToken, sha256 } from "./crypto";
import type { AppEnv } from "./env";
import { generateIceServers, verifyTurnstile } from "./external";
import { refuse, ROOM_IDENTITY_HEADER, type RoomIdentity } from "./room";
import { newSessionId, participantIdFor, readSession, writeSession } from "./session";

type Env = { Bindings: AppEnv };
type Ctx = Context<Env>;

const ERROR_STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  turnstile_failed: 403,
  rate_limited: 429,
  room_ended: 410,
  room_full: 409,
  banned: 403,
  unauthorized: 401,
  not_found: 404,
  internal_error: 500,
};

function apiError(c: Ctx, error: ApiErrorCode): Response {
  return c.json({ error }, ERROR_STATUS[error]);
}

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

function roomStub(env: AppEnv, code: string) {
  return env.ROOM.get(env.ROOM.idFromName(code));
}

/** Limite de requisições por IP (binding de Rate Limiting do Workers). */
const rateLimit: MiddlewareHandler<Env> = async (c, next) => {
  const { success } = await c.env.API_RATE_LIMITER.limit({ key: `ip:${clientIp(c)}` });
  if (!success) return apiError(c, "rate_limited");
  await next();
};

export const rooms = new Hono<Env>();

// Cria a sala e devolve o token do dono (só sai aqui; o Durable Object guarda o hash).
rooms.post("/", rateLimit, async (c) => {
  const body = createRoomRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  if (!(await verifyTurnstile(c.env, body.data.turnstileToken, clientIp(c)))) {
    return apiError(c, "turnstile_failed");
  }
  const ownerToken = randomToken(32);
  const ownerTokenHash = await sha256(ownerToken);
  let code = generateRoomCode();
  // Colisão é praticamente impossível (32^10 códigos), mas o código em uso nunca é reaproveitado.
  while (!(await roomStub(c.env, code).create(ownerTokenHash))) code = generateRoomCode();
  return c.json(createRoomResponseSchema.parse({ code, ownerToken }));
});

rooms.get("/:code", async (c) => {
  const code = roomCodeSchema.safeParse(c.req.param("code"));
  const info = code.success
    ? await roomStub(c.env, code.data).info()
    : { status: "ended" as const, participants: 0 };
  return c.json(roomInfoResponseSchema.parse({ ...info, capacity: ROOM_MAX_PEOPLE }));
});

rooms.post("/:code/join", rateLimit, async (c) => {
  const code = roomCodeSchema.safeParse(c.req.param("code"));
  if (!code.success) return apiError(c, "room_ended");
  const body = joinRoomRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const ip = clientIp(c);
  if (!(await verifyTurnstile(c.env, body.data.turnstileToken, ip))) {
    return apiError(c, "turnstile_failed");
  }

  const existing = await readSession(c);
  const sid = existing?.sid ?? newSessionId();
  const participantId = await participantIdFor(code.data, sid);
  const nickname = body.data.nickname;
  const result = await roomStub(c.env, code.data).admit({ participantId, nickname, ip });
  if (result !== "ok") return apiError(c, result);

  await writeSession(c, sid, nickname);
  return c.json(joinRoomResponseSchema.parse({ participantId, nickname }));
});

/** Sessão válida e admitida nesta sala, ou o erro correspondente. */
async function admittedIdentity(
  c: Ctx,
): Promise<{ code: string; identity: RoomIdentity } | { error: ApiErrorCode }> {
  const code = roomCodeSchema.safeParse(c.req.param("code"));
  if (!code.success) return { error: "room_ended" };
  const session = await readSession(c);
  if (!session) return { error: "unauthorized" };
  const participantId = await participantIdFor(code.data, session.sid);
  const ip = clientIp(c);
  const check = await roomStub(c.env, code.data).checkAdmission(participantId, ip);
  if (check !== "ok") return { error: check };
  return { code: code.data, identity: { participantId, nickname: session.nickname, ip } };
}

rooms.get("/:code/ice", async (c) => {
  const admitted = await admittedIdentity(c);
  if ("error" in admitted) return apiError(c, admitted.error);
  const body = iceServersResponseSchema.parse(await generateIceServers(c.env));
  c.header("Cache-Control", "no-store");
  return c.json(body);
});

const WS_CLOSE_FOR: Partial<Record<ApiErrorCode, number>> = {
  room_ended: WS_CLOSE.roomEnded,
  banned: WS_CLOSE.banned,
  unauthorized: WS_CLOSE.unauthorized,
};

rooms.get("/:code/ws", async (c) => {
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
  return roomStub(c.env, admitted.code).fetch(forwarded);
});
