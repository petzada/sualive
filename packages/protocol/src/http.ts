import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  HANDLE_PATTERN,
} from "@sualive/config";
import { z } from "zod";

export const environmentSchema = z.enum(["production", "staging", "development"]);

/** Resposta de `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  /** SHA do commit publicado; "dev" fora do CI. */
  commit: z.string().min(1),
  environment: environmentSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ---------- Campos comuns ----------

export const roomCodeSchema = z
  .string()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), "invalid room code");

/**
 * Chave da sala nas rotas `/api/rooms/:key`: o código de uma sala comum ou `@nome` para a sala
 * de link fixo de um assinante (entrega 2).
 */
export const roomKeySchema = z.union([
  roomCodeSchema,
  z.string().regex(new RegExp(`^@${HANDLE_PATTERN.slice(1)}`), "invalid room key"),
]);

/** Apelido: aparado, de NICKNAME_MIN_LENGTH a NICKNAME_MAX_LENGTH caracteres. */
export const nicknameSchema = z.string().trim().min(NICKNAME_MIN_LENGTH).max(NICKNAME_MAX_LENGTH);

/** Identificador público do participante dentro da sala (não é o identificador da sessão). */
export const participantIdSchema = z.string().min(1).max(64);

const turnstileTokenSchema = z.string().min(1).max(4096);

// ---------- Erros ----------

export const apiErrorCodeSchema = z.enum([
  "invalid_request",
  "turnstile_failed",
  "rate_limited",
  "room_ended", // a sala acabou ou nunca existiu (não dá para distinguir: nada é guardado)
  "room_full",
  "banned",
  "unauthorized", // sem sessão válida ou sem admissão na sala
  "not_found",
  "internal_error",
  // Conta e Plus (entrega 2)
  "onboarding_required", // logado, mas falta concluir o primeiro acesso
  "handle_taken",
  "handle_reserved",
  "handle_change_too_soon",
  "provider_unavailable", // login não configurado neste ambiente
  "plus_required",
  "billing_unavailable", // assinatura desligada neste ambiente
  "already_subscribed",
  // Carteira, loja e presentes (entrega 3)
  "insufficient_funds", // saldo menor que o valor
  "daily_limit", // passaria do limite diário de envio de ouro
  "recipient_not_found", // @nome inexistente ou sem o primeiro acesso concluído
  "self_gift", // presente para a própria conta
  "already_owned",
  "not_owned",
  // Sala protegida (entrega 4)
  "protected_unavailable", // retransmissão não configurada neste ambiente
  "room_in_use", // a sala de link fixo só muda de tipo vazia
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Corpo de toda resposta de erro da API. */
export const apiErrorSchema = z.object({ error: apiErrorCodeSchema });
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------- POST /api/rooms ----------

export const createRoomRequestSchema = z.object({
  turnstileToken: turnstileTokenSchema,
  /**
   * Sala protegida: só conta com Plus ativo e ouro (`plus_required`, `insufficient_funds`); o
   * dono é reconhecido pela conta e pelo token.
   */
  protected: z.boolean().optional(),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const createRoomResponseSchema = z.object({
  code: roomCodeSchema,
  /** Token secreto do dono. O navegador guarda e envia no `hello` do WebSocket. Só sai aqui. */
  ownerToken: z.string().min(32).max(128),
});
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

// ---------- GET /api/rooms/:code ----------

export const roomInfoResponseSchema = z.object({
  status: z.enum(["open", "ended"]),
  /** Pessoas conectadas agora. */
  participants: z.number().int().min(0),
  capacity: z.number().int().min(1),
  /** Sala de link fixo de um assinante (não expira quando esvazia). */
  fixed: z.boolean(),
  /** Sala protegida: o lobby avisa que a mídia passa pela retransmissão. */
  protected: z.boolean(),
});
export type RoomInfoResponse = z.infer<typeof roomInfoResponseSchema>;

// ---------- POST /api/rooms/:code/join ----------
// Valida o Turnstile, confere banimento e lotação, grava o cookie de sessão (HttpOnly, assinado,
// com identificador aleatório e apelido) e admite a sessão na sala. Só depois o WebSocket abre.

export const joinRoomRequestSchema = z.object({
  /** Obrigatório para quem não tem conta. Quem está logado entra com o apelido do perfil. */
  nickname: nicknameSchema.optional(),
  turnstileToken: turnstileTokenSchema,
});
export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>;

export const joinRoomResponseSchema = z.object({
  participantId: participantIdSchema,
  nickname: nicknameSchema,
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

// ---------- GET /api/rooms/:code/ice ----------
// Credenciais de TURN de curta duração. Exige sessão admitida na sala.

export const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});
export const iceServersResponseSchema = z.object({
  iceServers: z.array(iceServerSchema),
  ttlSeconds: z.number().int().min(1),
  /** Sala protegida: o navegador só pode usar candidatos de retransmissão. */
  relayOnly: z.boolean(),
});
export type IceServersResponse = z.infer<typeof iceServersResponseSchema>;

// ---------- GET /api/rooms/:code/ws ----------
// Upgrade para WebSocket. Exige sessão admitida. Mensagens em `./room`.
