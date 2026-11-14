import { FIXED_ROOM_MODERATORS_MAX } from "@sualive/config";
import { WS_CLOSE } from "@sualive/protocol";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanStatus } from "../src/billing/plan";
import type * as PlanModule from "../src/billing/plan";
import { roomModerators } from "../src/db/schema";
import { createTestUser, testDb } from "./account";
import { useD1 } from "./d1";
import { connect, createRoom, join, mockOutboundFetch, type Guest, type TestClient } from "./helpers";
import { joinWith, planFor, plusUsers, roomInfoWith, runAlarm } from "./room-e4-helpers";

vi.mock("../src/billing/plan", async (importOriginal) => {
  const original = await importOriginal<typeof PlanModule>();
  return { ...original, getPlanStatus: vi.fn(async () => original.NO_PLAN) };
});

useD1();

beforeEach(() => {
  mockOutboundFetch();
  plusUsers.clear();
  vi.mocked(getPlanStatus).mockImplementation(planFor);
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Person = { guest: Guest; client: TestClient; id: string };

async function roomWith(count: number) {
  const { code, ownerToken } = await createRoom();
  const people: Person[] = [];
  for (let i = 0; i < count; i++) {
    const guest = await join(code, `Pessoa ${i + 1}`);
    const { client } = await connect(code, guest, i === 0 ? ownerToken : undefined);
    people.push({ guest, client, id: guest.participantId });
  }
  return { code, ownerToken, people };
}

async function promote(owner: Person, target: Person, witness: Person, moderator = true) {
  owner.client.send({ type: "moderator.set", target: target.id, moderator });
  const updated = await witness.client.next("participant.updated");
  expect(updated.participant).toMatchObject({ id: target.id, isModerator: moderator });
}

describe("moderador na sala comum", () => {
  it("só o dono promove; o moderador silencia, remove e bane participantes comuns", async () => {
    const { people } = await roomWith(5);
    const [owner, mod, a, b, c] = people as [Person, Person, Person, Person, Person];

    a.client.send({ type: "moderator.set", target: b.id, moderator: true });
    expect(await a.client.next("error")).toEqual({ type: "error", code: "not_allowed" });

    await promote(owner, mod, a);
    mod.client.send({ type: "moderate", action: "mute", target: a.id });
    await a.client.next("force.muted");
    mod.client.send({ type: "moderate", action: "kick", target: b.id });
    expect(await b.client.closed()).toBe(WS_CLOSE.kicked);
    mod.client.send({ type: "moderate", action: "ban", target: c.id });
    expect(await c.client.closed()).toBe(WS_CLOSE.banned);
  });

  it("o moderador não age sobre o dono nem sobre outro moderador e não promove; o dono age sobre todos", async () => {
    const { people } = await roomWith(4);
    const [owner, mod, other, plain] = people as [Person, Person, Person, Person];
    await promote(owner, mod, plain);
    await promote(owner, other, plain);

    for (const message of [
      { type: "moderate", action: "kick", target: owner.id },
      { type: "moderate", action: "mute", target: other.id },
      { type: "moderator.set", target: plain.id, moderator: true },
      { type: "moderator.set", target: other.id, moderator: false },
    ] as const) {
      mod.client.send(message);
      expect(await mod.client.next("error")).toEqual({ type: "error", code: "not_allowed" });
    }
    // O dono não promove a si mesmo.
    owner.client.send({ type: "moderator.set", target: owner.id, moderator: true });
    expect(await owner.client.next("error")).toEqual({ type: "error", code: "not_allowed" });
    // O dono remove um moderador.
    owner.client.send({ type: "moderate", action: "kick", target: other.id });
    expect(await other.client.closed()).toBe(WS_CLOSE.kicked);
  });

  it("o papel sobrevive à reconexão e o dono rebaixa", async () => {
    const { code, people } = await roomWith(3);
    const [owner, mod, witness] = people as [Person, Person, Person];
    await promote(owner, mod, witness);

    const { client: again, welcome } = await connect(code, mod.guest);
    expect(welcome.participants.find((p) => p.id === mod.id)?.isModerator).toBe(true);
    await promote(owner, { ...mod, client: again }, witness, false);
    const { welcome: later } = await connect(code, mod.guest);
    expect(later.participants.find((p) => p.id === mod.id)?.isModerator).toBe(false);
  });
});

describe("moderador na sala de link fixo", () => {
  it(`moderadores com conta são permanentes, até ${FIXED_ROOM_MODERATORS_MAX}; o seguinte é recusado; convidado vale até a sala esvaziar`, async () => {
    const owner = await createTestUser({ nickname: "Dona" });
    plusUsers.add(owner.userId);
    const key = `@${owner.handle}`;
    const ownerGuest = await joinWith(key, { cookie: owner.cookie }, {});
    const { client: ownerClient } = await connect(key, ownerGuest);

    const members: Person[] = [];
    for (let i = 0; i <= FIXED_ROOM_MODERATORS_MAX; i++) {
      const user = await createTestUser({ nickname: `Conta ${i}` });
      const guest = await joinWith(key, { cookie: user.cookie }, {});
      members.push({ guest, client: (await connect(key, guest)).client, id: guest.participantId });
    }
    for (const member of members.slice(0, FIXED_ROOM_MODERATORS_MAX)) {
      ownerClient.send({ type: "moderator.set", target: member.id, moderator: true });
      await vi.waitFor(() =>
        expect(
          ownerClient.messages.some(
            (m) =>
              m.type === "participant.updated" && m.participant.id === member.id && m.participant.isModerator,
          ),
        ).toBe(true),
      );
    }
    const rows = await testDb()
      .select()
      .from(roomModerators)
      .where(eq(roomModerators.ownerUserId, owner.userId));
    expect(rows).toHaveLength(FIXED_ROOM_MODERATORS_MAX);
    const extra = members.at(-1)!;
    ownerClient.send({ type: "moderator.set", target: extra.id, moderator: true });
    expect(await ownerClient.next("error")).toEqual({ type: "error", code: "not_allowed" });

    // A sala esvazia e a sessão é apagada: o moderador com conta continua.
    for (const member of members) member.client.close();
    ownerClient.close();
    await vi.waitFor(async () => expect((await roomInfoWith(key, {})).participants).toBe(0));
    expect(await runAlarm(key)).toBe(true);
    const first = members[0]!;
    const back = await joinWith(key, { cookie: first.guest.cookie }, {});
    const { welcome } = await connect(key, back);
    expect(welcome.participants.find((p) => p.id === first.id)?.isModerator).toBe(true);
  }, 20_000);

  it("convidado promovido na sala fixa vale até a sala esvaziar", async () => {
    const owner = await createTestUser({ nickname: "Dona" });
    plusUsers.add(owner.userId);
    const key = `@${owner.handle}`;
    const { client: ownerClient } = await connect(key, await joinWith(key, { cookie: owner.cookie }, {}));
    const guest = await join(key, "Convidada");
    const { client } = await connect(key, guest);
    ownerClient.send({ type: "moderator.set", target: guest.participantId, moderator: true });
    expect((await client.next("participant.updated")).participant.isModerator).toBe(true);
    expect(await testDb().select().from(roomModerators)).not.toContainEqual(
      expect.objectContaining({ ownerUserId: owner.userId, userId: guest.participantId }),
    );

    client.close();
    ownerClient.close();
    await vi.waitFor(async () => expect((await roomInfoWith(key, {})).participants).toBe(0));
    expect(await runAlarm(key)).toBe(true);
    const again = await join(key, "Convidada", { cookie: guest.cookie, ip: guest.ip });
    const { welcome } = await connect(key, again);
    expect(welcome.participants.find((p) => p.id === guest.participantId)?.isModerator).toBe(false);
  });
});
