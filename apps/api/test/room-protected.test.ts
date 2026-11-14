import {
  METER_INTERVAL_MS,
  PROTECTED_ROOM_GOLD_PER_HOUR,
  PROTECTED_ROOM_GRACE_MS,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
} from "@sualive/config";
import { iceServersResponseSchema, WS_CLOSE, type SignalData } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanStatus } from "../src/billing/plan";
import type * as PlanModule from "../src/billing/plan";
import { TURN_API_BASE } from "../src/external";
import { accountRequest, createTestUser, type TestUser } from "./account";
import { useD1 } from "./d1";
import { mockOutboundFetch, type Guest, type TestClient } from "./helpers";
import {
  connectWith,
  createProtectedRoom,
  createRoomAs,
  errorOf,
  joinWith,
  planFor,
  plusUsers,
  requestWith,
  roomInfoWith,
  runAlarm,
  settle,
  storageGet,
  TURN_ENV,
  useClock,
} from "./room-e4-helpers";
import { expectConsistent, grant, ledgerRows } from "./wallet-helpers";

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

async function plusOwner(gold: number): Promise<TestUser> {
  const user = await createTestUser({ nickname: "Dona" });
  plusUsers.add(user.userId);
  if (gold > 0) await grant(user.userId, gold);
  return user;
}

type Person = { guest: Guest; client: TestClient };

/** Sala protegida com a dona (conectada pela conta) e `guests` convidados. */
async function protectedRoom(gold: number, guests = 1) {
  const owner = await plusOwner(gold);
  const { code, ownerToken } = await createProtectedRoom(owner);
  const ownerGuest = await joinWith(code, { cookie: owner.cookie });
  const ownerConn = await connectWith(code, ownerGuest);
  const people: Person[] = [];
  for (let i = 0; i < guests; i++) {
    const guest = await joinWith(code, { nickname: `Pessoa ${i + 1}` });
    people.push({ guest, client: (await connectWith(code, guest)).client });
  }
  return { owner, code, ownerToken, ownerClient: ownerConn.client, ownerWelcome: ownerConn.welcome, people };
}

function goldFor(minutes: number): number {
  return Math.floor((PROTECTED_ROOM_GOLD_PER_HOUR * minutes) / 60);
}

describe("criar sala protegida", () => {
  it("sem conta, sem Plus, sem ouro e sem retransmissão: recusada com o erro de cada caso", async () => {
    const anonymous = await createRoomAs(null, { protected: true });
    expect(await errorOf(anonymous)).toBe("unauthorized");

    const notOnboarded = await createTestUser({ onboarded: false });
    expect(await errorOf(await createRoomAs(notOnboarded, { protected: true }))).toBe("onboarding_required");

    const free = await createTestUser();
    await grant(free.userId, 100);
    const noPlus = await createRoomAs(free, { protected: true });
    expect(noPlus.status).toBe(403);
    expect(await errorOf(noPlus)).toBe("plus_required");

    const broke = await plusOwner(0);
    const noGold = await createRoomAs(broke, { protected: true });
    expect(noGold.status).toBe(409);
    expect(await errorOf(noGold)).toBe("insufficient_funds");

    const rich = await plusOwner(100);
    const noTurn = await createRoomAs(rich, { protected: true, env: {} });
    expect(noTurn.status).toBe(503);
    expect(await errorOf(noTurn)).toBe("protected_unavailable");

    // A sala comum continua sem exigência nenhuma.
    expect((await createRoomAs(null, { env: {} })).status).toBe(200);
  });

  it("com tudo: GET informa protegida e lotação de 6; o welcome traz o teto de vídeos", async () => {
    const { code, ownerWelcome, owner } = await protectedRoom(100, 0);
    expect(await roomInfoWith(code)).toEqual({
      status: "open",
      participants: 1,
      capacity: PROTECTED_ROOM_MAX_PEOPLE,
      fixed: false,
      protected: true,
    });
    expect(ownerWelcome.room).toMatchObject({
      protected: true,
      capacity: PROTECTED_ROOM_MAX_PEOPLE,
      maxVideos: PROTECTED_ROOM_MAX_VIDEOS,
    });
    // A dona é reconhecida pela conta que criou, sem o token.
    const self = ownerWelcome.participants.find((p) => p.id === ownerWelcome.self);
    expect(self?.isOwner).toBe(true);
    expect(owner.userId).toBeTruthy();
  });

  it(`até ${PROTECTED_ROOM_MAX_PEOPLE} pessoas; a seguinte é recusada`, async () => {
    const { code } = await protectedRoom(100, PROTECTED_ROOM_MAX_PEOPLE - 1);
    const response = await requestWith(`/api/rooms/${code}/join`, {
      method: "POST",
      body: { nickname: "Excedente", turnstileToken: "turnstile-ok" },
    });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toBe("room_full");
  });

  it(`o ${PROTECTED_ROOM_MAX_VIDEOS + 1}º vídeo da sala é recusado com room_limit`, async () => {
    const { ownerClient, people } = await protectedRoom(100, 1);
    const other = people[0]!.client;
    ownerClient.send({ type: "video.request", requestId: "a", kind: "camera" });
    await ownerClient.next("video.granted");
    other.send({ type: "video.request", requestId: "b", kind: "screen" });
    await other.next("video.granted");
    other.send({ type: "video.request", requestId: "c", kind: "camera" });
    expect(await other.next("video.denied")).toMatchObject({ requestId: "c", reason: "room_limit" });
  });

  it("credenciais só de retransmissão (relayOnly) e com identificador por sessão", async () => {
    const { code, people } = await protectedRoom(100, 1);
    const fetchSpy = mockOutboundFetch(() =>
      Response.json(
        {
          iceServers: [
            { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" },
          ],
        },
        { status: 201 },
      ),
    );
    const guest = people[0]!.guest;
    const response = await requestWith(`/api/rooms/${code}/ice`, { cookie: guest.cookie, ip: guest.ip });
    expect(iceServersResponseSchema.parse(await response.json()).relayOnly).toBe(true);
    const [url, init] = fetchSpy.mock.calls.at(-1)!;
    expect(url).toContain(TURN_API_BASE);
    expect((JSON.parse(init?.body as string) as { customIdentifier: string }).customIdentifier).toHaveLength(
      32,
    );
  });
});

describe("filtro de candidatos na sala protegida", () => {
  const host = "candidate:1 1 udp 2122260223 192.168.0.10 50000 typ host generation 0";
  const srflx = "candidate:2 1 udp 1686052607 203.0.113.7 50001 typ srflx raddr 192.168.0.10 rport 50000";
  const prflx = "candidate:3 1 udp 1845501695 198.51.100.4 50002 typ prflx raddr 192.168.0.10 rport 50000";
  const relay = "candidate:4 1 udp 41885439 104.30.0.1 60000 typ relay raddr 203.0.113.7 rport 50001";

  function candidate(line: string): SignalData {
    return { kind: "candidate", candidate: { candidate: line, sdpMid: "0", sdpMLineIndex: 0 } };
  }

  it("só candidatos de retransmissão passam, avulsos e no SDP, nos dois sentidos", async () => {
    const { ownerClient, ownerWelcome, people } = await protectedRoom(100, 1);
    const other = people[0]!;
    const ownerId = ownerWelcome.self;

    for (const [from, to, toId] of [
      [ownerClient, other.client, other.guest.participantId],
      [other.client, ownerClient, ownerId],
    ] as const) {
      for (const line of [host, srflx, prflx]) from.send({ type: "signal", to: toId, data: candidate(line) });
      from.send({ type: "signal", to: toId, data: candidate(relay) });
      const forwarded = await to.next("signal");
      expect(forwarded.data).toEqual(
        candidate("candidate:4 1 udp 41885439 104.30.0.1 60000 typ relay raddr 0.0.0.0 rport 0"),
      );
      await to.expectNone("signal");
      // Fim dos candidatos passa.
      from.send({ type: "signal", to: toId, data: { kind: "candidate", candidate: null } });
      expect((await to.next("signal")).data).toEqual({ kind: "candidate", candidate: null });

      const sdp = [
        "v=0",
        "o=- 1 2 IN IP4 127.0.0.1",
        "m=video 50000 UDP/TLS/RTP/SAVPF 96",
        "c=IN IP4 203.0.113.7",
        "a=rtcp:50001 IN IP4 203.0.113.7",
        `a=${host}`,
        `a=${srflx}`,
        `a=${prflx}`,
        `a=${relay}`,
        "a=end-of-candidates",
        "",
      ].join("\r\n");
      from.send({
        type: "signal",
        to: toId,
        data: { kind: "description", description: { type: "offer", sdp } },
      });
      const description = (await to.next("signal")).data;
      expect(description.kind).toBe("description");
      const received = description.kind === "description" ? description.description.sdp! : "";
      expect(received).not.toMatch(/192\.168\.0\.10|203\.0\.113\.7|198\.51\.100\.4/);
      expect(received).toContain("typ relay raddr 0.0.0.0 rport 0");
      expect(received).toContain("c=IN IP4 0.0.0.0");
      expect(received.split("\r\n").filter((l) => l.startsWith("a=candidate"))).toHaveLength(1);
    }
  });
});

describe("cobrança da sala protegida", () => {
  it("debita da dona minuto a minuto e todos recebem o tempo que o saldo cobre", async () => {
    const clock = useClock();
    const { code, owner, ownerClient, people } = await protectedRoom(1000, 1);
    // Ao entrar, o tempo que o saldo cobre.
    const first = await people[0]!.client.next("protected.meter");
    expect(first).toEqual({
      type: "protected.meter",
      state: "ok",
      remainingMs: (1000 * 3_600_000) / PROTECTED_ROOM_GOLD_PER_HOUR,
      goldPerHour: PROTECTED_ROOM_GOLD_PER_HOUR,
    });
    await ownerClient.next("protected.meter");

    for (let minute = 1; minute <= 6; minute++) {
      clock.advance(METER_INTERVAL_MS);
      expect(await runAlarm(code)).toBe(true);
      const meter = await people[0]!.client.next("protected.meter");
      const wallet = await expectConsistent(owner.userId);
      expect(wallet.gold).toBe(1000 - goldFor(minute));
      expect(meter.state).toBe("ok");
      await ownerClient.next("protected.meter");
    }
    const debits = (await ledgerRows(owner.userId)).filter((r) => r.reason === "protected_room");
    expect(debits.reduce((sum, r) => sum - r.amount, 0)).toBe(goldFor(6));
  });

  it("avisa com 10 e com 2 minutos de saldo", async () => {
    const clock = useClock();
    const { code, ownerClient } = await protectedRoom(90, 0);
    await ownerClient.next("protected.meter");

    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    const tenMinutes = await ownerClient.next("protected.meter");
    expect(tenMinutes.state).toBe("warning");
    expect(tenMinutes.remainingMs).toBeLessThanOrEqual(10 * 60_000);
    expect(tenMinutes.remainingMs).toBeGreaterThan(2 * 60_000);
    expect((await storageGet<{ warned: number[] }>(code, "pmeter"))?.warned).toEqual([10]);

    let last = tenMinutes;
    while (last.remainingMs > 2 * 60_000) {
      clock.advance(METER_INTERVAL_MS);
      await runAlarm(code);
      last = await ownerClient.next("protected.meter");
    }
    expect(last.state).toBe("warning");
    expect((await storageGet<{ warned: number[] }>(code, "pmeter"))?.warned).toEqual([10, 2]);
  });

  it("saldo zerado: tolerância e, sem recarga, a sala encerra para todos (sem saldo negativo)", async () => {
    const clock = useClock();
    const { code, owner, ownerClient, people } = await protectedRoom(10, 1);
    const other = people[0]!.client;

    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code); // 8 de ouro: sobra 2.
    clock.advance(METER_INTERVAL_MS);
    const graceStart = clock.now;
    await runAlarm(code); // Não cobre o minuto: zera e começa a tolerância.
    await settle();
    const grace = other.messages.filter((m) => m.type === "protected.meter").at(-1);
    expect(grace).toMatchObject({
      state: "grace",
      remainingMs: 0,
      graceEndsAt: graceStart + PROTECTED_ROOM_GRACE_MS,
    });
    expect((await expectConsistent(owner.userId)).gold).toBe(0);

    // Ainda dentro da tolerância: a sala segue.
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    expect(other.closeCode).toBeNull();
    clock.advance(PROTECTED_ROOM_GRACE_MS - METER_INTERVAL_MS);
    await runAlarm(code);
    expect(await other.next("room.ended")).toEqual({ type: "room.ended", reason: "no_gold" });
    expect(await other.closed()).toBe(WS_CLOSE.roomEnded);
    expect(await ownerClient.closed()).toBe(WS_CLOSE.roomEnded);
    expect((await roomInfoWith(code)).status).toBe("ended");
    const wallet = await expectConsistent(owner.userId);
    expect(wallet.gold).toBe(0);
  });

  it("recarga dentro da tolerância: volta ao normal no tique seguinte e continua", async () => {
    const clock = useClock();
    const { code, owner, people } = await protectedRoom(5, 1);
    const other = people[0]!.client;
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    await settle();
    expect(other.messages.filter((m) => m.type === "protected.meter").at(-1)?.state).toBe("grace");

    await grant(owner.userId, 1000);
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    await settle();
    expect(other.messages.filter((m) => m.type === "protected.meter").at(-1)?.state).toBe("ok");
    clock.advance(PROTECTED_ROOM_GRACE_MS * 2);
    await runAlarm(code);
    expect(other.closeCode).toBeNull();
    expect((await roomInfoWith(code)).status).toBe("open");
    await expectConsistent(owner.userId);
  });

  it("a dona perde o Plus: a sala encerra (nunca vira sala direta)", async () => {
    const clock = useClock();
    const { code, owner, people } = await protectedRoom(1000, 1);
    plusUsers.delete(owner.userId);
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    await people[0]!.client.next("room.ended");
    expect(await people[0]!.client.closed()).toBe(WS_CLOSE.roomEnded);
  });

  it("sala vazia não cobra", async () => {
    const clock = useClock();
    const { code, owner, ownerClient } = await protectedRoom(1000, 0);
    clock.advance(30_000);
    ownerClient.close();
    await vi.waitFor(async () => expect((await roomInfoWith(code)).participants).toBe(0));
    await settle();
    // Meio minuto com gente: 4 de ouro.
    expect((await expectConsistent(owner.userId)).gold).toBe(1000 - goldFor(0.5));
    clock.advance(30 * METER_INTERVAL_MS);
    expect((await expectConsistent(owner.userId)).gold).toBe(1000 - goldFor(0.5));
  });

  it("dentro da sala protegida a retransmissão não bloqueia nem cobra por par", async () => {
    const clock = useClock();
    const { code, owner, ownerClient, people } = await protectedRoom(1000, 1);
    const other = people[0]!;
    other.client.send({ type: "video.request", requestId: "v", kind: "camera" });
    const videoId = (await other.client.next("video.granted")).video.id;
    ownerClient.send({ type: "peer.relay", peer: other.guest.participantId, relayed: true });
    ownerClient.send({ type: "video.watch", videoId });
    expect((await ownerClient.next("video.watch.state")).state).toBe("watching");
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    const reasons = (await ledgerRows(owner.userId)).map((r) => r.reason);
    expect(reasons).not.toContain("relay_video");
    expect(other.client.messages.filter((m) => m.type === "relay.meter")).toEqual([]);
  });
});

describe("sala de link fixo protegida", () => {
  function patchMe(user: TestUser, body: unknown) {
    return accountRequest("/api/me", { method: "PATCH", cookie: user.cookie, body });
  }

  it("só Plus liga; só com a sala vazia; abre protegida com retransmissão e ouro", async () => {
    const free = await createTestUser();
    expect(await errorOf(await patchMe(free, { fixedRoomProtected: true }))).toBe("plus_required");

    const owner = await plusOwner(1000);
    const key = `@${owner.handle}`;
    // Ocupada como sala direta: não muda de tipo.
    const guest = await joinWith(key, { nickname: "Ana" });
    const { client } = await connectWith(key, guest);
    const busy = await patchMe(owner, { fixedRoomProtected: true });
    expect(busy.status).toBe(409);
    expect(await errorOf(busy)).toBe("room_in_use");
    client.close();
    await vi.waitFor(async () => expect((await roomInfoWith(key)).participants).toBe(0));

    const ok = await patchMe(owner, { fixedRoomProtected: true });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { fixedRoomProtected: boolean }).fixedRoomProtected).toBe(true);
    expect(await roomInfoWith(key)).toMatchObject({
      status: "open",
      protected: true,
      capacity: PROTECTED_ROOM_MAX_PEOPLE,
    });
    const again = await joinWith(key, { nickname: "Ana" });
    const { welcome } = await connectWith(key, again);
    expect(welcome.room).toMatchObject({
      fixed: true,
      protected: true,
      maxVideos: PROTECTED_ROOM_MAX_VIDEOS,
    });
  });

  it("sem retransmissão ou sem ouro, a sala fixa protegida não abre", async () => {
    const owner = await plusOwner(0);
    const key = `@${owner.handle}`;
    expect((await patchMe(owner, { fixedRoomProtected: true })).status).toBe(200);
    expect((await roomInfoWith(key)).status).toBe("ended");
    await grant(owner.userId, 100);
    expect((await roomInfoWith(key, {})).status).toBe("ended");
    expect((await roomInfoWith(key, TURN_ENV)).status).toBe("open");
  });
});
