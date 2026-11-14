import { HANDLE_PATTERN, ROOM_THEMES } from "@sualive/config";
import { z } from "zod";
import { nicknameSchema } from "./http";

/**
 * Conta, perfil e Plus (entrega 2). O servidor decide plano, selos e identidade; o navegador só
 * mostra o que estas respostas dizem.
 */

// ---------- Campos ----------

/** @nome sem o "@": letras minúsculas, números e sublinhado. */
export const handleSchema = z.string().regex(new RegExp(HANDLE_PATTERN), "invalid handle");

export const authProviderSchema = z.enum(["google", "discord"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const roomThemeSchema = z.enum(ROOM_THEMES);

/** Selos ao lado do nome. `early_supporter` é permanente; `plus` vale enquanto o plano vale. */
export const badgeSchema = z.enum(["plus", "early_supporter"]);
export type Badge = z.infer<typeof badgeSchema>;

export const plusCycleSchema = z.enum(["monthly", "annual"]);
export type PlusCycle = z.infer<typeof plusCycleSchema>;

/**
 * Estado da assinatura. `past_due`: em atraso, durante as novas tentativas (benefícios continuam).
 * `canceled`: cancelada, vale até o fim do período pago. `ended`: encerrada. `none`: nunca assinou.
 */
export const plusStatusSchema = z.enum(["none", "active", "past_due", "canceled", "ended"]);
export type PlusStatus = z.infer<typeof plusStatusSchema>;

/** Ciclo do plano em vigor: os dois pagos ou `gift` (Plus recebido de presente, sem renovação). */
export const planCycleSchema = z.enum(["monthly", "annual", "gift"]);
export type PlanCycle = z.infer<typeof planCycleSchema>;

export const planSchema = z.object({
  status: plusStatusSchema,
  /** Os benefícios do Plus valem agora (active, past_due ou canceled dentro do período pago). */
  plus: z.boolean(),
  cycle: planCycleSchema.nullable(),
  /** Fim do período pago ou presenteado (ms). */
  periodEnd: z.number().int().nullable(),
  /** Renova sozinha no fim do período (só mensal ativo). */
  renews: z.boolean(),
});
export type Plan = z.infer<typeof planSchema>;

// ---------- GET /api/me ----------

export const meUserSchema = z.object({
  id: z.string().min(1),
  /** Nulo até concluir o primeiro acesso. */
  handle: handleSchema.nullable(),
  nickname: nicknameSchema,
  avatarUrl: z.string().url().nullable(),
  /** `false`: falta declarar 18 anos, aceitar os termos e escolher o @nome. */
  onboarded: z.boolean(),
  badges: z.array(badgeSchema),
  plan: planSchema,
  roomTheme: roomThemeSchema,
  /** A partir de quando o @nome pode ser trocado de novo (ms); nulo = já pode. */
  handleChangeAvailableAt: z.number().int().nullable(),
  /**
   * Versão atual dos Termos de Uso quando a conta ainda não a viu: o front mostra a faixa de aviso.
   * Nulo quando já viu (ou antes do primeiro acesso, que tem o aceite próprio).
   */
  termsUpdate: z.string().min(1).nullable(),
  /** A sala de link fixo desta conta abre como sala protegida (só Plus; entrega 4). */
  fixedRoomProtected: z.boolean(),
});
export type MeUser = z.infer<typeof meUserSchema>;

export const meResponseSchema = z.object({
  /** Nulo para quem não está logado. */
  user: meUserSchema.nullable(),
  /** Logins configurados neste ambiente (o botão de um login ausente não aparece). */
  providers: z.array(authProviderSchema),
  /** A assinatura do Plus está ligada neste ambiente. */
  billingEnabled: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ---------- Login ----------
// GET  /api/auth/:provider/start?returnTo=<caminho local>  → 302 para o provedor
// GET  /api/auth/:provider/callback                        → 302 para returnTo (ou /boas-vindas)
// POST /api/auth/logout                                    → 204
// `returnTo` aceita só caminho local (começa com "/" e não com "//").

// ---------- POST /api/me/onboarding ----------

export const onboardingRequestSchema = z.object({
  handle: handleSchema,
  /** Declaração de ter 18 anos ou mais. */
  adult: z.literal(true),
  /** Aceite dos termos de uso e da política de privacidade. */
  acceptTerms: z.literal(true),
});
export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

// ---------- PATCH /api/me ---------- (responde MeUser)

export const updateMeRequestSchema = z
  .object({
    nickname: nicknameSchema.optional(),
    /** Troca permitida a cada HANDLE_CHANGE_INTERVAL_DAYS. */
    handle: handleSchema.optional(),
    /** Só Plus. */
    roomTheme: roomThemeSchema.optional(),
    /** Só Plus, e só com a sala de link fixo vazia (`room_in_use`). */
    fixedRoomProtected: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "empty update");
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

// ---------- POST /api/me/terms-seen ---------- (sem corpo; responde MeUser com `termsUpdate` nulo)
// Fechar a faixa de aviso ou abrir o link dos Termos grava a versão atual como vista.

// ---------- DELETE /api/me ---------- (204; apaga os dados pessoais e encerra a sessão)

// ---------- GET /api/handles/:handle ----------

export const handleAvailabilityResponseSchema = z.object({
  available: z.boolean(),
  reason: z.enum(["taken", "reserved", "invalid"]).optional(),
});
export type HandleAvailabilityResponse = z.infer<typeof handleAvailabilityResponseSchema>;

// ---------- POST /api/plus/checkout ----------

/** CPF só com dígitos. Usado para a cobrança e guardado só o necessário. */
export const taxIdSchema = z.string().regex(/^\d{11}$/, "invalid tax id");

export const plusCheckoutRequestSchema = z.object({ cycle: plusCycleSchema, taxId: taxIdSchema });
export type PlusCheckoutRequest = z.infer<typeof plusCheckoutRequestSchema>;

export const plusPaymentStatusSchema = z.enum(["pending", "paid", "expired", "failed"]);

export const plusCheckoutResponseSchema = z.object({
  paymentId: z.string().min(1),
  cycle: plusCycleSchema,
  amountCents: z.number().int().positive(),
  /** Pix copia e cola. */
  brCode: z.string().min(1),
  /** Endereço da imagem do QR Code. */
  qrCodeImageUrl: z.string().url(),
  expiresAt: z.number().int(),
});
export type PlusCheckoutResponse = z.infer<typeof plusCheckoutResponseSchema>;

// ---------- GET /api/plus/payments/:id ----------
// O navegador consulta enquanto mostra o QR Code. Quem muda o estado é só o webhook da Woovi.

export const plusPaymentResponseSchema = z.object({ status: plusPaymentStatusSchema });
export type PlusPaymentResponse = z.infer<typeof plusPaymentResponseSchema>;

// ---------- POST /api/plus/cancel ---------- (responde Plan)

// ---------- POST /api/webhooks/woovi ----------
// Única origem de mudança de estado da assinatura. Autenticado como a Woovi documenta e idempotente.
