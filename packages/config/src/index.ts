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

// ---------- Conta, perfil e Plus (entrega 2) ----------

/** Idade mínima declarada para ter conta. */
export const MINIMUM_AGE = 18;
/** Versão dos termos de uso e da política de privacidade aceitos no primeiro acesso. */
export const TERMS_VERSION = "2026-11-14";

/** @nome: letras minúsculas, números e sublinhado. */
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
export const HANDLE_PATTERN = "^[a-z0-9_]{3,20}$";
/** Troca de @nome permitida a cada (dias). */
export const HANDLE_CHANGE_INTERVAL_DAYS = 30;
/** @nomes que ninguém pode escolher (rotas e termos do produto). */
export const RESERVED_HANDLES = [
  "admin",
  "api",
  "s",
  "sualive",
  "suporte",
  "ajuda",
  "plus",
  "conta",
  "perfil",
  "termos",
  "privacidade",
  "entrar",
  "sair",
  "loja",
  "carteira",
  "salas",
  "demo",
  "plano",
  "planos",
  "manifesto",
] as const;

/** Validade da sessão de quem tem conta (s). */
export const ACCOUNT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Plus: preços em centavos e duração de cada ciclo em dias. */
export const PLUS_MONTHLY_PRICE_CENTS = 1990;
export const PLUS_ANNUAL_PRICE_CENTS = 15990;
export const PLUS_MONTHLY_PERIOD_DAYS = 30;
export const PLUS_ANNUAL_PERIOD_DAYS = 365;
/** Pix Automático: novas tentativas depois de uma cobrança falhar, dentro da janela (dias). */
export const PLUS_RETRY_ATTEMPTS = 3;
export const PLUS_RETRY_WINDOW_DAYS = 7;
/** Avisar antes de o plano anual vencer (dias). */
export const PLUS_ANNUAL_EXPIRY_NOTICE_DAYS = 7;
/** Selo de apoiador inicial: os primeiros pagantes do Plus. */
export const EARLY_SUPPORTER_LIMIT = 100;
/** Depois que o Plus acaba, o link fixo fica reservado por (dias). */
export const FIXED_LINK_RESERVE_DAYS = 30;

/** Vídeos simultâneos por pessoa com Plus. */
export const PLUS_VIDEOS_PER_PERSON = 2;
/** Qualidade Plus em sala direta: 1080p, 60 fps, até 5 Mbps. */
export const PLUS_VIDEO_QUALITY: VideoQuality = {
  width: 1920,
  height: 1080,
  frameRate: 60,
  maxBitrate: 5_000_000,
};

/** Temas prontos de sala (o dono Plus escolhe um). O primeiro é o padrão de toda sala. */
export const ROOM_THEMES = ["default", "ocean", "forest", "sunset", "lavender", "graphite"] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number];

/** Prefixo da rota da sala de link fixo no front: `/@<nome>`. */
export const FIXED_ROOM_PATH_PREFIX = "/@";
