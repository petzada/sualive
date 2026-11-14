import { METER_INTERVAL_MS, RELAY_VIDEO_GOLD_PER_HOUR } from "@sualive/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanStatus } from "../src/billing/plan";
import type * as PlanModule from "../src/billing/plan";
import { createTestUser } from "./account";
import { useD1 } from "./d1";
import { connect, createRoom, join, mockOutboundFetch, type Guest, type TestClient } from "./helpers";
import { joinWith, planFor, plusUsers, runAlarm, settle, useClock } from "./room-e4-helpers";
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

type Person = { client: TestClient; id: string; guest?: Guest };

/** Quem transmite (com conta; Plus e ouro a gosto) e quem assiste (sem conta). */
async function setup(options: { plus: boolean; gold?: number; viewers?: number }) {
  const { code } = await createRoom();
  const user = await createTestUser({ nickname: "Transmite" });
  if (options.plus) plusUsers.add(user.userId);
  if (options.gold) await grant(user.userId, options.gold);
  const streamerGuest = await joinWith(code, { cookie: user.cookie }, {});
  const { client, welcome } = await connect(code, streamerGuest);
  const streamer: Person = { client, id: streamerGuest.participantId };
  const viewers: Person[] = [];
  for (let i = 0; i < (options.viewers ?? 1); i++) {
    const guest = await join(code, `Assiste ${i + 1}`);
    const connected = await connect(code, guest);
    viewers.push({ client: connected.client, id: guest.participantId, guest });
  }
  streamer.client.send({ type: "video.request", requestId: "v", kind: "camera" });
  const videoId = (await streamer.client.next("video.granted")).video.id;
  return { code, user, streamer, viewers, videoId, welcome };
}

/** Assiste e marca o par como retransmitido (pelo lado `reporter`). */
async function watchRelayed(
  viewer: Person,
  streamer: Person,
  videoId: string,
  reporter: "viewer" | "streamer",
) {
  viewer.client.send({ type: "video.watch", videoId });
  expect((await viewer.client.next("video.watch.state")).state).toBe("watching");
  await streamer.client.next("video.viewers");
  const from = reporter === "viewer" ? viewer : streamer;
  const peer = reporter === "viewer" ? streamer.id : viewer.id;
  from.client.send({ type: "peer.relay", peer, relayed: true });
}

describe("decisão de vídeo por par retransmitido", () => {
  it("sem Plus: par retransmitido fica bloqueado dos dois lados; deixa de ser retransmitido e volta", async () => {
    const { streamer, viewers, videoId, welcome } = await setup({ plus: false });
    const [viewer] = viewers as [Person];
    expect(welcome.limits.relayVideo).toBe(false);

    await watchRelayed(viewer, streamer, videoId, "viewer");
    expect(await viewer.client.next("video.watch.state")).toEqual({
      type: "video.watch.state",
      videoId,
      state: "blocked",
      reason: "relay_no_plus",
    });
    expect(await streamer.client.next("video.viewers")).toEqual({
      type: "video.viewers",
      videoId,
      viewers: [],
      blocked: [viewer.id],
    });

    // A outra ponta também diz que sim: nada muda. Quando as duas dizem que não, volta.
    streamer.client.send({ type: "peer.relay", peer: viewer.id, relayed: true });
    await viewer.client.expectNone("video.watch.state");
    viewer.client.send({ type: "peer.relay", peer: streamer.id, relayed: false });
    await viewer.client.expectNone("video.watch.state");
    streamer.client.send({ type: "peer.relay", peer: viewer.id, relayed: false });
    expect((await viewer.client.next("video.watch.state")).state).toBe("watching");
    expect(await streamer.client.next("video.viewers")).toMatchObject({ viewers: [viewer.id], blocked: [] });
  });

  it("Plus sem ouro: bloqueado com relay_no_gold; o ouro chega e volta sozinho no tique", async () => {
    const clock = useClock();
    const { code, streamer, viewers, videoId, welcome, user } = await setup({ plus: true });
    const [viewer] = viewers as [Person];
    expect(welcome.limits.relayVideo).toBe(true);

    await watchRelayed(viewer, streamer, videoId, "streamer");
    expect(await viewer.client.next("video.watch.state")).toMatchObject({
      state: "blocked",
      reason: "relay_no_gold",
    });
    expect(await streamer.client.next("video.viewers")).toMatchObject({ viewers: [], blocked: [viewer.id] });

    await grant(user.userId, 100);
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    expect((await viewer.client.next("video.watch.state")).state).toBe("watching");
    expect(await streamer.client.next("video.viewers")).toMatchObject({ viewers: [viewer.id], blocked: [] });
    expect(await streamer.client.next("relay.meter")).toEqual({
      type: "relay.meter",
      pairs: 1,
      goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR,
      state: "paying",
    });
  });

  it("Plus com ouro: vídeo liberado e o débito bate com os minutos e os pares", async () => {
    const clock = useClock();
    const { code, streamer, viewers, videoId, user } = await setup({ plus: true, gold: 100, viewers: 2 });
    for (const viewer of viewers) await watchRelayed(viewer, streamer, videoId, "viewer");
    await settle();
    // Nenhum bloqueio: os dois seguem assistindo.
    for (const viewer of viewers) await viewer.client.expectNone("video.watch.state");
    expect((await streamer.client.next("relay.meter")).pairs).toBe(1);
    expect((await streamer.client.next("relay.meter")).pairs).toBe(2);

    // 2 pares × 4 minutos × 45 de ouro por hora = 6 de ouro.
    for (let minute = 0; minute < 4; minute++) {
      clock.advance(METER_INTERVAL_MS);
      expect(await runAlarm(code)).toBe(true);
    }
    const debits = (await ledgerRows(user.userId)).filter((row) => row.reason === "relay_video");
    expect(debits.reduce((sum, row) => sum - row.amount, 0)).toBe((RELAY_VIDEO_GOLD_PER_HOUR * 2 * 4) / 60);
    expect(new Set(debits.map((row) => row.reference)).size).toBe(debits.length);
    const wallet = await expectConsistent(user.userId);
    expect(wallet.gold).toBe(100 - 6);
    const meter = streamer.client.messages.filter((m) => m.type === "relay.meter");
    expect(meter.at(-1)).toMatchObject({ state: "paying", pairs: 2 });
  });

  it("o par que deixa de ser retransmitido para de ser cobrado", async () => {
    const clock = useClock();
    const { code, streamer, viewers, videoId, user } = await setup({ plus: true, gold: 100 });
    const [viewer] = viewers as [Person];
    await watchRelayed(viewer, streamer, videoId, "viewer");
    expect((await streamer.client.next("relay.meter")).pairs).toBe(1);

    // 40 minutos pagos: 30 de ouro.
    clock.advance(40 * METER_INTERVAL_MS);
    await runAlarm(code);
    viewer.client.send({ type: "peer.relay", peer: streamer.id, relayed: false });
    await settle();
    const meters = streamer.client.messages.filter((m) => m.type === "relay.meter");
    expect(meters.at(-1)).toMatchObject({ state: "paying", pairs: 0 });
    clock.advance(40 * METER_INTERVAL_MS);
    await runAlarm(code);
    expect((await expectConsistent(user.userId)).gold).toBe(70);
  });

  it("o ouro acaba no meio: os pares pagos passam a bloqueados e quem transmite é avisado", async () => {
    const clock = useClock();
    const { code, streamer, viewers, videoId, user } = await setup({ plus: true, gold: 1, viewers: 2 });
    for (const viewer of viewers) await watchRelayed(viewer, streamer, videoId, "viewer");
    await settle();

    // 2 pares × 1 minuto = 1,5 de ouro: cobra o 1 que há e o saldo zera.
    clock.advance(METER_INTERVAL_MS);
    await runAlarm(code);
    for (const viewer of viewers) {
      expect(await viewer.client.next("video.watch.state")).toMatchObject({
        state: "blocked",
        reason: "relay_no_gold",
      });
    }
    const last = streamer.client.messages.filter((m) => m.type === "relay.meter").at(-1);
    expect(last).toEqual({
      type: "relay.meter",
      pairs: 0,
      goldPerHour: RELAY_VIDEO_GOLD_PER_HOUR,
      state: "no_gold",
    });
    const wallet = await expectConsistent(user.userId);
    expect(wallet.gold).toBe(0);

    // Sem ouro, nada mais é debitado.
    clock.advance(10 * METER_INTERVAL_MS);
    await runAlarm(code);
    expect((await expectConsistent(user.userId)).gold).toBe(0);
  });

  it("sem informação o par não é retransmitido; a saída de uma ponta esquece o par", async () => {
    const { code, streamer, viewers, videoId } = await setup({ plus: false, viewers: 1 });
    const [viewer] = viewers as [Person];
    await watchRelayed(viewer, streamer, videoId, "viewer");
    expect((await viewer.client.next("video.watch.state")).state).toBe("blocked");

    // A mesma pessoa reconecta (outra aba): o par é esquecido e o vídeo volta a ser liberado.
    await streamer.client.next("video.viewers");
    const { client } = await connect(code, viewer.guest!);
    expect(await streamer.client.next("video.viewers")).toMatchObject({ viewers: [], blocked: [] });
    client.send({ type: "video.watch", videoId });
    expect((await client.next("video.watch.state")).state).toBe("watching");
    expect(await streamer.client.next("video.viewers")).toMatchObject({ viewers: [viewer.id], blocked: [] });
  });
});
