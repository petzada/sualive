import {
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  HAND_RATE_MAX,
  HAND_RATE_WINDOW_MS,
  MIC_RATE_MAX,
  MIC_RATE_WINDOW_MS,
  REACTION_RATE_MAX,
  REACTION_RATE_WINDOW_MS,
} from "@sualive/config";

/**
 * Limites de frequência por pessoa na sala (D27): chat, reações, mão e microfone. Valem por
 * participante, não por conexão: o Durable Object guarda os horários no storage, então reconectar
 * ou abrir outra aba não zera.
 */

export type RateKind = "chat" | "reaction" | "hand" | "mic";

export const RATE_LIMITS: Record<RateKind, { max: number; windowMs: number }> = {
  chat: { max: CHAT_RATE_MAX, windowMs: CHAT_RATE_WINDOW_MS },
  reaction: { max: REACTION_RATE_MAX, windowMs: REACTION_RATE_WINDOW_MS },
  hand: { max: HAND_RATE_MAX, windowMs: HAND_RATE_WINDOW_MS },
  mic: { max: MIC_RATE_MAX, windowMs: MIC_RATE_WINDOW_MS },
};

/** Horários recentes de cada ação de uma pessoa. */
export type RateState = Partial<Record<RateKind, number[]>>;

/**
 * Registra a ação se couber no limite. Devolve se vale e o estado novo (só com os horários ainda
 * dentro da janela).
 */
export function takeRate(
  state: RateState,
  kind: RateKind,
  now: number,
): { allowed: boolean; state: RateState } {
  const { max, windowMs } = RATE_LIMITS[kind];
  const recent = (state[kind] ?? []).filter((t) => now - t < windowMs && t <= now);
  if (recent.length >= max) return { allowed: false, state: { ...state, [kind]: recent } };
  return { allowed: true, state: { ...state, [kind]: [...recent, now] } };
}
