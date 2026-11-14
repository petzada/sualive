import {
  CURRENCIES,
  GOLD_GIFT_DAILY_LIMIT,
  GOLD_PACKS,
  REACTIONS_MAX_PER_PERSON,
  SHOP_ITEM_KINDS,
} from "@sualive/config";
import { z } from "zod";
import { handleSchema, plusPaymentStatusSchema, taxIdSchema } from "./account";

/**
 * Carteira, loja e presentes (entrega 3). O servidor decide saldo, preço e posse; o navegador só
 * mostra o que estas respostas dizem. Todas as rotas exigem conta com o primeiro acesso concluído.
 */

// ---------- Campos ----------

export const currencySchema = z.enum(CURRENCIES);

const balanceSchema = z.number().int().min(0);

/** Cor em hexadecimal de 6 dígitos (os valores vêm do catálogo, nunca do navegador). */
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, "invalid color");

/**
 * Cores de um cosmético nos dois temas: 1 cor = cor lisa; 2 cores = degradê (só no nome e na
 * moldura; é a única exceção à regra "sem gradiente" do DESIGN.md).
 */
export const cosmeticPaintSchema = z.object({
  light: z.array(hexColorSchema).min(1).max(2),
  dark: z.array(hexColorSchema).min(1).max(2),
});
export type CosmeticPaint = z.infer<typeof cosmeticPaintSchema>;

/** Cosméticos equipados de uma pessoa, como aparecem para todos na sala. */
export const cosmeticsSchema = z.object({
  /** Cor ou degradê do nome. */
  name: cosmeticPaintSchema.nullable(),
  /** Moldura do avatar. */
  frame: cosmeticPaintSchema.nullable(),
});
export type Cosmetics = z.infer<typeof cosmeticsSchema>;

/** Uma reação: as básicas (`REACTIONS`) ou as de um pacote equipado. */
export const reactionValueSchema = z.string().min(1).max(16);
export const reactionListSchema = z.array(reactionValueSchema).max(REACTIONS_MAX_PER_PERSON);

// ---------- GET /api/wallet ----------

export const walletResponseSchema = z.object({
  silver: balanceSchema,
  gold: balanceSchema,
  /** Ouro já enviado hoje (dia de calendário de Brasília) e o limite diário. */
  goldSentToday: balanceSchema,
  goldGiftDailyLimit: z.number().int().positive(),
});
export type WalletResponse = z.infer<typeof walletResponseSchema>;

// ---------- GET /api/wallet/ledger?before=<cursor> ----------

export const ledgerReasonSchema = z.enum([
  "welcome", // prata de boas-vindas
  "plus_gold", // ouro do Plus pago
  "gold_purchase", // pacote de ouro confirmado pela Woovi
  "shop_purchase", // compra de cosmético
  "gift_sent", // ouro enviado a outra conta
  "gift_received", // ouro recebido de outra conta
  "plus_gift", // 30 dias de Plus presenteados a outra conta
  "relay_video", // vídeo próprio enviado por conexão retransmitida, por minuto
  "protected_room", // sala protegida aberta, por minuto
]);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string().min(1),
  currency: currencySchema,
  /** Positivo = entrou; negativo = saiu. Nunca zero. */
  amount: z.number().int(),
  reason: ledgerReasonSchema,
  /** @nome da outra conta num presente; nulo se não há ou se a conta foi excluída. */
  counterpartHandle: handleSchema.nullable(),
  /** Nome do item numa compra da loja; nulo nos demais. */
  itemName: z.string().nullable(),
  createdAt: z.number().int(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerResponseSchema = z.object({
  /** Mais recentes primeiro. */
  entries: z.array(ledgerEntrySchema),
  /** Passe em `before` para a página seguinte; nulo = acabou. */
  nextCursor: z.string().nullable(),
});
export type LedgerResponse = z.infer<typeof ledgerResponseSchema>;

// ---------- POST /api/wallet/gold/checkout ----------
// Cria a cobrança Pix do pacote. O ouro só é creditado pelo webhook da Woovi, uma vez por cobrança.

export const goldPackIdSchema = z.enum(GOLD_PACKS.map((pack) => pack.id) as [string, ...string[]]);

export const goldCheckoutRequestSchema = z.object({ packId: goldPackIdSchema, taxId: taxIdSchema });
export type GoldCheckoutRequest = z.infer<typeof goldCheckoutRequestSchema>;

export const goldCheckoutResponseSchema = z.object({
  paymentId: z.string().min(1),
  packId: goldPackIdSchema,
  gold: z.number().int().positive(),
  amountCents: z.number().int().positive(),
  brCode: z.string().min(1),
  qrCodeImageUrl: z.string().url(),
  expiresAt: z.number().int(),
});
export type GoldCheckoutResponse = z.infer<typeof goldCheckoutResponseSchema>;

// ---------- GET /api/wallet/gold/payments/:id ----------

export const goldPaymentResponseSchema = z.object({ status: plusPaymentStatusSchema });
export type GoldPaymentResponse = z.infer<typeof goldPaymentResponseSchema>;

// ---------- POST /api/wallet/gifts/gold ---------- (responde WalletResponse)

export const giftAmountSchema = z.number().int().min(1).max(GOLD_GIFT_DAILY_LIMIT);

export const giftGoldRequestSchema = z.object({
  /** @nome de quem recebe (sem "@"). Nunca a própria conta. */
  to: handleSchema,
  amount: giftAmountSchema,
});
export type GiftGoldRequest = z.infer<typeof giftGoldRequestSchema>;

// ---------- POST /api/wallet/gifts/plus ---------- (responde WalletResponse)
// Debita PLUS_GIFT_PRICE_GOLD e dá PLUS_GIFT_DAYS de Plus a outra conta (somam ao período atual).

export const giftPlusRequestSchema = z.object({ to: handleSchema });
export type GiftPlusRequest = z.infer<typeof giftPlusRequestSchema>;

// ---------- GET /api/shop ----------

export const shopItemKindSchema = z.enum(SHOP_ITEM_KINDS);

/** Aparência do item: cores (cor, degradê, moldura) ou as reações do pacote. */
export const shopItemDataSchema = z.union([
  cosmeticPaintSchema,
  z.object({ reactions: z.array(reactionValueSchema).min(1).max(12) }),
]);

export const shopItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: shopItemKindSchema,
  name: z.string().min(1).max(40),
  /** Preço único; a pessoa escolhe pagar com prata ou com ouro. */
  price: z.number().int().positive(),
  data: shopItemDataSchema,
  owned: z.boolean(),
  equipped: z.boolean(),
});
export type ShopItem = z.infer<typeof shopItemSchema>;

export const shopResponseSchema = z.object({ items: z.array(shopItemSchema) });
export type ShopResponse = z.infer<typeof shopResponseSchema>;

// ---------- POST /api/shop/items/:id/buy ----------
// Item comprado é permanente. Responde a loja e a carteira já atualizadas.

export const buyItemRequestSchema = z.object({ currency: currencySchema });
export type BuyItemRequest = z.infer<typeof buyItemRequestSchema>;

export const shopPurchaseResponseSchema = z.object({
  wallet: walletResponseSchema,
  items: z.array(shopItemSchema),
});
export type ShopPurchaseResponse = z.infer<typeof shopPurchaseResponseSchema>;

// ---------- POST /api/shop/items/:id/equip ---------- (responde ShopResponse)
// Equipar cor ou degradê desequipa o outro estilo de nome; equipar moldura desequipa a anterior;
// pacotes de reações são independentes.

export const equipItemRequestSchema = z.object({ equipped: z.boolean() });
export type EquipItemRequest = z.infer<typeof equipItemRequestSchema>;
