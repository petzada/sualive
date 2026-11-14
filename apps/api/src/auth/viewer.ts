import type { Context } from "hono";
import type { AppEnv } from "../env";
import { readAccountSession, type UserRow } from "./session";

/**
 * Quem está logado nesta requisição. Contrato entre o login (que implementa) e o resto do Worker
 * (salas, Plus), que só conhece esta função.
 */
export interface Viewer {
  userId: string;
  /** Nulo até concluir o primeiro acesso. */
  handle: string | null;
  nickname: string;
  avatarUrl: string | null;
  /** Declarou 18 anos, aceitou os termos e escolheu o @nome. */
  onboarded: boolean;
  /** Tema da sala de link fixo. */
  roomTheme: string;
}

/** Primeiro acesso concluído: declarou 18 anos, aceitou os termos e escolheu o @nome. */
export function isOnboarded(user: UserRow): boolean {
  return user.adultConfirmedAt !== null && user.termsAcceptedAt !== null && user.handle !== null;
}

export function viewerFromUser(user: UserRow): Viewer {
  return {
    userId: user.id,
    handle: user.handle,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    onboarded: isOnboarded(user),
    roomTheme: user.roomTheme,
  };
}

// Memo por requisição: a mesma requisição consulta o D1 uma vez só.
const sessionUserByRequest = new WeakMap<Request, Promise<UserRow | null>>();

/**
 * Linha da conta da sessão desta requisição (memoizada), ou `null`. Cookie ausente ou inválido dá
 * `null`; só uma falha do próprio D1 propaga (vira 500 e vai ao Sentry).
 */
export function getSessionUser(c: Context<{ Bindings: AppEnv }>): Promise<UserRow | null> {
  let pending = sessionUserByRequest.get(c.req.raw);
  if (!pending) {
    pending = readAccountSession(c);
    sessionUserByRequest.set(c.req.raw, pending);
    // Não memoiza falha: outra chamada na mesma requisição tenta de novo.
    pending.catch(() => sessionUserByRequest.delete(c.req.raw));
  }
  return pending;
}

/** Sessão válida do cookie de conta, ou `null`. Nunca lança por cookie ausente ou inválido. */
export async function getViewer(c: Context<{ Bindings: AppEnv }>): Promise<Viewer | null> {
  const user = await getSessionUser(c);
  return user ? viewerFromUser(user) : null;
}
