import { GOLD_GIFT_DAILY_LIMIT } from "@sualive/config";
import { shopPurchaseResponseSchema, shopResponseSchema, type ShopItem } from "@sualive/protocol";
import { describe, expect, it } from "vitest";
import { createTestUser } from "./account";
import { useD1 } from "./d1";
import {
  buy,
  env,
  equip,
  errorOf,
  expectConsistent,
  giveBalance,
  ledgerRows,
  ownedItems,
  shopRequest,
} from "./shop-helpers";

useD1();

async function shopOf(cookie: string): Promise<ShopItem[]> {
  const response = await shopRequest("", cookie);
  expect(response.status).toBe(200);
  return shopResponseSchema.parse(await response.json()).items;
}

function find(items: ShopItem[], id: string): ShopItem {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error(`item ${id} ausente`);
  return item;
}

function equippedIds(items: ShopItem[]): string[] {
  return items.filter((i) => i.equipped).map((i) => i.id);
}

describe("GET /api/shop", () => {
  it("lista o catálogo ativo na ordem, com posse e uso da conta", async () => {
    const user = await createTestUser();
    const items = await shopOf(user.cookie);
    expect(items).toHaveLength(23);
    expect(items[0]).toEqual({
      id: "color_red",
      kind: "name_color",
      name: "Vermelho",
      price: 100,
      data: { light: ["#b3261e"], dark: ["#ff8a80"] },
      owned: false,
      equipped: false,
    });
    expect(items.at(-1)).toMatchObject({ id: "pack_gamer", kind: "reaction_pack", price: 400 });
    expect(find(items, "pack_party").data).toEqual({ reactions: ["🔥", "💯", "🙌", "🥳", "✨", "🚀"] });

    await giveBalance(user.userId, "silver", 1000);
    expect((await buy(user.cookie, "color_blue")).status).toBe(200);
    expect((await equip(user.cookie, "color_blue")).status).toBe(200);
    expect((await buy(user.cookie, "frame_sky")).status).toBe(200);
    const after = await shopOf(user.cookie);
    expect(find(after, "color_blue")).toMatchObject({ owned: true, equipped: true });
    expect(find(after, "frame_sky")).toMatchObject({ owned: true, equipped: false });
    expect(find(after, "color_red")).toMatchObject({ owned: false, equipped: false });
  });

  it("item fora da vitrine some para quem não tem e continua para quem tem", async () => {
    const id = `retired_${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.prepare(
      "INSERT INTO shop_items (id, kind, name, price, data, sort, active) VALUES (?1, 'name_color', 'Antiga', 100, ?2, 5, 1)",
    )
      .bind(id, JSON.stringify({ light: ["#123456"], dark: ["#abcdef"] }))
      .run();
    const owner = await createTestUser();
    const other = await createTestUser();
    await giveBalance(owner.userId, "silver", 100);
    expect((await buy(owner.cookie, id)).status).toBe(200);
    await env.DB.prepare("UPDATE shop_items SET active = 0 WHERE id = ?1").bind(id).run();

    expect((await shopOf(other.cookie)).some((i) => i.id === id)).toBe(false);
    expect(find(await shopOf(owner.cookie), id)).toMatchObject({ owned: true });
    // Fora da vitrine não se compra, mas quem tem ainda equipa.
    await giveBalance(other.userId, "silver", 100);
    const refused = await buy(other.cookie, id);
    expect(refused.status).toBe(404);
    expect(await errorOf(refused)).toBe("not_found");
    expect((await equip(owner.cookie, id)).status).toBe(200);
  });

  it("item malformado no banco não sai", async () => {
    const id = `broken_${crypto.randomUUID().slice(0, 8)}`;
    await env.DB.prepare(
      "INSERT INTO shop_items (id, kind, name, price, data, sort, active) VALUES (?1, 'name_color', 'Quebrada', 100, ?2, 6, 1)",
    )
      .bind(id, JSON.stringify({ reactions: ["🔥"] }))
      .run();
    const user = await createTestUser();
    expect((await shopOf(user.cookie)).some((i) => i.id === id)).toBe(false);
    await giveBalance(user.userId, "silver", 100);
    expect((await buy(user.cookie, id)).status).toBe(404);
    await env.DB.prepare("UPDATE shop_items SET active = 0 WHERE id = ?1").bind(id).run();
  });
});

describe("POST /api/shop/items/:id/buy", () => {
  it("compra com prata: saldo e extrato mudam juntos, com referência e item gravados", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 250);
    const response = await buy(user.cookie, "color_green", { currency: "silver" });
    expect(response.status).toBe(200);
    const body = shopPurchaseResponseSchema.parse(await response.json());
    expect(body.wallet).toEqual({
      silver: 150,
      gold: 0,
      goldSentToday: 0,
      goldGiftDailyLimit: GOLD_GIFT_DAILY_LIMIT,
    });
    expect(find(body.items, "color_green")).toMatchObject({ owned: true, equipped: false });
    expect(await ledgerRows(user.userId, "shop_purchase")).toEqual([
      {
        currency: "silver",
        amount: -100,
        reason: "shop_purchase",
        reference: `shop:${user.userId}:color_green`,
        item_id: "color_green",
        counterpart_user_id: null,
      },
    ]);
    expect(await ownedItems(user.userId)).toEqual([{ item_id: "color_green", equipped: 0 }]);
    expect(await expectConsistent(user.userId)).toEqual({ silver: 150, gold: 0 });
  });

  it("compra com ouro pelo mesmo preço", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "gold", 1000);
    await giveBalance(user.userId, "silver", 50);
    const response = await buy(user.cookie, "frame_gold", { currency: "gold" });
    expect(response.status).toBe(200);
    const body = shopPurchaseResponseSchema.parse(await response.json());
    expect(body.wallet).toMatchObject({ silver: 50, gold: 400 });
    expect(await ledgerRows(user.userId, "shop_purchase")).toEqual([
      expect.objectContaining({ currency: "gold", amount: -600, item_id: "frame_gold" }),
    ]);
    expect(await expectConsistent(user.userId)).toEqual({ silver: 50, gold: 400 });
  });

  it("o preço é o do catálogo, mesmo se o corpo tentar outro", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 500);
    const response = await buy(user.cookie, "gradient_ocean", { currency: "silver", price: 1, amount: 1 });
    expect(response.status).toBe(200);
    expect(shopPurchaseResponseSchema.parse(await response.json()).wallet.silver).toBe(200);
  });

  it("saldo insuficiente não entrega o item nem mexe no saldo", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 99);
    await giveBalance(user.userId, "gold", 1000);
    const response = await buy(user.cookie, "color_red", { currency: "silver" });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toBe("insufficient_funds");
    expect(await ownedItems(user.userId)).toEqual([]);
    expect(await ledgerRows(user.userId, "shop_purchase")).toEqual([]);
    expect(await expectConsistent(user.userId)).toEqual({ silver: 99, gold: 1000 });
  });

  it("comprar duas vezes em sequência entrega e debita uma vez só", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 1000);
    expect((await buy(user.cookie, "pack_party")).status).toBe(200);
    const again = await buy(user.cookie, "pack_party", { currency: "silver" });
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe("already_owned");
    // Nem com a outra moeda.
    await giveBalance(user.userId, "gold", 1000);
    expect(await errorOf(await buy(user.cookie, "pack_party", { currency: "gold" }))).toBe("already_owned");
    expect(await ledgerRows(user.userId, "shop_purchase")).toHaveLength(1);
    expect(await expectConsistent(user.userId)).toEqual({ silver: 600, gold: 1000 });
  });

  it("dois pedidos simultâneos entregam e debitam uma vez só", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 1000);
    await giveBalance(user.userId, "gold", 1000);
    const responses = await Promise.all([
      buy(user.cookie, "frame_flame", { currency: "silver" }),
      buy(user.cookie, "frame_flame", { currency: "gold" }),
      buy(user.cookie, "frame_flame", { currency: "silver" }),
    ]);
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(await errorOf(response)).toBe("already_owned");
    }
    expect(await ownedItems(user.userId)).toEqual([{ item_id: "frame_flame", equipped: 0 }]);
    expect(await ledgerRows(user.userId, "shop_purchase")).toHaveLength(1);
    const balance = await expectConsistent(user.userId);
    expect(balance.silver + balance.gold).toBe(2000 - 600);
  });

  it("item inexistente e corpo inválido", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 1000);
    const missing = await buy(user.cookie, "nao_existe");
    expect(missing.status).toBe(404);
    expect(await errorOf(missing)).toBe("not_found");
    expect(await errorOf(await buy(user.cookie, "x".repeat(65)))).toBe("not_found");
    expect(await errorOf(await buy(user.cookie, "color_red", { currency: "bronze" }))).toBe(
      "invalid_request",
    );
    expect(await errorOf(await buy(user.cookie, "color_red", {}))).toBe("invalid_request");
    expect(await expectConsistent(user.userId)).toEqual({ silver: 1000, gold: 0 });
  });
});

describe("POST /api/shop/items/:id/equip", () => {
  async function ownerOf(...ids: string[]) {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 5000);
    for (const id of ids) expect((await buy(user.cookie, id)).status).toBe(200);
    return user;
  }

  async function equipOk(cookie: string, id: string, equipped = true): Promise<ShopItem[]> {
    const response = await equip(cookie, id, equipped);
    expect(response.status, await response.clone().text()).toBe(200);
    return shopResponseSchema.parse(await response.json()).items;
  }

  it("cor e degradê dividem o lugar do nome", async () => {
    const user = await ownerOf("color_red", "color_blue", "gradient_sunset");
    expect(equippedIds(await equipOk(user.cookie, "color_red"))).toEqual(["color_red"]);
    expect(equippedIds(await equipOk(user.cookie, "color_blue"))).toEqual(["color_blue"]);
    expect(equippedIds(await equipOk(user.cookie, "gradient_sunset"))).toEqual(["gradient_sunset"]);
    expect(equippedIds(await equipOk(user.cookie, "color_red"))).toEqual(["color_red"]);
  });

  it("moldura troca a anterior e não mexe no nome nem nas reações", async () => {
    const user = await ownerOf("color_red", "frame_sky", "frame_rose", "pack_party");
    await equipOk(user.cookie, "color_red");
    await equipOk(user.cookie, "pack_party");
    await equipOk(user.cookie, "frame_sky");
    expect(equippedIds(await equipOk(user.cookie, "frame_rose"))).toEqual([
      "color_red",
      "frame_rose",
      "pack_party",
    ]);
  });

  it("pacotes de reações são independentes; desequipar só tira aquele", async () => {
    const user = await ownerOf("pack_party", "pack_feelings", "gradient_ocean");
    await equipOk(user.cookie, "pack_party");
    await equipOk(user.cookie, "gradient_ocean");
    expect(equippedIds(await equipOk(user.cookie, "pack_feelings"))).toEqual([
      "gradient_ocean",
      "pack_party",
      "pack_feelings",
    ]);
    expect(equippedIds(await equipOk(user.cookie, "pack_party", false))).toEqual([
      "gradient_ocean",
      "pack_feelings",
    ]);
    expect(equippedIds(await equipOk(user.cookie, "gradient_ocean", false))).toEqual(["pack_feelings"]);
    // Desequipar o que já está desequipado não muda nada.
    expect(equippedIds(await equipOk(user.cookie, "gradient_ocean", false))).toEqual(["pack_feelings"]);
  });

  it("equipar o que não tem, item inexistente e corpo inválido", async () => {
    const user = await ownerOf("color_red");
    const notOwned = await equip(user.cookie, "color_blue");
    expect(notOwned.status).toBe(409);
    expect(await errorOf(notOwned)).toBe("not_owned");
    expect(await errorOf(await equip(user.cookie, "nao_existe"))).toBe("not_found");
    const invalid = await shopRequest("/items/color_red/equip", user.cookie, {
      method: "POST",
      body: { equipped: "sim" },
    });
    expect(await errorOf(invalid)).toBe("invalid_request");
    expect(await ownedItems(user.userId)).toEqual([{ item_id: "color_red", equipped: 0 }]);
  });
});

describe("acesso à loja", () => {
  it("sem sessão: unauthorized", async () => {
    for (const response of [
      await shopRequest("", undefined),
      await buy("", "color_red"),
      await equip("", "color_red"),
    ]) {
      expect(response.status).toBe(401);
      expect(await errorOf(response)).toBe("unauthorized");
    }
  });

  it("sem primeiro acesso: onboarding_required", async () => {
    const user = await createTestUser({ onboarded: false });
    await giveBalance(user.userId, "silver", 1000);
    for (const response of [
      await shopRequest("", user.cookie),
      await buy(user.cookie, "color_red"),
      await equip(user.cookie, "color_red"),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe("onboarding_required");
    }
    expect(await ownedItems(user.userId)).toEqual([]);
  });

  it("outra origem não compra nem equipa", async () => {
    const user = await createTestUser();
    await giveBalance(user.userId, "silver", 1000);
    const foreign = await shopRequest("/items/color_red/buy", user.cookie, {
      method: "POST",
      body: { currency: "silver" },
      origin: "https://outro.site",
    });
    expect(foreign.status).toBe(400);
    expect(await errorOf(foreign)).toBe("invalid_request");
    const noOrigin = await shopRequest("/items/color_red/buy", user.cookie, {
      method: "POST",
      body: { currency: "silver" },
      origin: null,
    });
    expect(await errorOf(noOrigin)).toBe("invalid_request");
    const crossSite = await shopRequest("/items/color_red/equip", user.cookie, {
      method: "POST",
      body: { equipped: true },
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(await errorOf(crossSite)).toBe("invalid_request");
    expect(await ownedItems(user.userId)).toEqual([]);
    expect(await expectConsistent(user.userId)).toEqual({ silver: 1000, gold: 0 });
  });
});
