import type { Context } from "hono";
import type { AppEnv } from "../env";

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

/** Sessão válida do cookie de conta, ou `null`. Nunca lança por cookie ausente ou inválido. */
// Implementação: tarefa de conta e login da entrega 2.
export async function getViewer(_c: Context<{ Bindings: AppEnv }>): Promise<Viewer | null> {
  return null;
}
