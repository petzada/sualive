/**
 * Único lugar para valores numéricos do produto (limites, preços, prazos).
 * Cada entrega acrescenta aqui os parâmetros que passa a usar; nada fica espalhado pelo código.
 */

export const APP_NAME = "sualive";

export const ENVIRONMENTS = ["production", "staging", "development"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

// ---------- Sala direta (entrega 1) ----------

/** Pessoas na sala direta (12 a partir da entrega 4). */
export const ROOM_MAX_PEOPLE = 12;
/** Vídeos simultâneos por pessoa (tela ou webcam). */
export const VIDEOS_PER_PERSON = 2;
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
/** Qualidade sem Plus: até 1080p, 60 fps, 5 Mbps. */
export const FREE_VIDEO_QUALITY: VideoQuality = {
  width: 1920,
  height: 1080,
  frameRate: 60,
  maxBitrate: 5_000_000,
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
/**
 * Versão dos Termos de Uso e das Políticas de Privacidade. Começa pela data (AAAA-MM-DD); uma
 * outra mudança no mesmo dia ganha um sufixo (".2", ".3"). Quem tem conta e ainda não viu esta versão
 * recebe a faixa de aviso (vale o uso continuado).
 */
export const TERMS_VERSION = "2026-11-16";
/** Data da versão atual dos termos (AAAA-MM-DD), para mostrar. */
export const TERMS_DATE = TERMS_VERSION.slice(0, 10);

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
export const PLUS_MONTHLY_PRICE_CENTS = 990;
export const PLUS_ANNUAL_PRICE_CENTS = 7990;
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
export const PLUS_VIDEOS_PER_PERSON = 4;
/** Qualidade Plus: até 2160p (4K), 240 fps, 32 Mbps. Em conexão retransmitida vale RELAY_VIDEO_QUALITY. */
export const PLUS_VIDEO_QUALITY: VideoQuality = {
  width: 3840,
  height: 2160,
  frameRate: 240,
  maxBitrate: 32_000_000,
};

/** Temas prontos de sala (o dono Plus escolhe um). O primeiro é o padrão de toda sala. */
export const ROOM_THEMES = ["default", "ocean", "forest", "sunset", "lavender", "graphite"] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number];

/** Prefixo da rota da sala de link fixo no front: `/@<nome>`. */
export const FIXED_ROOM_PATH_PREFIX = "/@";

// ---------- Carteira, loja e presentes (entrega 3) ----------

/** As duas moedas da conta. Prata se ganha de graça e só compra cosméticos; ouro se compra. */
export const CURRENCIES = ["silver", "gold"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Câmbio: quanto ouro vale R$ 1. */
export const GOLD_PER_BRL = 100;

/** Ouro do Plus pago: PLUS_GOLD_AMOUNT a cada PLUS_GOLD_INTERVAL_DAYS. */
export const PLUS_GOLD_AMOUNT = 500;
export const PLUS_GOLD_INTERVAL_DAYS = 30;
/** Créditos de ouro que cada pagamento rende: o mensal paga um mês; o anual, doze. */
export const PLUS_GOLD_CREDITS_MONTHLY = 1;
export const PLUS_GOLD_CREDITS_ANNUAL = 12;

/** Pacotes de ouro por Pix único. */
export const GOLD_PACKS = [
  { id: "gold_990", priceCents: 990, gold: 990 },
  { id: "gold_2190", priceCents: 1990, gold: 2190 },
  { id: "gold_5990", priceCents: 4990, gold: 5990 },
] as const;
export type GoldPackId = (typeof GOLD_PACKS)[number]["id"];

/** Prata de boas-vindas, uma vez por conta. */
export const WELCOME_SILVER = 300;

/** Ouro que uma conta pode enviar por dia (dia de calendário em WALLET_TIME_ZONE). */
export const GOLD_GIFT_DAILY_LIMIT = 2000;
export const WALLET_TIME_ZONE = "America/Sao_Paulo";

/** Presentear Plus a outra conta: preço em ouro e dias concedidos. */
export const PLUS_GIFT_PRICE_GOLD = 990;
export const PLUS_GIFT_DAYS = 30;

/** Tipos de item da loja. */
export const SHOP_ITEM_KINDS = ["name_color", "name_gradient", "avatar_frame", "reaction_pack"] as const;
export type ShopItemKind = (typeof SHOP_ITEM_KINDS)[number];

/** Linhas do extrato por página. */
export const WALLET_LEDGER_PAGE_SIZE = 30;
/** Reações disponíveis para uma pessoa: as básicas mais as dos pacotes equipados (teto). */
export const REACTIONS_MAX_PER_PERSON = 48;

// ---------- Sala de 12, retransmissão paga e sala protegida (entrega 4) ----------

/** Vídeos que uma pessoa assiste ao mesmo tempo. O servidor recusa o seguinte. */
export const WATCHED_VIDEOS_PER_PERSON = 4;
/** Até este número de pessoas na sala, o vídeo novo abre sozinho para todos; acima, só com "Assistir". */
export const AUTO_WATCH_MAX_PEOPLE = 6;

/** Som da tela em conexão retransmitida (bps). */
export const RELAY_SCREEN_AUDIO_MAX_BITRATE = 64_000;

/** Sala protegida: toda a mídia pela retransmissão, para esconder o IP. */
export const PROTECTED_ROOM_MAX_PEOPLE = 6;
export const PROTECTED_ROOM_MAX_VIDEOS = 2;

/**
 * Preços do que gasta banda nossa, em ouro por hora, debitados por minuto. Saem da medição de
 * custo de 16/11/2026 (docs/medicao-custo-retransmissao.md) pela regra do DECISOES.md: pior caso
 * medido × 2 ÷ R$ 0,0082. O do par foi medido; o da sala protegida é extrapolado para 6 pessoas
 * e 2 vídeos, e deve ser medido de novo com uso real.
 */
export const RELAY_VIDEO_GOLD_PER_HOUR = 50;
export const PROTECTED_ROOM_GOLD_PER_HOUR = 570;
/** De quanto em quanto tempo a sala cobra (ms). */
export const METER_INTERVAL_MS = 60_000;
/** Avisos ao dono da sala protegida, em minutos de saldo que restam. */
export const PROTECTED_ROOM_WARNING_MINUTES = [10, 2] as const;
/** Saldo zerado na sala protegida: tolerância antes de encerrar para todos (ms). */
export const PROTECTED_ROOM_GRACE_MS = 3 * 60_000;

/** Moderadores permanentes da sala de link fixo (só contas). */
export const FIXED_ROOM_MODERATORS_MAX = 10;

/**
 * Limites de frequência por pessoa (não por conexão): no máximo `max` a cada `windowMs`. O do chat
 * continua em CHAT_RATE_MAX / CHAT_RATE_WINDOW_MS.
 */
export const REACTION_RATE_MAX = 10;
export const REACTION_RATE_WINDOW_MS = 5_000;
export const HAND_RATE_MAX = 6;
export const HAND_RATE_WINDOW_MS = 30_000;
export const MIC_RATE_MAX = 10;
export const MIC_RATE_WINDOW_MS = 10_000;

/** Registro de acesso (IP, data e hora de login e de entrada em sala): guardado por 6 meses. */
export const ACCESS_LOG_RETENTION_DAYS = 183;
