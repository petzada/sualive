import { WALLET_LEDGER_PAGE_SIZE } from "@sualive/config";
import {
  giftGoldRequestSchema,
  giftPlusRequestSchema,
  goldCheckoutRequestSchema,
  goldCheckoutResponseSchema,
  goldPaymentResponseSchema,
  ledgerResponseSchema,
  plusPaymentStatusSchema,
  walletResponseSchema,
  type LedgerEntry,
} from "@sualive/protocol";
import { Hono, type Context } from "hono";
import { apiError, readJson } from "../account/http";
import { findUserByHandle } from "../account/users";
import { sameOriginOnly } from "../auth/csrf";
import { getViewer, type Viewer } from "../auth/viewer";
import { isValidCpf } from "../billing/cpf";
import { isBillingEnabled } from "../billing/plan";
import type { AppEnv } from "../env";
import { giftPlus } from "./gifts";
import { createGoldCheckout, getGoldPurchaseStatus } from "./gold";
import { getWallet, transferGold } from "./ledger";

type Env = { Bindings: AppEnv };
type Ctx = Context<Env>;

/**
 * `/api/wallet/*`: saldos, extrato, compra de ouro e presentes. Contratos em `@sualive/protocol`
 * (wallet.ts). O servidor decide tudo: saldo, preço e contas vêm do banco e do login, nunca do
 * navegador. Nenhuma rota credita moeda: o ouro comprado só entra pelo webhook da Woovi.
 */
export const wallet = new Hono<Env>();

// Rotas que mudam estado com o cookie de conta exigem mesma origem.
wallet.use(sameOriginOnly);

/** Conta logada com o primeiro acesso concluído. */
async function requireAccount(c: Ctx): Promise<Viewer | Response> {
  const viewer = await getViewer(c);
  if (!viewer) return apiError(c, "unauthorized");
  if (!viewer.onboarded) return apiError(c, "onboarding_required");
  return viewer;
}

async function walletJson(c: Ctx, userId: string) {
  c.header("Cache-Control", "no-store");
  return c.json(walletResponseSchema.parse(await getWallet(c.env, userId, Date.now())));
}

wallet.get("/", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  return walletJson(c, viewer.userId);
});

// ---------- Extrato ----------

/** Cursor opaco e estável: o `createdAt` e o `id` da última linha da página (ordem total). */
function encodeCursor(createdAt: number, id: string): string {
  return btoa(`${createdAt}:${id}`).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const text = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const index = text.indexOf(":");
    if (index <= 0) return null;
    const createdAt = Number(text.slice(0, index));
    const id = text.slice(index + 1);
    if (!Number.isSafeInteger(createdAt) || id.length === 0 || id.length > 128) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

interface LedgerRow {
  id: string;
  currency: string;
  amount: number;
  reason: string;
  counterpart_handle: string | null;
  item_name: string | null;
  created_at: number;
}

wallet.get("/ledger", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  const before = c.req.query("before");
  const cursor = before === undefined || before === "" ? null : decodeCursor(before);
  if (before && !cursor) return apiError(c, "invalid_request");

  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.currency, l.amount, l.reason, u.handle AS counterpart_handle, s.name AS item_name,
       l.created_at
     FROM wallet_ledger l
     LEFT JOIN users u ON u.id = l.counterpart_user_id
     LEFT JOIN shop_items s ON s.id = l.item_id
     WHERE l.user_id = ?1
       AND (?2 IS NULL OR l.created_at < ?2 OR (l.created_at = ?2 AND l.id < ?3))
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ?4`,
  )
    .bind(viewer.userId, cursor?.createdAt ?? null, cursor?.id ?? null, WALLET_LEDGER_PAGE_SIZE + 1)
    .all<LedgerRow>();

  const page = results.slice(0, WALLET_LEDGER_PAGE_SIZE);
  const entries: LedgerEntry[] = page.map((row) => ({
    id: row.id,
    currency: row.currency as LedgerEntry["currency"],
    amount: row.amount,
    reason: row.reason as LedgerEntry["reason"],
    counterpartHandle: row.counterpart_handle,
    itemName: row.item_name,
    createdAt: row.created_at,
  }));
  const last = page.at(-1);
  const nextCursor =
    results.length > WALLET_LEDGER_PAGE_SIZE && last ? encodeCursor(last.created_at, last.id) : null;
  c.header("Cache-Control", "no-store");
  return c.json(ledgerResponseSchema.parse({ entries, nextCursor }));
});

// ---------- Pacotes de ouro ----------

wallet.post("/gold/checkout", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  if (!isBillingEnabled(c.env)) return apiError(c, "billing_unavailable");
  const body = goldCheckoutRequestSchema.safeParse(await readJson(c));
  if (!body.success || !isValidCpf(body.data.taxId)) return apiError(c, "invalid_request");
  const result = await createGoldCheckout(c.env, viewer, body.data.packId, body.data.taxId, Date.now());
  if (!result) return apiError(c, "invalid_request");
  return c.json(goldCheckoutResponseSchema.parse(result));
});

// Só leitura: quem muda o estado da compra é o webhook.
wallet.get("/gold/payments/:id", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  if (!isBillingEnabled(c.env)) return apiError(c, "billing_unavailable");
  const status = await getGoldPurchaseStatus(c.env, viewer.userId, c.req.param("id"));
  if (status === null) return apiError(c, "not_found");
  c.header("Cache-Control", "no-store");
  return c.json(goldPaymentResponseSchema.parse({ status: plusPaymentStatusSchema.parse(status) }));
});

// ---------- Presentes ----------

/** Quem recebe: conta com primeiro acesso concluído e diferente de quem envia. */
async function recipientOf(c: Ctx, viewer: Viewer, handle: string): Promise<string | Response> {
  const recipient = await findUserByHandle(c.env, handle);
  if (!recipient || !recipient.onboarded) return apiError(c, "recipient_not_found");
  if (recipient.userId === viewer.userId) return apiError(c, "self_gift");
  return recipient.userId;
}

wallet.post("/gifts/gold", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  const body = giftGoldRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const recipient = await recipientOf(c, viewer, body.data.to);
  if (recipient instanceof Response) return recipient;
  const outcome = await transferGold(c.env, {
    fromUserId: viewer.userId,
    toUserId: recipient,
    amount: body.data.amount,
    now: Date.now(),
  });
  if (outcome === "insufficient_funds" || outcome === "daily_limit") return apiError(c, outcome);
  if (outcome !== "ok") throw new Error(`envio de ouro não gravado: ${outcome}`);
  return walletJson(c, viewer.userId);
});

wallet.post("/gifts/plus", async (c) => {
  const viewer = await requireAccount(c);
  if (viewer instanceof Response) return viewer;
  const body = giftPlusRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const recipient = await recipientOf(c, viewer, body.data.to);
  if (recipient instanceof Response) return recipient;
  const outcome = await giftPlus(c.env, viewer.userId, recipient, Date.now());
  if (outcome !== "ok") return apiError(c, outcome);
  return walletJson(c, viewer.userId);
});
