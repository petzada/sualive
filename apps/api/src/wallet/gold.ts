import { GOLD_PACKS } from "@sualive/config";
import type { GoldCheckoutResponse } from "@sualive/protocol";
import { and, desc, eq } from "drizzle-orm";
import type { Viewer } from "../auth/viewer";
import { CHECKOUT_REUSE_MARGIN_MS, CHECKOUT_TTL_MS } from "../billing/checkout";
import { qrCodeDataUrl } from "../billing/qr";
import { recordEvent } from "../billing/store";
import { createCharge } from "../billing/woovi";
import { createDb } from "../db";
import { goldPurchases } from "../db/schema";
import type { AppEnv } from "../env";
import { creditStatements } from "./ledger";

/**
 * Pacotes de ouro por Pix único. Preço e ouro vêm de GOLD_PACKS pelo `packId`; a conta vem do
 * login; o CPF só passa a caminho da Woovi (nunca é guardado nem registrado). O ouro só é
 * creditado pelo webhook da Woovi (`goldPaidStatements`), uma vez por cobrança.
 */

export type GoldPurchaseRow = typeof goldPurchases.$inferSelect;
type GoldPack = (typeof GOLD_PACKS)[number];

/** Contrato mostrado ao pagador no app do banco (a Woovi exige menos de 30 caracteres). */
function contractText(pack: GoldPack): string {
  return `sualive ${pack.gold} de ouro`;
}

function checkoutResponse(purchase: GoldPurchaseRow): GoldCheckoutResponse {
  const brCode = purchase.brCode!;
  return {
    paymentId: purchase.id,
    packId: purchase.packId,
    gold: purchase.gold,
    amountCents: purchase.amountCents,
    brCode,
    qrCodeImageUrl: purchase.qrCodeImageUrl ?? qrCodeDataUrl(brCode),
    expiresAt: purchase.expiresAt!,
  };
}

/** Cria (ou reaproveita, se for do mesmo pacote e ainda valer) a cobrança Pix de um pacote. */
export async function createGoldCheckout(
  env: AppEnv,
  viewer: Viewer,
  packId: string,
  taxId: string,
  now: number,
): Promise<GoldCheckoutResponse | null> {
  const pack = GOLD_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) return null;

  const db = createDb(env.DB);
  const pending = await db
    .select()
    .from(goldPurchases)
    .where(
      and(
        eq(goldPurchases.userId, viewer.userId),
        eq(goldPurchases.status, "pending"),
        eq(goldPurchases.packId, pack.id),
      ),
    )
    .orderBy(desc(goldPurchases.createdAt));
  const reusable = pending.find(
    (purchase) =>
      purchase.brCode !== null &&
      purchase.expiresAt !== null &&
      purchase.amountCents === pack.priceCents &&
      purchase.gold === pack.gold &&
      purchase.expiresAt > now + CHECKOUT_REUSE_MARGIN_MS,
  );
  if (reusable) return checkoutResponse(reusable);

  const correlationId = `sualive-gold-${pack.id}-${crypto.randomUUID()}`;
  const charge = await createCharge(env, {
    correlationId,
    valueCents: pack.priceCents,
    customer: { name: viewer.nickname, taxId },
    comment: contractText(pack),
    expiresInSeconds: CHECKOUT_TTL_MS / 1000,
  });
  const purchase: GoldPurchaseRow = {
    id: crypto.randomUUID(),
    userId: viewer.userId,
    packId: pack.id,
    amountCents: pack.priceCents,
    gold: pack.gold,
    status: "pending",
    correlationId,
    brCode: charge.brCode,
    qrCodeImageUrl: charge.qrCodeImageUrl,
    expiresAt: charge.expiresAt ?? now + CHECKOUT_TTL_MS,
    paidAt: null,
    createdAt: now,
  };
  await db.insert(goldPurchases).values(purchase);
  return checkoutResponse(purchase);
}

/** Estado de uma compra da própria conta, ou `null` (inexistente ou de outra conta). */
export async function getGoldPurchaseStatus(env: AppEnv, userId: string, purchaseId: string) {
  const rows = await createDb(env.DB)
    .select({ status: goldPurchases.status })
    .from(goldPurchases)
    .where(and(eq(goldPurchases.id, purchaseId), eq(goldPurchases.userId, userId)))
    .limit(1);
  return rows[0]?.status ?? null;
}

export async function goldPurchaseByCorrelation(
  env: AppEnv,
  correlationId: string,
): Promise<GoldPurchaseRow | null> {
  const rows = await createDb(env.DB)
    .select()
    .from(goldPurchases)
    .where(eq(goldPurchases.correlationId, correlationId))
    .limit(1);
  return rows[0] ?? null;
}

export function goldPurchaseReference(purchaseId: string): string {
  return `gold-purchase:${purchaseId}`;
}

/**
 * Instruções do webhook de cobrança paga de um pacote, num único `batch`: chave do evento, compra
 * marcada como paga (só se ainda não estava) e o crédito do ouro. A chave do evento e a referência
 * única do crédito impedem crédito repetido, mesmo com dois webhooks simultâneos. Conta excluída
 * antes do pagamento: a compra fica paga, sem crédito.
 */
export function goldPaidStatements(
  env: AppEnv,
  eventKey: string,
  purchase: GoldPurchaseRow,
  now: number,
): D1PreparedStatement[] {
  const statements = [recordEvent(env, eventKey, now)];
  if (purchase.status === "paid") return statements;
  statements.push(
    env.DB.prepare(
      `UPDATE gold_purchases SET status = 'paid', paid_at = ?2, br_code = NULL, qr_code_image_url = NULL
       WHERE id = ?1 AND status != 'paid'`,
    ).bind(purchase.id, now),
  );
  if (purchase.userId) {
    statements.push(
      ...creditStatements(env, {
        userId: purchase.userId,
        currency: "gold",
        amount: purchase.gold,
        reason: "gold_purchase",
        reference: goldPurchaseReference(purchase.id),
        now,
      }),
    );
  }
  return statements;
}

/** Instruções do webhook de cobrança expirada de um pacote: a compra pendente vira `expired`. */
export function goldExpiredStatements(
  env: AppEnv,
  eventKey: string,
  purchase: GoldPurchaseRow | null,
  now: number,
): D1PreparedStatement[] {
  const statements = [recordEvent(env, eventKey, now)];
  if (purchase?.status === "pending") {
    statements.push(
      env.DB.prepare(
        "UPDATE gold_purchases SET status = 'expired' WHERE id = ?1 AND status = 'pending'",
      ).bind(purchase.id),
    );
  }
  return statements;
}
