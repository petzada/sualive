import {
  CHAT_RATE_MAX,
  HAND_RATE_MAX,
  HAND_RATE_WINDOW_MS,
  MIC_RATE_MAX,
  REACTION_RATE_MAX,
} from "@sualive/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, createRoom, join, mockOutboundFetch, type Guest, type TestClient } from "./helpers";
import { useClock } from "./room-e4-helpers";

beforeEach(() => {
  mockOutboundFetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function pair() {
  const { code } = await createRoom();
  const actorGuest = await join(code, "Pressa");
  const { client: actor } = await connect(code, actorGuest);
  const { client: witness } = await connect(code, await join(code, "Calma"));
  return { code, actorGuest, actor, witness };
}

async function exhaust(
  actor: TestClient,
  send: (i: number) => void,
  max: number,
  witnessType: string,
  witness: TestClient,
) {
  for (let i = 0; i < max; i++) {
    send(i);
    await witness.next(witnessType as "reaction");
  }
  send(max);
  expect(await actor.next("error")).toEqual({ type: "error", code: "rate_limited" });
}

describe("limites de frequência por pessoa", () => {
  it(`reações: ${REACTION_RATE_MAX} passam e a seguinte é recusada`, async () => {
    const { actor, witness } = await pair();
    await exhaust(
      actor,
      () => actor.send({ type: "reaction.send", reaction: "👍" }),
      REACTION_RATE_MAX,
      "reaction",
      witness,
    );
    await witness.expectNone("reaction");
  });

  it(`mão: ${HAND_RATE_MAX} levantar/baixar passam; depois da janela volta a valer`, async () => {
    const clock = useClock();
    const { actor, witness } = await pair();
    await exhaust(
      actor,
      (i) => actor.send({ type: "hand.set", raised: i % 2 === 0 }),
      HAND_RATE_MAX,
      "participant.updated",
      witness,
    );
    await witness.expectNone("participant.updated");
    clock.advance(HAND_RATE_WINDOW_MS);
    actor.send({ type: "hand.set", raised: true });
    expect((await witness.next("participant.updated")).participant.handRaised).toBe(true);
  });

  it(`microfone: ${MIC_RATE_MAX} ligar/desligar passam e o seguinte é recusado`, async () => {
    const { actor, witness } = await pair();
    await exhaust(
      actor,
      (i) => actor.send({ type: "mic.set", muted: i % 2 === 1 }),
      MIC_RATE_MAX,
      "participant.updated",
      witness,
    );
  });

  it("reconectar (ou abrir outra aba) não zera o limite: chat e reações", async () => {
    const { code, actorGuest, actor, witness } = await pair();
    for (let i = 0; i < CHAT_RATE_MAX; i++) {
      actor.send({ type: "chat.send", text: `m${i}` });
      await witness.next("chat.message");
    }
    for (let i = 0; i < REACTION_RATE_MAX; i++) {
      actor.send({ type: "reaction.send", reaction: "🎉" });
      await witness.next("reaction");
    }
    const { client: again } = await connect(code, actorGuest as Guest);
    again.send({ type: "chat.send", text: "de novo" });
    expect(await again.next("error")).toEqual({ type: "error", code: "rate_limited" });
    again.send({ type: "reaction.send", reaction: "🎉" });
    expect(await again.next("error")).toEqual({ type: "error", code: "rate_limited" });
    await witness.expectNone("chat.message");
  });
});
