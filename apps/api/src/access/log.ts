import { ACCESS_LOG_RETENTION_DAYS } from "@sualive/config";
import type { AppEnv } from "../env";

/**
 * Registro de acesso (Marco Civil da Internet): conta ou sessão, IP, data e hora de cada login e de
 * cada entrada em sala, por ACCESS_LOG_RETENTION_DAYS. Nunca guarda conteúdo de sala. Não há painel:
 * a consulta é direto no D1.
 */
export interface AccessEntry {
  kind: "login" | "room_join";
  /** Conta, quando há. */
  userId: string | null;
  /** Sessão de visitante (o `sid` do cookie), quando não há conta. */
  sessionId: string | null;
  ip: string;
  /** Código da sala ou `@nome`, nas entradas em sala. */
  roomKey?: string | null;
  now: number;
}

/**
 * Grava uma linha. Falha de escrita não derruba o login nem a entrada na sala: é relatada por quem
 * chama (sem o IP na mensagem) e a requisição segue.
 */
export async function recordAccess(env: AppEnv, entry: AccessEntry): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO access_log (id, kind, user_id, session_id, ip, room_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      crypto.randomUUID(),
      entry.kind,
      entry.userId,
      entry.sessionId,
      entry.ip,
      entry.roomKey ?? null,
      entry.now,
    )
    .run();
}

/** Apaga o que passou do prazo de guarda. Devolve quantas linhas saíram. Roda na rotina diária. */
export async function purgeAccessLog(env: AppEnv, now: number): Promise<number> {
  const cutoff = now - ACCESS_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const result = await env.DB.prepare("DELETE FROM access_log WHERE created_at < ?1").bind(cutoff).run();
  return result.meta.changes ?? 0;
}
