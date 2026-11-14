import { REACTIONS } from "@sualive/config";
import type { Cosmetics, GiftFailure } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIFT_LIFETIME_MS, GIFT_REQUEST_TIMEOUT_MS, RoomClient } from "./client";
import { CODE, createHarness, participant, welcomeDefaults, type Harness } from "./testing/fakes";

const flush = () => vi.advanceTimersByTimeAsync(0);

let h: Harness;
let client: RoomClient;

const state = () => client.getSnapshot();

const COSMETICS: Cosmetics = {
  name: { light: ["#6d28d9", "#db2777"], dark: ["#a78bfa", "#f472b6"] },
  frame: { light: ["#b45309"], dark: ["#fbbf24"] },
};
const PACK = ["🥳", "🔥"];

/** Entra na sala com uma conta ("me") e "bob", também com conta. */
async function connect({
  self = participant("me", { canReceiveGold: true }),
  others = [participant("bob", { canReceiveGold: true, cosmetics: COSMETICS })],
  reactions = [...REACTIONS, ...PACK],
} = {}) {
  client = new RoomClient(CODE, h.deps);
  client.retain();
  await flush();
  await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
  h.socket.accept();
  h.socket.receive({
    type: "welcome",
    ...welcomeDefaults,
    limits: { ...welcomeDefaults.limits, reactions },
    self: self.id,
    participants: [self, ...others],
    chat: [],
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
});

afterEach(() => {
  client?.dispose();
  vi.useRealTimers();
});

describe("cosméticos e conta dos participantes", () => {
  it("participante traz cosméticos e se pode receber ouro", async () => {
    await connect({
      others: [participant("bob", { canReceiveGold: true, cosmetics: COSMETICS }), participant("eve")],
    });
    const bob = state().participants.find((p) => p.id === "bob");
    const eve = state().participants.find((p) => p.id === "eve");
    expect(bob).toMatchObject({ cosmetics: COSMETICS, canReceiveGold: true });
    expect(eve).toMatchObject({ cosmetics: null, canReceiveGold: false });
  });

  it("cosmético trocado chega por participant.updated", async () => {
    await connect();
    h.socket.receive({
      type: "participant.updated",
      participant: participant("bob", { canReceiveGold: true }),
    });
    expect(state().participants.find((p) => p.id === "bob")?.cosmetics).toBeNull();
  });

  it("canSendGold segue a própria pessoa ter conta", async () => {
    await connect();
    expect(state().canSendGold).toBe(true);
    client.actions.leave();
    expect(state().canSendGold).toBe(false);
  });

  it("sem conta não envia ouro", async () => {
    await connect({ self: participant("me") });
    expect(state().canSendGold).toBe(false);
  });
});

describe("reações disponíveis", () => {
  it("antes do welcome são as básicas; depois, as do servidor", async () => {
    client = new RoomClient(CODE, h.deps);
    expect(state().availableReactions).toEqual([...REACTIONS]);
    client.dispose();
    await connect();
    expect(state().availableReactions).toEqual([...REACTIONS, ...PACK]);
  });

  it("reação do pacote equipado sai; fora da lista, não", async () => {
    await connect();
    client.actions.react("🥳");
    client.actions.react("🦄");
    expect(h.socket.sentOfType("reaction.send")).toEqual([{ type: "reaction.send", reaction: "🥳" }]);
  });

  it("sem o pacote, a reação dele não sai", async () => {
    await connect({ reactions: [...REACTIONS] });
    client.actions.react("🥳");
    expect(h.socket.sentOfType("reaction.send")).toEqual([]);
  });
});

describe("sendGold", () => {
  it("envia gift.send com requestId e resolve com o gift.result", async () => {
    await connect();
    const sending = client.actions.sendGold("bob", 50);
    const [request] = h.socket.sentOfType("gift.send");
    expect(request).toEqual({ type: "gift.send", requestId: expect.any(String), to: "bob", amount: 50 });
    // Resposta de outro pedido é ignorada.
    h.socket.receive({ type: "gift.result", requestId: "outro", ok: false, reason: "error" });
    h.socket.receive({ type: "gift.result", requestId: request?.requestId ?? "", ok: true });
    await expect(sending).resolves.toEqual({ ok: true });
  });

  it.each<GiftFailure>(["insufficient_funds", "daily_limit", "not_allowed", "not_found", "error"])(
    "recusa %s chega como motivo",
    async (reason) => {
      await connect();
      const sending = client.actions.sendGold("bob", 50);
      const [request] = h.socket.sentOfType("gift.send");
      h.socket.receive({ type: "gift.result", requestId: request?.requestId ?? "", ok: false, reason });
      await expect(sending).resolves.toEqual({ ok: false, reason });
    },
  );

  it("recusa sem motivo vira error", async () => {
    await connect();
    const sending = client.actions.sendGold("bob", 50);
    const [request] = h.socket.sentOfType("gift.send");
    h.socket.receive({ type: "gift.result", requestId: request?.requestId ?? "", ok: false });
    await expect(sending).resolves.toEqual({ ok: false, reason: "error" });
  });

  it("sem resposta no prazo resolve lost, e a resposta atrasada é ignorada", async () => {
    await connect();
    const sending = client.actions.sendGold("bob", 50);
    const [request] = h.socket.sentOfType("gift.send");
    await vi.advanceTimersByTimeAsync(GIFT_REQUEST_TIMEOUT_MS);
    await expect(sending).resolves.toEqual({ ok: false, reason: "lost" });
    h.socket.receive({ type: "gift.result", requestId: request?.requestId ?? "", ok: true });
    // Liberado para um novo envio.
    void client.actions.sendGold("bob", 10);
    expect(h.socket.sentOfType("gift.send")).toHaveLength(2);
  });

  it("queda da conexão resolve lost", async () => {
    await connect();
    const sending = client.actions.sendGold("bob", 50);
    h.socket.serverClose(1006);
    await expect(sending).resolves.toEqual({ ok: false, reason: "lost" });
  });

  it("sair da sala resolve lost", async () => {
    await connect();
    const sending = client.actions.sendGold("bob", 50);
    client.actions.leave();
    await expect(sending).resolves.toEqual({ ok: false, reason: "lost" });
  });

  it("um envio por vez", async () => {
    await connect();
    const first = client.actions.sendGold("bob", 50);
    await expect(client.actions.sendGold("bob", 10)).resolves.toEqual({ ok: false, reason: "error" });
    expect(h.socket.sentOfType("gift.send")).toHaveLength(1);
    const [request] = h.socket.sentOfType("gift.send");
    h.socket.receive({ type: "gift.result", requestId: request?.requestId ?? "", ok: true });
    await expect(first).resolves.toEqual({ ok: true });
  });

  it("valor fora do limite não sai", async () => {
    await connect();
    await expect(client.actions.sendGold("bob", 0)).resolves.toEqual({ ok: false, reason: "error" });
    await expect(client.actions.sendGold("bob", 1.5)).resolves.toEqual({ ok: false, reason: "error" });
    expect(h.socket.sentOfType("gift.send")).toEqual([]);
  });

  it("fora da sala resolve lost sem enviar", async () => {
    client = new RoomClient(CODE, h.deps);
    client.retain();
    await flush();
    await expect(client.actions.sendGold("bob", 10)).resolves.toEqual({ ok: false, reason: "lost" });
  });
});

describe("avisos de ouro na sala", () => {
  it("gift entra em gifts e some depois do tempo", async () => {
    await connect();
    h.socket.receive({
      type: "gift",
      from: "bob",
      fromNickname: "Bob",
      to: "me",
      toNickname: "Ana",
      amount: 100,
    });
    expect(state().gifts).toEqual([
      {
        id: expect.any(String),
        fromId: "bob",
        fromNickname: "Bob",
        toId: "me",
        toNickname: "Ana",
        amount: 100,
      },
    ]);
    await vi.advanceTimersByTimeAsync(GIFT_LIFETIME_MS);
    expect(state().gifts).toEqual([]);
  });

  it("sair da sala limpa os avisos", async () => {
    await connect();
    h.socket.receive({
      type: "gift",
      from: "bob",
      fromNickname: "Bob",
      to: "me",
      toNickname: "Ana",
      amount: 100,
    });
    client.actions.leave();
    expect(state().gifts).toEqual([]);
  });
});
