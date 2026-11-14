/**
 * Entrega 4 no cliente da sala: vídeo sob demanda, retransmissão, sala protegida, moderador e
 * limites de frequência.
 */
import {
  AUTO_WATCH_MAX_PEOPLE,
  MIC_RATE_WINDOW_MS,
  PROTECTED_ROOM_MAX_PEOPLE,
  PROTECTED_ROOM_MAX_VIDEOS,
  RELAY_SCREEN_AUDIO_MAX_BITRATE,
  WATCHED_VIDEOS_PER_PERSON,
} from "@sualive/config";
import type { Participant, RoomSettings, SelfLimits, ServerMessage } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECONNECT_BASE_DELAY_MS, RoomClient } from "./client";
import {
  CODE,
  createHarness,
  fakeStream,
  OWNER_TOKEN,
  participant,
  welcomeDefaults,
  type Harness,
} from "./testing/fakes";
import { createRoomWith } from "./use-room";

const flush = () => vi.advanceTimersByTimeAsync(0);

let h: Harness;
let client: RoomClient;

const state = () => client.getSnapshot();
const video = (id: string) => state().videos.find((candidate) => candidate.id === id);
const watchRequests = () => h.socket.sentOfType("video.watch").map((message) => message.videoId);

interface ConnectOptions {
  others?: Participant[];
  self?: Participant;
  room?: Partial<RoomSettings>;
  limits?: Partial<SelfLimits>;
}

function welcome({ others = [participant("bob")], self = participant("me"), room, limits }: ConnectOptions) {
  h.socket.receive({
    type: "welcome",
    self: self.id,
    participants: [self, ...others],
    chat: [],
    room: { ...welcomeDefaults.room, ...room },
    limits: { ...welcomeDefaults.limits, ...limits },
  });
}

/** Leva a pessoa até `connected`. */
async function connect(options: ConnectOptions = {}) {
  client = new RoomClient(CODE, h.deps);
  client.retain();
  await flush();
  await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
  h.socket.accept();
  welcome(options);
  await flush();
}

/** Derruba a conexão e volta com um `welcome` novo. */
async function reconnect(options: ConnectOptions) {
  h.socket.serverClose(1006);
  await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
  h.socket.accept();
  welcome(options);
  await flush();
}

/** `count` outras pessoas (`p1`, `p2`…); as primeiras `withVideo` com uma câmera (`v1`, `v2`…). */
function others(count: number, withVideo = 0): Participant[] {
  return Array.from({ length: count }, (_, index) =>
    participant(`p${index + 1}`, {
      videos: index < withVideo ? [{ id: `v${index + 1}`, kind: "camera" }] : [],
    }),
  );
}

function announce(ownerId: string, videoId: string) {
  h.socket.receive({
    type: "participant.updated",
    participant: participant(ownerId, { videos: [{ id: videoId, kind: "camera" }] }),
  });
}

function watchState(
  videoId: string,
  watch: "watching" | "blocked" | "denied" | "stopped",
  reason?: "watch_limit" | "not_found" | "relay_no_plus" | "relay_no_gold",
) {
  h.socket.receive({ type: "video.watch.state", videoId, state: watch, ...(reason ? { reason } : {}) });
}

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
});

afterEach(() => {
  client?.dispose();
  vi.useRealTimers();
});

describe("vídeo sob demanda: abertura automática", () => {
  it("com 7 ou mais pessoas, vídeo anunciado fica em cartão", async () => {
    // 1 + 6 = 7 pessoas; p1 já transmite ao entrar.
    await connect({ others: others(AUTO_WATCH_MAX_PEOPLE, 1) });
    expect(watchRequests()).toEqual([]);
    announce("p2", "v2");
    expect(watchRequests()).toEqual([]);
    expect(video("v1")).toMatchObject({ watch: "idle", stream: null, blockedReason: null });
    expect(video("v2")?.watch).toBe("idle");
    expect(state().watchedCount).toBe(0);
    expect(state().featuredVideoId).toBeNull();
  });

  it("com até 6 pessoas, abre sozinho ao entrar e quando aparece, até o limite de 4", async () => {
    // 1 + 5 = 6 pessoas, todas as outras transmitindo: só os 4 primeiros são pedidos.
    await connect({ others: others(AUTO_WATCH_MAX_PEOPLE - 1, AUTO_WATCH_MAX_PEOPLE - 1) });
    expect(watchRequests()).toEqual(["v1", "v2", "v3", "v4"]);
    expect(state().watchedCount).toBe(WATCHED_VIDEOS_PER_PERSON);
    expect(state().maxWatchedVideos).toBe(WATCHED_VIDEOS_PER_PERSON);
    expect(video("v1")?.watch).toBe("requesting");
    expect(video("v5")?.watch).toBe("idle");
    // Libera um lugar; o próximo vídeo novo abre sozinho.
    watchState("v1", "stopped");
    announce("p1", "v6");
    expect(watchRequests()).toEqual(["v1", "v2", "v3", "v4", "v6"]);
  });

  it("o que já estava aberto continua quando a sala passa de 6", async () => {
    await connect({ others: others(2, 1) });
    watchState("v1", "watching");
    for (let index = 3; index <= 6; index += 1) {
      h.socket.receive({ type: "participant.joined", participant: participant(`p${index}`) });
    }
    expect(state().participants).toHaveLength(7);
    announce("p2", "v2");
    expect(watchRequests()).toEqual(["v1"]);
    expect(video("v1")?.watch).toBe("watching");
    expect(video("v2")?.watch).toBe("idle");
  });
});

describe("vídeo sob demanda: assistir e parar", () => {
  it("watchVideo → requesting → watching, e o stream chega", async () => {
    await connect({ others: others(7, 1) });
    client.actions.watchVideo("v1");
    expect(watchRequests()).toEqual(["v1"]);
    expect(video("v1")?.watch).toBe("requesting");
    expect(state().watchedCount).toBe(1);

    watchState("v1", "watching");
    expect(video("v1")).toMatchObject({ watch: "watching", stream: null });
    const stream = fakeStream("v1");
    h.media.emit("remoteVideoAdded", { peerId: "p1", videoId: "v1", stream });
    expect(video("v1")?.stream).toBe(stream);
    expect(state().featuredVideoId).toBe("v1");
    // Pedir de novo não reenvia.
    client.actions.watchVideo("v1");
    expect(watchRequests()).toEqual(["v1"]);
  });

  it("recusa por limite vira aviso e volta a idle", async () => {
    await connect({ others: others(7, 1) });
    client.actions.watchVideo("v1");
    watchState("v1", "denied", "watch_limit");
    expect(state().notice).toEqual({ kind: "watchLimit" });
    expect(video("v1")?.watch).toBe("idle");
    expect(state().watchedCount).toBe(0);
  });

  it("no limite, watchVideo nem pede: mostra o aviso", async () => {
    await connect({ others: others(7, 5), limits: { watchedVideos: 2 } });
    client.actions.watchVideo("v1");
    client.actions.watchVideo("v2");
    client.actions.watchVideo("v3");
    expect(watchRequests()).toEqual(["v1", "v2"]);
    expect(state().notice).toEqual({ kind: "watchLimit" });
    expect(video("v3")?.watch).toBe("idle");
  });

  it("recusa de um pedido automático não vira aviso", async () => {
    await connect({ others: others(2, 1) });
    watchState("v1", "denied", "watch_limit");
    expect(state().notice).toBeNull();
    expect(video("v1")?.watch).toBe("idle");
  });

  it("blocked mostra o motivo e volta a watching sozinho", async () => {
    await connect({ others: others(2, 1) });
    h.media.emit("remoteVideoAdded", { peerId: "p1", videoId: "v1", stream: fakeStream() });
    watchState("v1", "blocked", "relay_no_gold");
    expect(video("v1")).toMatchObject({ watch: "blocked", blockedReason: "relay_no_gold", stream: null });
    expect(state().watchedCount).toBe(1);
    expect(state().featuredVideoId).toBeNull();
    watchState("v1", "blocked", "relay_no_plus");
    expect(video("v1")?.blockedReason).toBe("relay_no_plus");
    watchState("v1", "watching");
    expect(video("v1")).toMatchObject({ watch: "watching", blockedReason: null });
    expect(video("v1")?.stream).not.toBeNull();
  });

  it("parar de assistir a pedido: idle na hora e não reabre sozinho", async () => {
    await connect({ others: others(2, 1) });
    watchState("v1", "watching");
    client.actions.setFeaturedVideo("v1");
    client.actions.unwatchVideo("v1");
    expect(h.socket.sentOfType("video.unwatch")).toEqual([{ type: "video.unwatch", videoId: "v1" }]);
    expect(video("v1")).toMatchObject({ watch: "idle", stream: null });
    expect(state().featuredVideoId).toBeNull();
    watchState("v1", "stopped");
    h.socket.receive({ type: "participant.joined", participant: participant("p9") });
    expect(watchRequests()).toEqual(["v1"]);
    // Pedir de propósito volta a valer.
    client.actions.watchVideo("v1");
    expect(watchRequests()).toEqual(["v1", "v1"]);
  });

  it("vídeo que acaba e saída de quem transmite tiram o vídeo e liberam o lugar", async () => {
    await connect({ others: others(2, 2) });
    watchState("v1", "watching");
    watchState("v2", "watching");
    expect(state().watchedCount).toBe(2);

    h.socket.receive({ type: "participant.updated", participant: participant("p1") });
    watchState("v1", "stopped", "not_found");
    expect(video("v1")).toBeUndefined();
    expect(state().watchedCount).toBe(1);

    h.socket.receive({ type: "participant.left", id: "p2", reason: "left" });
    expect(state().videos).toEqual([]);
    expect(state().watchedCount).toBe(0);
    // Estado de um vídeo que não existe mais é ignorado.
    watchState("v2", "watching");
    expect(state().watchedCount).toBe(0);
  });

  it("stopped do servidor (sem pedido) volta a idle", async () => {
    await connect({ others: others(2, 1) });
    watchState("v1", "watching");
    watchState("v1", "stopped");
    expect(video("v1")?.watch).toBe("idle");
  });
});

describe("vídeo sob demanda: reconexão", () => {
  it("sala pequena: pede de novo tudo, menos o que a pessoa parou de propósito", async () => {
    const people = others(2, 2);
    await connect({ others: people });
    watchState("v1", "watching");
    watchState("v2", "watching");
    client.actions.unwatchVideo("v2");

    // `watchRequests` lê o WebSocket novo.
    await reconnect({ others: people });
    expect(state().phase).toBe("connected");
    expect(watchRequests()).toEqual(["v1"]);
    expect(video("v1")?.watch).toBe("requesting");
    expect(video("v2")?.watch).toBe("idle");
  });

  it("sala grande: pede de novo só o que a pessoa assistia antes da queda", async () => {
    const people = others(7, 3);
    await connect({ others: people });
    client.actions.watchVideo("v2");
    watchState("v2", "watching");

    await reconnect({ others: people });
    expect(h.socket.sentOfType("video.watch").map((message) => message.videoId)).toEqual(["v2"]);
    expect(video("v2")?.watch).toBe("requesting");
    expect(video("v1")?.watch).toBe("idle");
  });
});

describe("quem transmite", () => {
  async function publishOwn(videoId = "mine") {
    const starting = client.actions.startVideo("camera");
    const request = h.socket.sentOfType("video.request").at(-1);
    h.socket.receive({
      type: "video.granted",
      requestId: request?.requestId ?? "",
      video: { id: videoId, kind: "camera" },
    });
    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { videos: [{ id: videoId, kind: "camera" }] }),
    });
    await starting;
  }

  it("video.viewers abre o envio só para a lista e mostra os bloqueados (sem Plus)", async () => {
    await connect({ others: others(3) });
    await publishOwn();
    expect(video("mine")).toMatchObject({ watch: "local", viewers: [], blockedViewers: [] });

    h.socket.receive({ type: "video.viewers", videoId: "mine", viewers: ["p1", "p2"], blocked: ["p3"] });
    expect(h.media.setVideoViewers).toHaveBeenLastCalledWith("mine", ["p1", "p2"]);
    expect(video("mine")).toMatchObject({
      viewers: ["p1", "p2"],
      blockedViewers: [{ participantId: "p3", reason: "relay_no_plus" }],
    });

    h.socket.receive({ type: "video.viewers", videoId: "mine", viewers: [], blocked: [] });
    expect(h.media.viewers.get("mine")).toEqual([]);
    expect(video("mine")?.viewers).toEqual([]);
  });

  it("com Plus, o bloqueio é por falta de ouro", async () => {
    await connect({ others: others(1), limits: { relayVideo: true } });
    await publishOwn();
    h.socket.receive({ type: "video.viewers", videoId: "mine", viewers: [], blocked: ["p1"] });
    expect(video("mine")?.blockedViewers).toEqual([{ participantId: "p1", reason: "relay_no_gold" }]);
  });

  it("a lista pode chegar antes da captura terminar", async () => {
    await connect({ others: others(1) });
    h.socket.receive({ type: "video.viewers", videoId: "mine", viewers: ["p1"], blocked: [] });
    expect(h.media.setVideoViewers).toHaveBeenCalledWith("mine", ["p1"]);
  });

  it("relay.meter vira estado", async () => {
    await connect();
    expect(state().relayMeter).toBeNull();
    h.socket.receive({ type: "relay.meter", pairs: 2, goldPerHour: 90, state: "paying" });
    expect(state().relayMeter).toEqual({ pairs: 2, goldPerHour: 90, state: "paying" });
    h.socket.receive({ type: "relay.meter", pairs: 0, goldPerHour: 0, state: "no_gold" });
    expect(state().relayMeter?.state).toBe("no_gold");
    client.actions.leave();
    expect(state().relayMeter).toBeNull();
  });
});

describe("retransmissão", () => {
  it("peer.relay sai a cada mudança e é reenviado depois de cada welcome", async () => {
    await connect({ others: others(2) });
    h.media.emit("peer", { peerId: "p1", state: "connected", relayed: false });
    expect(h.socket.sentOfType("peer.relay")).toEqual([]);
    h.media.emit("peer", { peerId: "p1", state: "connected", relayed: true });
    h.media.emit("peer", { peerId: "p1", state: "reconnecting", relayed: true });
    h.media.emit("peer", { peerId: "p2", state: "connected", relayed: true });
    h.media.emit("peer", { peerId: "p1", state: "connected", relayed: false });
    expect(h.socket.sentOfType("peer.relay")).toEqual([
      { type: "peer.relay", peer: "p1", relayed: true },
      { type: "peer.relay", peer: "p2", relayed: true },
      { type: "peer.relay", peer: "p1", relayed: false },
    ]);

    await reconnect({ others: others(2) });
    expect(h.socket.sentOfType("peer.relay")).toEqual([
      { type: "peer.relay", peer: "p1", relayed: false },
      { type: "peer.relay", peer: "p2", relayed: true },
    ]);
  });

  it("a mídia nasce com os tetos da retransmissão e sem modo só retransmissão na sala direta", async () => {
    await connect();
    expect(h.media.options.relayScreenAudioMaxBitrate).toBe(RELAY_SCREEN_AUDIO_MAX_BITRATE);
    expect(h.media.options.relayOnly).toBe(false);
  });
});

describe("sala protegida", () => {
  const protectedRoom = {
    protected: true,
    capacity: PROTECTED_ROOM_MAX_PEOPLE,
    maxVideos: PROTECTED_ROOM_MAX_VIDEOS,
  };

  it("o lobby já sabe que é protegida e a lotação", async () => {
    h.server.room({
      status: "open",
      participants: 2,
      capacity: PROTECTED_ROOM_MAX_PEOPLE,
      fixed: false,
      protected: true,
    });
    client = new RoomClient(CODE, h.deps);
    client.retain();
    await flush();
    expect(state().protected).toBe(true);
    expect(state().occupancy).toEqual({ participants: 2, capacity: PROTECTED_ROOM_MAX_PEOPLE });
  });

  it("mídia só por retransmissão, lotação e teto de vídeos da sala", async () => {
    await connect({ room: protectedRoom });
    expect(h.media.options.relayOnly).toBe(true);
    expect(state()).toMatchObject({
      protected: true,
      maxVideos: PROTECTED_ROOM_MAX_VIDEOS,
      occupancy: { participants: 2, capacity: PROTECTED_ROOM_MAX_PEOPLE },
    });
  });

  it("ICE só de retransmissão numa sessão que nasceu sem: não conecta assim e recria", async () => {
    h.server.on("GET", `/api/rooms/${CODE}/ice`, () => ({
      status: 200,
      body: { iceServers: [{ urls: "turn:turn.test" }], ttlSeconds: 60, relayOnly: true },
    }));
    await connect();
    const first = h.media;
    await expect(first.options.getIceServers()).rejects.toThrow();
    await flush();
    expect(first.closed).toBe(true);
    expect(h.medias).toHaveLength(2);
    expect(h.media.options.relayOnly).toBe(true);
    expect(h.media.peers).toEqual(["bob"]);
    expect(await h.media.options.getIceServers()).toEqual([{ urls: "turn:turn.test" }]);
    expect(h.reports.map((report) => report.message)).toContain(
      "room: relay-only ice for a session without it",
    );
  });

  it("protected.meter vira estado e room.ended por falta de ouro tem causa própria", async () => {
    await connect({ room: protectedRoom });
    h.socket.receive({ type: "protected.meter", state: "ok", remainingMs: 3_600_000, goldPerHour: 500 });
    expect(state().protectedMeter).toEqual({
      state: "ok",
      remainingMs: 3_600_000,
      goldPerHour: 500,
      graceEndsAt: null,
    });
    h.socket.receive({
      type: "protected.meter",
      state: "grace",
      remainingMs: 0,
      goldPerHour: 500,
      graceEndsAt: 1_234,
    });
    expect(state().protectedMeter).toMatchObject({ state: "grace", graceEndsAt: 1_234 });

    h.socket.receive({ type: "room.ended", reason: "no_gold" });
    expect(state().phase).toBe("ended");
    expect(state().endReason).toBe("no_gold");
    expect(state().protectedMeter).toBeNull();
  });

  it("room.ended sem motivo não tem causa", async () => {
    await connect();
    h.socket.receive({ type: "room.ended" });
    expect(state()).toMatchObject({ phase: "ended", endReason: null });
  });

  it("video.denied por teto da sala vira aviso", async () => {
    await connect({ room: protectedRoom });
    const starting = client.actions.startVideo("camera");
    const [request] = h.socket.sentOfType("video.request");
    h.socket.receive({ type: "video.denied", requestId: request?.requestId ?? "", reason: "room_limit" });
    await starting;
    expect(state().notice).toEqual({ kind: "videoRoomLimit" });
  });
});

describe("createRoom", () => {
  it("protegida manda o pedido e guarda o token de dono", async () => {
    h.server.on("POST", "/api/rooms", () => ({ status: 200, body: { code: CODE, ownerToken: OWNER_TOKEN } }));
    const createRoom = createRoomWith(() => h.deps);
    expect(await createRoom("tok", { protected: true })).toEqual({ ok: true, code: CODE });
    expect(h.server.callsTo("POST", "/api/rooms")[0]?.body).toEqual({
      turnstileToken: "tok",
      protected: true,
    });
    expect(h.storage.map.size).toBe(1);
    await createRoom("tok", { protected: false });
    expect(h.server.callsTo("POST", "/api/rooms")[1]?.body).toEqual({ turnstileToken: "tok" });
  });

  it.each([
    [403, "plus_required", "plusRequired"],
    [402, "insufficient_funds", "insufficientFunds"],
    [503, "protected_unavailable", "protectedUnavailable"],
    [401, "unauthorized", "unauthorized"],
    [403, "onboarding_required", "unauthorized"],
    [500, "internal_error", "error"],
  ] as const)("erro %i %s vira %s", async (status, error, reason) => {
    h.server.on("POST", "/api/rooms", () => ({ status, body: { error } }));
    const createRoom = createRoomWith(() => h.deps);
    expect(await createRoom("tok", { protected: true })).toEqual({ ok: false, reason });
  });
});

describe("moderador", () => {
  it("o papel aparece na lista e para a própria pessoa", async () => {
    await connect({ others: [participant("bob", { isModerator: true })] });
    expect(state().isModerator).toBe(false);
    expect(state().participants.find((p) => p.id === "bob")?.isModerator).toBe(true);
    h.socket.receive({ type: "participant.updated", participant: participant("me", { isModerator: true }) });
    expect(state().isModerator).toBe(true);
    client.actions.leave();
    expect(state().isModerator).toBe(false);
  });

  it("setModerator só sai para o dono, nunca para si nem para o dono", async () => {
    await connect({ others: [participant("bob"), participant("owner", { isOwner: true })] });
    client.actions.setModerator("bob", true);
    expect(h.socket.sentOfType("moderator.set")).toEqual([]);

    h.socket.receive({ type: "participant.updated", participant: participant("me", { isOwner: true }) });
    client.actions.setModerator("bob", true);
    client.actions.setModerator("bob", false);
    client.actions.setModerator("me", true);
    client.actions.setModerator("owner", true);
    client.actions.setModerator("ghost", true);
    expect(h.socket.sentOfType("moderator.set")).toEqual([
      { type: "moderator.set", target: "bob", moderator: true },
      { type: "moderator.set", target: "bob", moderator: false },
    ]);
  });

  it("moderador modera participantes comuns, nunca o dono nem outro moderador", async () => {
    await connect({
      self: participant("me", { isModerator: true }),
      others: [
        participant("bob"),
        participant("owner", { isOwner: true }),
        participant("mod", { isModerator: true }),
      ],
    });
    client.actions.moderate("mute", "bob");
    client.actions.moderate("kick", "owner");
    client.actions.moderate("ban", "mod");
    client.actions.moderate("kick", "me");
    expect(h.socket.sentOfType("moderate")).toEqual([{ type: "moderate", action: "mute", target: "bob" }]);
  });

  it("o dono modera também moderadores", async () => {
    await connect({
      self: participant("me", { isOwner: true }),
      others: [participant("mod", { isModerator: true })],
    });
    client.actions.moderate("kick", "mod");
    expect(h.socket.sentOfType("moderate")).toEqual([{ type: "moderate", action: "kick", target: "mod" }]);
  });
});

describe("limites de frequência", () => {
  const rateLimited: ServerMessage = { type: "error", code: "rate_limited" };

  it("reação recusada mostra o aviso genérico", async () => {
    await connect();
    client.actions.react("👍");
    h.socket.receive(rateLimited);
    expect(state().notice).toEqual({ kind: "rateLimited" });
  });

  it("o do chat continua próprio", async () => {
    await connect();
    client.actions.react("👍");
    client.actions.sendChat("oi");
    h.socket.receive(rateLimited);
    expect(state().notice).toEqual({ kind: "chatRateLimited" });
  });

  it("mão recusada volta ao que era", async () => {
    await connect();
    client.actions.setHandRaised(true);
    expect(state().handRaised).toBe(true);
    h.socket.receive(rateLimited);
    expect(state().handRaised).toBe(false);
    expect(state().participants[0]?.handRaised).toBe(false);
    expect(state().notice).toEqual({ kind: "rateLimited" });
  });

  it("abrir o microfone recusado fecha de novo", async () => {
    await connect();
    await client.actions.setMicMuted(false);
    h.socket.receive(rateLimited);
    expect(h.media.setMicrophoneMuted).toHaveBeenLastCalledWith(true);
    expect(state().micMuted).toBe(true);
    expect(state().participants[0]?.micMuted).toBe(true);
    expect(state().notice).toEqual({ kind: "rateLimited" });
  });

  it("fechar o microfone recusado continua fechado e corrige a lista depois da janela", async () => {
    await connect();
    await client.actions.setMicMuted(false);
    await client.actions.setMicMuted(true);
    h.socket.receive(rateLimited);
    expect(state().micMuted).toBe(true);
    expect(h.media.setMicrophoneMuted).toHaveBeenLastCalledWith(true);
    expect(state().notice).toEqual({ kind: "rateLimited" });
    const sent = h.socket.sentOfType("mic.set").length;
    await vi.advanceTimersByTimeAsync(MIC_RATE_WINDOW_MS);
    expect(h.socket.sentOfType("mic.set")).toHaveLength(sent + 1);
    expect(h.socket.sentOfType("mic.set").at(-1)).toEqual({ type: "mic.set", muted: true });
  });
});
