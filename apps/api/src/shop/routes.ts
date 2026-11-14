import {
  buyItemRequestSchema,
  equipItemRequestSchema,
  shopPurchaseResponseSchema,
  shopResponseSchema,
} from "@sualive/protocol";
import { Hono } from "hono";
import { isUniqueViolation, readJson, type Ctx, type Env } from "../account/http";
import { sameOriginOnly } from "../auth/csrf";
import { getViewer, type Viewer } from "../auth/viewer";
import { apiError } from "../errors";
import { debitStatements, getWallet, runLedger } from "../wallet/ledger";
import { findCatalogItem, listShop } from "./catalog";
import { SLOT_KINDS } from "./equipped";

/** Conta logada com o primeiro acesso concluído. */
async function requireMember(c: Ctx): Promise<Viewer | Response> {
  const viewer = await getViewer(c);
  if (!viewer) return apiError(c, "unauthorized");
  if (!viewer.onboarded) return apiError(c, "onboarding_required");
  return viewer;
}

/** Id de item da rota, já com o tamanho conferido, ou `null`. */
function itemIdParam(c: Ctx): string | null {
  const id = c.req.param("id");
  return id && id.length <= 64 ? id : null;
}

/** `/api/shop/*`: catálogo, compra e equipar. Contratos em `@sualive/protocol` (wallet.ts). */
export const shop = new Hono<Env>();

shop.use(sameOriginOnly);

shop.get("/", async (c) => {
  const viewer = await requireMember(c);
  if (viewer instanceof Response) return viewer;
  return c.json(shopResponseSchema.parse({ items: await listShop(c.env, viewer.userId) }));
});

// Compra: o preço vem do catálogo; a pessoa só escolhe a moeda. Débito, linha do livro-razão e o
// item entram no mesmo `batch`. A referência única (`shop:<conta>:<item>`) e a chave primária de
// `user_items` garantem uma compra só, mesmo com dois pedidos simultâneos.
shop.post("/items/:id/buy", async (c) => {
  const viewer = await requireMember(c);
  if (viewer instanceof Response) return viewer;
  const body = buyItemRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const itemId = itemIdParam(c);
  const item = itemId ? await findCatalogItem(c.env, viewer.userId, itemId) : null;
  if (!itemId || !item?.active) return apiError(c, "not_found");
  if (item.owned) return apiError(c, "already_owned");

  const now = Date.now();
  let outcome;
  try {
    outcome = await runLedger(c.env, [
      ...debitStatements(c.env, {
        userId: viewer.userId,
        currency: body.data.currency,
        amount: item.price,
        reason: "shop_purchase",
        reference: `shop:${viewer.userId}:${itemId}`,
        itemId,
        now,
      }),
      c.env.DB.prepare(
        "INSERT INTO user_items (user_id, item_id, equipped, acquired_at) VALUES (?1, ?2, 0, ?3)",
      ).bind(viewer.userId, itemId, now),
    ]);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    outcome = "duplicate" as const;
  }
  if (outcome === "duplicate") return apiError(c, "already_owned");
  if (outcome === "insufficient_funds") return apiError(c, "insufficient_funds");
  if (outcome !== "ok") throw new Error(`compra na loja: resultado inesperado ${outcome}`);

  const [wallet, items] = await Promise.all([
    getWallet(c.env, viewer.userId, now),
    listShop(c.env, viewer.userId),
  ]);
  return c.json(shopPurchaseResponseSchema.parse({ wallet, items }));
});

// Equipar/desequipar: só item que a conta tem. Nome (cor ou degradê) e moldura têm um lugar cada;
// pacotes de reações são independentes. Tudo num `batch`.
shop.post("/items/:id/equip", async (c) => {
  const viewer = await requireMember(c);
  if (viewer instanceof Response) return viewer;
  const body = equipItemRequestSchema.safeParse(await readJson(c));
  if (!body.success) return apiError(c, "invalid_request");
  const itemId = itemIdParam(c);
  const item = itemId ? await findCatalogItem(c.env, viewer.userId, itemId) : null;
  if (!itemId || !item) return apiError(c, "not_found");
  if (!item.owned) return apiError(c, "not_owned");

  const statements: D1PreparedStatement[] = [];
  const slot = SLOT_KINDS[item.kind];
  if (body.data.equipped && slot) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE user_items SET equipped = 0
         WHERE user_id = ?1 AND item_id <> ?2 AND equipped = 1
           AND item_id IN (SELECT id FROM shop_items WHERE kind IN (SELECT value FROM json_each(?3)))`,
      ).bind(viewer.userId, itemId, JSON.stringify(slot)),
    );
  }
  statements.push(
    c.env.DB.prepare("UPDATE user_items SET equipped = ?3 WHERE user_id = ?1 AND item_id = ?2").bind(
      viewer.userId,
      itemId,
      body.data.equipped ? 1 : 0,
    ),
  );
  await c.env.DB.batch(statements);
  return c.json(shopResponseSchema.parse({ items: await listShop(c.env, viewer.userId) }));
});
