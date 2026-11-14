import { ACCOUNT_SESSION_TTL_SECONDS } from "@sualive/config";
import { eq } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Ctx } from "../account/http";
import { randomToken, sha256 } from "../crypto";
import { createDb } from "../db";
import { sessions, users } from "../db/schema";
import type { AppEnv } from "../env";

/**
 * Sessão de quem tem conta [padrão]: token aleatório forte num cookie `__Host-` HttpOnly, Secure,
 * SameSite=Lax, Path=/. No D1 fica só o hash do token (`sessions.id`); o token nunca é guardado.
 */
export const ACCOUNT_COOKIE_NAME = "sualive_account";
/** Nome real enviado pelo navegador (com o prefixo `__Host-`). */
export const ACCOUNT_COOKIE_HEADER_NAME = `__Host-${ACCOUNT_COOKIE_NAME}`;

const TOKEN_BYTES = 32;
/** 32 bytes em base64url sem preenchimento = 43 caracteres. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type UserRow = typeof users.$inferSelect;

export function sessionIdFor(token: string): Promise<string> {
  return sha256(`account-session:${token}`);
}

/** Cria a sessão no D1 e devolve o token (que vai só para o cookie). */
export async function createAccountSession(env: AppEnv, userId: string): Promise<string> {
  const token = randomToken(TOKEN_BYTES);
  const now = Date.now();
  await createDb(env.DB)
    .insert(sessions)
    .values({
      id: await sessionIdFor(token),
      userId,
      createdAt: now,
      expiresAt: now + ACCOUNT_SESSION_TTL_SECONDS * 1000,
    });
  return token;
}

export function setAccountCookie(c: Ctx, token: string): void {
  setCookie(c, ACCOUNT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: ACCOUNT_SESSION_TTL_SECONDS,
    prefix: "host",
  });
}

export function clearAccountCookie(c: Ctx): void {
  deleteCookie(c, ACCOUNT_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    prefix: "host",
  });
}

/** Hash do token do cookie, se o cookie tiver o formato certo. */
async function cookieSessionId(c: Ctx): Promise<string | null> {
  const token = getCookie(c, ACCOUNT_COOKIE_NAME, "host");
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  return sessionIdFor(token);
}

/**
 * Conta da sessão do cookie, ou `null` (ausente, malformada, desconhecida ou vencida). Sessão
 * vencida é apagada.
 */
export async function readAccountSession(c: Ctx): Promise<UserRow | null> {
  const id = await cookieSessionId(c);
  if (!id) return null;
  const db = createDb(c.env.DB);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return row.user;
}

/** Apaga a sessão do cookie (se houver) no D1. */
export async function deleteAccountSession(c: Ctx): Promise<void> {
  const id = await cookieSessionId(c);
  if (id) await createDb(c.env.DB).delete(sessions).where(eq(sessions.id, id));
}
