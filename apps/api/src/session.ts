import { GUEST_SESSION_TTL_SECONDS } from "@sualive/config";
import { nicknameSchema } from "@sualive/protocol";
import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { randomToken, sha256 } from "./crypto";
import type { AppEnv } from "./env";

/**
 * Sessão de quem não tem conta: cookie `__Host-` assinado com HMAC (SESSION_SECRET), HttpOnly,
 * Secure, SameSite=Lax, Path=/. Guarda um identificador aleatório, o apelido e quando foi emitido;
 * a validade é conferida também no servidor, não só pelo Max-Age.
 */
export const SESSION_COOKIE_NAME = "sualive_session";
/** Nome real enviado pelo navegador (com o prefixo `__Host-`). */
export const SESSION_COOKIE_HEADER_NAME = `__Host-${SESSION_COOKIE_NAME}`;

export interface GuestSession {
  sid: string;
  nickname: string;
  issuedAt: number;
}

function parseSession(value: unknown): GuestSession | null {
  if (typeof value !== "object" || value === null) return null;
  const { sid, nickname, issuedAt } = value as Record<string, unknown>;
  if (typeof sid !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(sid)) return null;
  if (typeof issuedAt !== "number" || !Number.isInteger(issuedAt)) return null;
  const parsedNickname = nicknameSchema.safeParse(nickname);
  if (!parsedNickname.success) return null;
  return { sid, nickname: parsedNickname.data, issuedAt };
}

type Ctx = Context<{ Bindings: AppEnv }>;

function sessionSecret(env: AppEnv): string {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET ausente");
  return env.SESSION_SECRET;
}

/** Sessão válida do cookie, ou `null` (ausente, adulterada, malformada ou vencida). */
export async function readSession(c: Ctx): Promise<GuestSession | null> {
  const raw = await getSignedCookie(c, sessionSecret(c.env), SESSION_COOKIE_NAME, "host");
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const session = parseSession(parsed);
  if (!session) return null;
  const ageSeconds = (Date.now() - session.issuedAt) / 1000;
  if (ageSeconds < 0 || ageSeconds > GUEST_SESSION_TTL_SECONDS) return null;
  return session;
}

/** Identificador aleatório de uma sessão nova. */
export function newSessionId(): string {
  return randomToken(24);
}

/**
 * Grava o cookie com o identificador (o de uma sessão válida já existente, mantido, ou um novo) e
 * o apelido atual. A validade recomeça a contar.
 */
export async function writeSession(c: Ctx, sid: string, nickname: string): Promise<GuestSession> {
  const session: GuestSession = { sid, nickname, issuedAt: Date.now() };
  await setSignedCookie(c, SESSION_COOKIE_NAME, JSON.stringify(session), sessionSecret(c.env), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: GUEST_SESSION_TTL_SECONDS,
    prefix: "host",
  });
  return session;
}

/**
 * Identificador público do participante: hash do identificador da sessão com o código da sala
 * como sal. Estável para a mesma sessão na mesma sala, diferente entre salas e irreversível.
 */
export function participantIdFor(code: string, sid: string): Promise<string> {
  return sha256(`participant:${code}:${sid}`);
}

/**
 * Identificador público de quem entra logado: deriva da conta (não do cookie de convidado), então a
 * mesma conta em dois navegadores é a mesma pessoa na sala. O `:account:` não colide com um
 * identificador de sessão (que não tem dois-pontos).
 */
export function accountParticipantIdFor(key: string, userId: string): Promise<string> {
  return sha256(`participant:${key}:account:${userId}`);
}
