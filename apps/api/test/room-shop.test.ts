import { GOLD_GIFT_DAILY_LIMIT, REACTIONS } from "@sualive/config";
import { joinRoomResponseSchema } from "@sualive/protocol";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, type TestUser } from "./account";
import { useD1 } from "./d1";
import {
  connect,
  createRoom,
  GOOD_TURNSTILE,
  join,
  mockOutboundFetch,
  postJson,
  randomIp,
  roomStub,
  type Guest,
} from "./helpers";
import { expectConsistent, giveBalance, grantItem, ledgerRows } from "./shop-helpers";

useD1();

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const RED = { light: ["#b3261e"], dark: ["#ff8a80"] };
const SUNSET = { light: ["#b3261e", "#a84300"], dark: ["#ff8a80", "#ffa66b"] };
const SKY = { light: ["#0b57d0"], dark: ["#7fb2ff"] };
const PARTY = ["🔥", "💯", "🙌", "🥳", "✨", "🚀"];
const FEELINGS = ["🥰", "😭", "😡", "🤔", "😴", "🫡"];

/** Entra logado (o cookie é o da conta). */
async function joinAs(code: string, user: Pick<TestUser, "cookie">): Promise<Guest> {
  const ip = randomIp();
  const response = await postJson(
    `/api/rooms/${code}/join`,
    { turnstileToken: GOOD_TURNSTILE },
    { ip, cookie: user.cookie },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body = joinRoomResponseSchema.parse(await response.json());
  return { ...body, cookie: user.cookie, ip };
}

async function member(code: string, options: Parameters<typeof createTestUser>[0] = {}) {
  const user = await createTestUser(options);
  const guest = await joinAs(code, user);
  return { user, guest };
}

describe("cosméticos na sala", () => {
  it("participante com conta leva os cosméticos equipados; sem conta, nulo", async () => {
    const { code } = await createRoom();
    const styled = await createTestUser({ nickname: "Estilosa" });
    await grantItem(styled.userId, "gradient_sunset");
    await grantItem(styled.userId, "frame_sky");
    await grantItem(styled.userId, "color_red", false); // comprado, não equipado
    const plain = await createTestUser({ nickname: "Simples" });
    const packOnly = await createTestUser({ nickname: "Só reações" });
    await grantItem(packOnly.userId, "pack_party");

    const visitor = await join(code, "Visitante");
    const { client: visitorClient } = await connect(code, visitor);
    const styledGuest = await joinAs(code, styled);
    const { welcome } = await connect(code, styledGuest);
    const plainGuest = await joinAs(code, plain);
    await connect(code, plainGuest);
    const packGuest = await joinAs(code, packOnly);
    const { welcome: last } = await connect(code, packGuest);

    expect(welcome.participants.find((p) => p.id === styledGuest.participantId)).toMatchObject({
      cosmetics: { name: SUNSET, frame: SKY },
      canReceiveGold: true,
    });
    expect(welcome.participants.find((p) => p.id === visitor.participantId)).toMatchObject({
      cosmetics: null,
      canReceiveGold: false,
    });
    expect(last.participants.find((p) => p.id === plainGuest.participantId)).toMatchObject({
      cosmetics: null,
      canReceiveGold: true,
    });
    expect(last.participants.find((p) => p.id === packGuest.participantId)?.cosmetics).toBeNull();
    // Os outros veem os mesmos cosméticos.
    const joined = await visitorClient.next("participant.joined");
    expect(joined.participant).toMatchObject({
      id: styledGuest.participantId,
      cosmetics: { name: SUNSET, frame: SKY },
    });
  });

  it("trocar o equipado vale na próxima conexão", async () => {
    const { code } = await createRoom();
    const { user, guest } = await member(code);
    await grantItem(user.userId, "color_red");
    const first = await connect(code, guest);
    expect(first.welcome.participants[0]?.cosmetics).toEqual({ name: RED, frame: null });
    await grantItem(user.userId, "frame_sky");
    const second = await connect(code, guest);
    expect(second.welcome.participants.find((p) => p.id === guest.participantId)?.cosmetics).toEqual({
      name: RED,
      frame: SKY,
    });
  });
});

describe("reações de pacote", () => {
  it("limits.reactions traz as básicas seguidas das dos pacotes equipados", async () => {
    const { code } = await createRoom();
    const { user, guest } = await member(code);
    await grantItem(user.userId, "pack_party");
    await grantItem(user.userId, "pack_feelings");
    await grantItem(user.userId, "pack_gamer", false);
    const { welcome } = await connect(code, guest);
    expect(welcome.limits.reactions).toEqual([...REACTIONS, ...PARTY, ...FEELINGS]);

    const visitor = await join(code, "Visitante");
    expect((await connect(code, visitor)).welcome.limits.reactions).toEqual([...REACTIONS]);
  });

  it("reação de pacote aceita para quem tem e recusada para quem não tem", async () => {
    const { code } = await createRoom();
    const { user, guest } = await member(code);
    await grantItem(user.userId, "pack_party");
    const { client: owner } = await connect(code, guest);
    const other = await member(code);
    const { client: without } = await connect(code, other.guest);
    const visitor = await join(code, "Visitante");
    const { client: anonymous } = await connect(code, visitor);

    owner.send({ type: "reaction.send", reaction: "🔥" });
    expect(await without.next("reaction")).toMatchObject({ from: guest.participantId, reaction: "🔥" });
    expect(await owner.next("reaction")).toMatchObject({ from: guest.participantId, reaction: "🔥" });

    without.send({ type: "reaction.send", reaction: "🔥" });
    expect(await without.next("error")).toEqual({ type: "error", code: "not_allowed" });
    anonymous.send({ type: "reaction.send", reaction: "🚀" });
    expect(await anonymous.next("error")).toEqual({ type: "error", code: "not_allowed" });
    anonymous.send({ type: "reaction.send", reaction: "texto qualquer" });
    expect(await anonymous.next("error")).toEqual({ type: "error", code: "not_allowed" });
    await owner.expectNone("error");
    // As básicas continuam para todos.
    anonymous.send({ type: "reaction.send", reaction: REACTIONS[0] });
    expect(await owner.next("reaction")).toMatchObject({
      from: visitor.participantId,
      reaction: REACTIONS[0],
    });
  });
});

describe("enviar ouro pela sala", () => {
  async function pair(code: string) {
    const sender = await member(code, { nickname: "Remetente" });
    const recipient = await member(code, { nickname: "Destino" });
    const a = await connect(code, sender.guest);
    const b = await connect(code, recipient.guest);
    return { sender, recipient, a: a.client, b: b.client };
  }

  it("dá certo: saldos, gift.result ok a quem enviou e gift para a sala inteira", async () => {
    const { code } = await createRoom();
    const { sender, recipient, a, b } = await pair(code);
    const visitor = await join(code, "Visitante");
    const { client: witness } = await connect(code, visitor);
    await giveBalance(sender.user.userId, "gold", 500);

    a.send({ type: "gift.send", requestId: "g1", to: recipient.guest.participantId, amount: 120 });
    expect(await a.next("gift.result")).toEqual({ type: "gift.result", requestId: "g1", ok: true });
    const notice = {
      type: "gift",
      from: sender.guest.participantId,
      fromNickname: "Remetente",
      to: recipient.guest.participantId,
      toNickname: "Destino",
      amount: 120,
    };
    expect(await a.next("gift")).toEqual(notice);
    expect(await b.next("gift")).toEqual(notice);
    expect(await witness.next("gift")).toEqual(notice);
    await b.expectNone("gift.result");
    await witness.expectNone("gift.result");

    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 380 });
    expect(await expectConsistent(recipient.user.userId)).toEqual({ silver: 0, gold: 120 });
    expect(await ledgerRows(sender.user.userId, "gift_sent")).toEqual([
      expect.objectContaining({ currency: "gold", amount: -120, counterpart_user_id: recipient.user.userId }),
    ]);
    expect(await ledgerRows(recipient.user.userId, "gift_received")).toEqual([
      expect.objectContaining({ currency: "gold", amount: 120, counterpart_user_id: sender.user.userId }),
    ]);
  });

  it("sem saldo: insufficient_funds e nada muda", async () => {
    const { code } = await createRoom();
    const { sender, recipient, a, b } = await pair(code);
    await giveBalance(sender.user.userId, "gold", 50);
    await giveBalance(sender.user.userId, "silver", 1000); // prata não conta
    a.send({ type: "gift.send", requestId: "g2", to: recipient.guest.participantId, amount: 51 });
    expect(await a.next("gift.result")).toEqual({
      type: "gift.result",
      requestId: "g2",
      ok: false,
      reason: "insufficient_funds",
    });
    await b.expectNone("gift");
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 1000, gold: 50 });
    expect(await expectConsistent(recipient.user.userId)).toEqual({ silver: 0, gold: 0 });
  });

  it("acima do limite diário: daily_limit (o mesmo limite do envio por @nome)", async () => {
    const { code } = await createRoom();
    const { sender, recipient, a } = await pair(code);
    await giveBalance(sender.user.userId, "gold", GOLD_GIFT_DAILY_LIMIT + 1000);
    a.send({
      type: "gift.send",
      requestId: "g3",
      to: recipient.guest.participantId,
      amount: GOLD_GIFT_DAILY_LIMIT - 100,
    });
    expect((await a.next("gift.result")).ok).toBe(true);
    a.send({ type: "gift.send", requestId: "g4", to: recipient.guest.participantId, amount: 101 });
    expect(await a.next("gift.result")).toMatchObject({ requestId: "g4", ok: false, reason: "daily_limit" });
    a.send({ type: "gift.send", requestId: "g5", to: recipient.guest.participantId, amount: 100 });
    expect(await a.next("gift.result")).toMatchObject({ requestId: "g5", ok: true });
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 1000 });
    expect(await expectConsistent(recipient.user.userId)).toEqual({ silver: 0, gold: GOLD_GIFT_DAILY_LIMIT });
  });

  it("para quem não tem conta, por quem não tem conta e para si mesmo: not_allowed", async () => {
    const { code } = await createRoom();
    const sender = await member(code);
    const { client: a } = await connect(code, sender.guest);
    const visitor = await join(code, "Visitante");
    const { client: anonymous } = await connect(code, visitor);
    await giveBalance(sender.user.userId, "gold", 500);

    a.send({ type: "gift.send", requestId: "to-guest", to: visitor.participantId, amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({
      requestId: "to-guest",
      ok: false,
      reason: "not_allowed",
    });
    anonymous.send({
      type: "gift.send",
      requestId: "from-guest",
      to: sender.guest.participantId,
      amount: 10,
    });
    expect(await anonymous.next("gift.result")).toMatchObject({
      requestId: "from-guest",
      ok: false,
      reason: "not_allowed",
    });
    a.send({ type: "gift.send", requestId: "self", to: sender.guest.participantId, amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({
      requestId: "self",
      ok: false,
      reason: "not_allowed",
    });
    await a.expectNone("gift");
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 500 });
  });

  it("alvo ausente: not_found", async () => {
    const { code } = await createRoom();
    const { sender, recipient, a, b } = await pair(code);
    await giveBalance(sender.user.userId, "gold", 500);
    b.close();
    await a.next("participant.left");
    a.send({ type: "gift.send", requestId: "gone", to: recipient.guest.participantId, amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({ requestId: "gone", ok: false, reason: "not_found" });
    a.send({ type: "gift.send", requestId: "nobody", to: "x".repeat(43), amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({
      requestId: "nobody",
      ok: false,
      reason: "not_found",
    });
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 500 });
  });

  it("um envio por vez: pedido com outro em andamento é recusado", async () => {
    const { code } = await createRoom();
    const { sender, recipient, a } = await pair(code);
    await giveBalance(sender.user.userId, "gold", 500);
    // Simula um envio em andamento desta pessoa (o tempo real da corrida não é controlável aqui).
    const inFlight = (instance: unknown) => (instance as { giftsInFlight: Set<string> }).giftsInFlight;
    await runInDurableObject(roomStub(code), (instance) => {
      inFlight(instance).add(sender.guest.participantId);
    });
    a.send({ type: "gift.send", requestId: "busy", to: recipient.guest.participantId, amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({ requestId: "busy", ok: false, reason: "error" });
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 500 });

    await runInDurableObject(roomStub(code), (instance) => {
      inFlight(instance).delete(sender.guest.participantId);
    });
    a.send({ type: "gift.send", requestId: "free", to: recipient.guest.participantId, amount: 10 });
    expect(await a.next("gift.result")).toMatchObject({ requestId: "free", ok: true });
    // Dois pedidos seguidos: cada um é tratado inteiro, sem saldo negativo nem linha a mais.
    a.send({ type: "gift.send", requestId: "x1", to: recipient.guest.participantId, amount: 10 });
    a.send({ type: "gift.send", requestId: "x2", to: recipient.guest.participantId, amount: 10 });
    const results = [await a.next("gift.result"), await a.next("gift.result")];
    const sent = 10 + results.filter((r) => r.ok).length * 10;
    expect(await expectConsistent(sender.user.userId)).toEqual({ silver: 0, gold: 500 - sent });
    expect(await expectConsistent(recipient.user.userId)).toEqual({ silver: 0, gold: sent });
  });

  it("valor fora do permitido é mensagem inválida", async () => {
    const { code } = await createRoom();
    const { recipient, a } = await pair(code);
    a.send({ type: "gift.send", requestId: "zero", to: recipient.guest.participantId, amount: 0 } as never);
    expect(await a.next("error")).toEqual({ type: "error", code: "invalid_message" });
  });
});
