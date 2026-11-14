import { CHAT_MAX_LENGTH, ROOM_THEMES } from "@sualive/config";
import { z } from "zod";
import { nicknameSchema, participantIdSchema } from "./http";
import { cosmeticsSchema, giftAmountSchema, reactionListSchema, reactionValueSchema } from "./wallet";

/**
 * Mensagens do WebSocket da sala (`GET /api/rooms/:code/ws`), em JSON, uma por quadro.
 * O servidor decide: limites de pessoas e de vídeos, papéis e banimento são do Durable Object.
 */

// ---------- Entidades ----------

export const videoKindSchema = z.enum(["screen", "camera"]);
export type VideoKind = z.infer<typeof videoKindSchema>;

export const videoIdSchema = z.string().min(1).max(64);

/** Um vídeo que o servidor autorizou um participante a transmitir. */
export const roomVideoSchema = z.object({ id: videoIdSchema, kind: videoKindSchema });
export type RoomVideo = z.infer<typeof roomVideoSchema>;

export const participantSchema = z.object({
  id: participantIdSchema,
  nickname: nicknameSchema,
  isOwner: z.boolean(),
  micMuted: z.boolean(),
  handRaised: z.boolean(),
  videos: z.array(roomVideoSchema),
  joinedAt: z.number().int(),
  // Conta (entrega 2). Quem não tem conta: handle e avatarUrl nulos, sem selos.
  handle: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  /** Selos ao lado do nome: "plus" e "early_supporter". */
  badges: z.array(z.enum(["plus", "early_supporter"])),
  /** Cosméticos equipados (entrega 3), lidos da conta ao conectar. Nulo para quem não tem conta. */
  cosmetics: cosmeticsSchema.nullable(),
  /** Tem conta: pode receber ouro pelo botão da sala. */
  canReceiveGold: z.boolean(),
});
export type Participant = z.infer<typeof participantSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(64),
  from: participantIdSchema,
  /** Apelido no momento do envio (quem enviou pode já ter saído). */
  nickname: nicknameSchema,
  text: z.string().min(1).max(CHAT_MAX_LENGTH),
  sentAt: z.number().int(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** As básicas (`REACTIONS`) ou as de um pacote equipado; o servidor confere a lista da pessoa. */
export const reactionSchema = reactionValueSchema;

/** O que vale para a sala inteira. */
export const roomSettingsSchema = z.object({
  /** Tema da sala. Sala comum: sempre o padrão. Link fixo: o que o dono Plus escolheu. */
  theme: z.enum(ROOM_THEMES),
  /** Sala de link fixo (permanente) de um assinante. */
  fixed: z.boolean(),
  /** @nome do dono da sala de link fixo (mostrado no cabeçalho no lugar do código). */
  ownerHandle: z.string().nullable(),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

/** Limites que o servidor aplica a ESTA pessoa (dependem do plano dela, não do dono). */
export const selfLimitsSchema = z.object({
  videosPerPerson: z.number().int().min(1),
  /** Reações que esta pessoa pode enviar: as básicas mais as dos pacotes equipados. */
  reactions: reactionListSchema,
});
export type SelfLimits = z.infer<typeof selfLimitsSchema>;

// ---------- Sinalização WebRTC (repassada pelo servidor sem interpretar) ----------

const SDP_MAX_LENGTH = 200_000;

export const signalDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("description"),
    description: z.object({
      type: z.enum(["offer", "answer", "pranswer", "rollback"]),
      sdp: z.string().max(SDP_MAX_LENGTH).optional(),
    }),
  }),
  z.object({
    kind: z.literal("candidate"),
    /** `null` marca o fim dos candidatos. */
    candidate: z
      .object({
        candidate: z.string().max(4096),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .nullable(),
  }),
  z.object({
    // Liga cada MediaStream de vídeo que o remetente publica ao vídeo autorizado pelo servidor.
    kind: z.literal("streams"),
    streams: z.array(z.object({ streamId: z.string().min(1).max(128), videoId: videoIdSchema })).max(8),
  }),
]);
export type SignalData = z.infer<typeof signalDataSchema>;

// ---------- Cliente → servidor ----------

export const clientMessageSchema = z.discriminatedUnion("type", [
  // Primeira mensagem depois de abrir. `ownerToken` reassume o papel de dono.
  z.object({ type: z.literal("hello"), ownerToken: z.string().min(32).max(128).optional() }),
  z.object({ type: z.literal("chat.send"), text: z.string().trim().min(1).max(CHAT_MAX_LENGTH) }),
  z.object({ type: z.literal("reaction.send"), reaction: reactionSchema }),
  z.object({ type: z.literal("hand.set"), raised: z.boolean() }),
  // Estado do microfone para a lista de pessoas. Todo mundo entra mudo.
  z.object({ type: z.literal("mic.set"), muted: z.boolean() }),
  // Pede para transmitir um vídeo. O servidor responde `video.granted` ou `video.denied`.
  z.object({
    type: z.literal("video.request"),
    requestId: z.string().min(1).max(64),
    kind: videoKindSchema,
  }),
  z.object({ type: z.literal("video.stop"), videoId: videoIdSchema }),
  z.object({ type: z.literal("signal"), to: participantIdSchema, data: signalDataSchema }),
  // Só o dono. `mute` silencia, `kick` remove, `ban` remove e bane sessão e IP até a sala acabar.
  z.object({
    type: z.literal("moderate"),
    action: z.enum(["mute", "kick", "ban"]),
    target: participantIdSchema,
  }),
  // Só o dono Plus, na sala de link fixo dele. Vale na hora para todos e fica gravado no perfil.
  z.object({ type: z.literal("room.setTheme"), theme: z.enum(ROOM_THEMES) }),
  // Envia ouro a outra pessoa da sala. Só entre contas; o servidor responde `gift.result` a quem
  // enviou e, se deu certo, avisa a sala inteira com `gift`.
  z.object({
    type: z.literal("gift.send"),
    requestId: z.string().min(1).max(64),
    to: participantIdSchema,
    amount: giftAmountSchema,
  }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------- Servidor → cliente ----------

export const roomErrorCodeSchema = z.enum([
  "invalid_message",
  "rate_limited", // passou do limite de mensagens do chat
  "not_allowed", // ação de dono feita por quem não é dono
  "not_found", // alvo ou vídeo inexistente
]);

export const giftFailureSchema = z.enum([
  "insufficient_funds",
  "daily_limit",
  "not_allowed", // quem envia ou quem recebe não tem conta, ou é a própria pessoa
  "not_found", // quem recebe não está mais na sala
  "error",
]);
export type GiftFailure = z.infer<typeof giftFailureSchema>;

export const videoDeniedReasonSchema = z.enum([
  "room_limit", // a sala já tem o máximo de vídeos
  "person_limit", // a pessoa já transmite o máximo dela
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  // Resposta ao `hello`: estado completo da sala.
  z.object({
    type: z.literal("welcome"),
    self: participantIdSchema,
    participants: z.array(participantSchema),
    chat: z.array(chatMessageSchema),
    room: roomSettingsSchema,
    limits: selfLimitsSchema,
  }),
  z.object({ type: z.literal("room.updated"), room: roomSettingsSchema }),
  z.object({ type: z.literal("participant.joined"), participant: participantSchema }),
  z.object({ type: z.literal("participant.updated"), participant: participantSchema }),
  z.object({
    type: z.literal("participant.left"),
    id: participantIdSchema,
    reason: z.enum(["left", "kicked", "banned"]),
  }),
  z.object({ type: z.literal("chat.message"), message: chatMessageSchema }),
  z.object({ type: z.literal("reaction"), from: participantIdSchema, reaction: reactionSchema }),
  z.object({
    type: z.literal("video.granted"),
    requestId: z.string().min(1).max(64),
    video: roomVideoSchema,
  }),
  z.object({
    type: z.literal("video.denied"),
    requestId: z.string().min(1).max(64),
    reason: videoDeniedReasonSchema,
  }),
  z.object({ type: z.literal("signal"), from: participantIdSchema, data: signalDataSchema }),
  // Resposta ao `gift.send`, só para quem enviou.
  z.object({
    type: z.literal("gift.result"),
    requestId: z.string().min(1).max(64),
    ok: z.boolean(),
    reason: giftFailureSchema.optional(),
  }),
  // Aviso visível na sala: alguém enviou ouro a alguém. Apelidos do momento do envio.
  z.object({
    type: z.literal("gift"),
    from: participantIdSchema,
    fromNickname: nicknameSchema,
    to: participantIdSchema,
    toNickname: nicknameSchema,
    amount: giftAmountSchema,
  }),
  // O dono silenciou você: o cliente desliga o microfone.
  z.object({ type: z.literal("force.muted") }),
  // Enviada antes de fechar a conexão de quem foi removido ou banido.
  z.object({ type: z.literal("removed"), reason: z.enum(["kicked", "banned"]) }),
  z.object({ type: z.literal("room.ended") }),
  z.object({ type: z.literal("error"), code: roomErrorCodeSchema }),
  z.object({ type: z.literal("pong") }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Códigos de fechamento do WebSocket usados pelo servidor. */
export const WS_CLOSE = {
  roomEnded: 4000,
  kicked: 4001,
  banned: 4002,
  roomFull: 4003,
  unauthorized: 4004,
  /** A mesma sessão abriu outra conexão (outra aba); a antiga é fechada. */
  replaced: 4005,
} as const;

/** Quadros exatos de ping/pong, para o servidor responder sem acordar o Durable Object. */
export const WS_PING_FRAME = JSON.stringify({ type: "ping" });
export const WS_PONG_FRAME = JSON.stringify({ type: "pong" });
