import { REACTIONS, REACTIONS_MAX_PER_PERSON, type ShopItemKind } from "@sualive/config";
import type { CosmeticPaint, Cosmetics } from "@sualive/protocol";
import type { AppEnv } from "../env";
import { toCatalogItem, type ItemRow } from "./catalog";

/** Tipos que dividem o mesmo lugar: equipar um desequipa os outros do mesmo lugar. */
export const SLOT_KINDS: Partial<Record<ShopItemKind, readonly ShopItemKind[]>> = {
  name_color: ["name_color", "name_gradient"],
  name_gradient: ["name_color", "name_gradient"],
  avatar_frame: ["avatar_frame"],
  // reaction_pack: independente (vários ao mesmo tempo).
};

export interface Equipped {
  /** Cor ou degradê do nome e moldura; nulo se nada disso está equipado. */
  cosmetics: Cosmetics | null;
  /** Reações dos pacotes equipados, sem repetir (sem as básicas). */
  reactions: string[];
}

/** O que a conta tem equipado, lido do D1 (para a sala, ao conectar). */
export async function getEquipped(env: AppEnv, userId: string): Promise<Equipped> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.kind, s.name, s.price, s.data, s.active, 1 AS owned, u.equipped AS equipped
     FROM user_items u JOIN shop_items s ON s.id = u.item_id
     WHERE u.user_id = ?1 AND u.equipped = 1
     ORDER BY s.sort, s.id`,
  )
    .bind(userId)
    .all<ItemRow>();

  let name: CosmeticPaint | null = null;
  let frame: CosmeticPaint | null = null;
  const reactions: string[] = [];
  for (const row of results) {
    const item = toCatalogItem(row);
    if (!item) continue;
    const data = item.data;
    if ("reactions" in data) {
      for (const reaction of data.reactions) if (!reactions.includes(reaction)) reactions.push(reaction);
    } else if (item.kind === "avatar_frame") {
      frame ??= data;
    } else {
      name ??= data;
    }
  }
  return {
    cosmetics: name || frame ? { name, frame } : null,
    reactions: reactions.slice(0, REACTIONS_MAX_PER_PERSON - REACTIONS.length),
  };
}

/** Reações que a pessoa pode enviar na sala: as básicas e as dos pacotes, sem repetir, até o teto. */
export function allowedReactions(packReactions: readonly string[]): string[] {
  const list: string[] = [...REACTIONS];
  for (const reaction of packReactions) if (!list.includes(reaction)) list.push(reaction);
  return list.slice(0, REACTIONS_MAX_PER_PERSON);
}
