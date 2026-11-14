import { shopItemSchema, type ShopItem } from "@sualive/protocol";
import type { AppEnv } from "../env";

/**
 * Catálogo da loja (`shop_items`) e os itens de cada conta (`user_items`). Preço, aparência e posse
 * vêm sempre daqui, nunca do navegador. Cosméticos são só os do catálogo: não existe imagem enviada
 * por usuário.
 */

export interface ItemRow {
  id: string;
  kind: string;
  name: string;
  price: number;
  data: string;
  active: number;
  owned: number;
  equipped: number | null;
}

export interface CatalogItem extends ShopItem {
  /** Está na vitrine (só item ativo pode ser comprado). */
  active: boolean;
}

const SELECT_ITEMS = `SELECT s.id, s.kind, s.name, s.price, s.data, s.active,
    (u.item_id IS NOT NULL) AS owned, u.equipped AS equipped
  FROM shop_items s
  LEFT JOIN user_items u ON u.item_id = s.id AND u.user_id = ?1`;

/**
 * Linha do banco validada pelo esquema, ou `null` se estiver malformada (o item não sai nem pode
 * ser comprado). O formato de `data` precisa combinar com o tipo: reações só no pacote.
 */
export function toCatalogItem(row: ItemRow): CatalogItem | null {
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return null;
  }
  const parsed = shopItemSchema.safeParse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    price: row.price,
    data,
    owned: row.owned === 1,
    equipped: row.owned === 1 && row.equipped === 1,
  });
  if (!parsed.success) return null;
  const isPack = "reactions" in parsed.data.data;
  if (isPack !== (parsed.data.kind === "reaction_pack")) return null;
  return { ...parsed.data, active: row.active === 1 };
}

function publicItem({ active: _active, ...item }: CatalogItem): ShopItem {
  return item;
}

/** A vitrine (itens ativos, na ordem de `sort`) mais os que a conta já tem, com posse e uso. */
export async function listShop(env: AppEnv, userId: string): Promise<ShopItem[]> {
  const { results } = await env.DB.prepare(
    `${SELECT_ITEMS} WHERE s.active = 1 OR u.item_id IS NOT NULL ORDER BY s.sort, s.id`,
  )
    .bind(userId)
    .all<ItemRow>();
  const items: ShopItem[] = [];
  for (const row of results) {
    const item = toCatalogItem(row);
    if (item) items.push(publicItem(item));
  }
  return items;
}

/** Um item do catálogo (ativo ou não), com a posse desta conta; `null` se não existe. */
export async function findCatalogItem(
  env: AppEnv,
  userId: string,
  itemId: string,
): Promise<CatalogItem | null> {
  const row = await env.DB.prepare(`${SELECT_ITEMS} WHERE s.id = ?2`).bind(userId, itemId).first<ItemRow>();
  return row ? toCatalogItem(row) : null;
}
