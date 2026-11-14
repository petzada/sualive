/**
 * Único lugar para valores numéricos do produto (limites, preços, prazos).
 * Cada entrega acrescenta aqui os parâmetros que passa a usar; nada fica espalhado pelo código.
 */

export const APP_NAME = "sualive";

export const ENVIRONMENTS = ["production", "staging", "development"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

// ---------- Sala direta (entrega 1) ----------

/** Pessoas na sala direta. */
export const ROOM_MAX_PEOPLE = 6;
/** Vídeos simultâneos por sala. */
export const ROOM_MAX_VIDEOS = 4;
/** Vídeos simultâneos por pessoa (tela ou webcam). */
export const VIDEOS_PER_PERSON = 1;
/** Sala vazia expira depois de (ms). Vale também para a sala criada e nunca usada. */
export const ROOM_EMPTY_TTL_MS = 5 * 60 * 1000;

/** Código da sala: curto e difícil de adivinhar. Alfabeto sem caracteres ambíguos (0/o, 1/l). */
export const ROOM_CODE_LENGTH = 10;
export const ROOM_CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
/** Prefixo da rota da sala no front: `/s/<código>`. */
export const ROOM_PATH_PREFIX = "/s/";

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 24;

/** Mensagens guardadas para quem entra depois. */
export const CHAT_HISTORY_SIZE = 200;
export const CHAT_MAX_LENGTH = 2000;
/** Limite de mensagens por pessoa: CHAT_RATE_MAX a cada CHAT_RATE_WINDOW_MS. */
export const CHAT_RATE_MAX = 5;
export const CHAT_RATE_WINDOW_MS = 5000;

/** Reações rápidas disponíveis. */
export const REACTIONS = ["👍", "👏", "😂", "❤️", "😮", "🎉"] as const;
export type Reaction = (typeof REACTIONS)[number];

export interface VideoQuality {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}
/** Qualidade gratuita: 720p, 30 fps, até 1,5 Mbps. */
export const FREE_VIDEO_QUALITY: VideoQuality = {
  width: 1280,
  height: 720,
  frameRate: 30,
  maxBitrate: 1_500_000,
};
/** Conexão retransmitida (TURN): 720p, até 1,5 Mbps, para todos. */
export const RELAY_VIDEO_QUALITY: VideoQuality = {
  width: 1280,
  height: 720,
  frameRate: 30,
  maxBitrate: 1_500_000,
};

/** Validade das credenciais de TURN geradas pelo Worker (s). */
export const TURN_CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;
/** Validade do cookie de sessão de quem não tem conta (s). */
export const GUEST_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Limite de requisições por IP nas rotas que criam sala ou entram em sala. */
export const API_RATE_LIMIT_MAX = 20;
export const API_RATE_LIMIT_WINDOW_SECONDS = 60;
