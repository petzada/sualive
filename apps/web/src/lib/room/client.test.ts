import { FREE_VIDEO_QUALITY, RELAY_VIDEO_QUALITY } from "@sualive/config";
import { WS_CLOSE, WS_PING_FRAME } from "@sualive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PING_INTERVAL_MS,
  REACTION_LIFETIME_MS,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RoomClient,
  SILENCE_TIMEOUT_MS,
  VIDEO_REQUEST_TIMEOUT_MS,
} from "./client";
import { saveOwnerToken } from "./owner-token";
import {
  CODE,
  createHarness,
  fakeStream,
  ORIGIN,
  OWNER_TOKEN,
  participant,
  type Harness,
} from "./testing/fakes";
import { createRoomWith } from "./use-room";

const flush = () => vi.advanceTimersByTimeAsync(0);

let h: Harness;
let client: RoomClient;

function start(code = CODE): RoomClient {
  client = new RoomClient(code, h.deps);
  client.retain();
  return client;
}

const state = () => client.getSnapshot();

/** Leva a pessoa até `connected`, com `others` já na sala. */
async function connect(others = [participant("bob")], self = participant("me")) {
  start();
  await flush();
  const joining = client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
  await joining;
  h.socket.accept();
  h.socket.receive({ type: "welcome", self: self.id, participants: [self, ...others], chat: [] });
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

describe("entrada", () => {
  it("vai de loading a lobby, joining e connected", async () => {
    start();
    expect(state().phase).toBe("loading");
    expect(state().link).toBe(`${ORIGIN}/s/${CODE}`);
    await flush();
    expect(state().phase).toBe("lobby");
    expect(state().occupancy).toEqual({ participants: 1, capacity: 6 });

    const joining = client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    expect(state().phase).toBe("joining");
    await joining;
    const [join] = h.server.callsTo("POST", `/api/rooms/${CODE}/join`);
    expect(join?.body).toEqual({ nickname: "Ana", turnstileToken: "tok" });
    expect(join?.init?.credentials).toBe("same-origin");
    expect(h.socket.url).toBe(`wss://sualive.test/api/rooms/${CODE}/ws`);

    h.socket.accept();
    expect(h.socket.sent).toEqual([{ type: "hello" }]);
    h.socket.receive({
      type: "welcome",
      self: "me",
      participants: [participant("me"), participant("bob")],
      chat: [{ id: "c1", from: "bob", nickname: "Pessoa bob", text: "oi", sentAt: 1 }],
    });
    await flush();

    expect(state().phase).toBe("connected");
    expect(state().selfId).toBe("me");
    expect(state().participants.map((p) => [p.id, p.isSelf])).toEqual([
      ["me", true],
      ["bob", false],
    ]);
    expect(state().chat).toHaveLength(1);
    expect(state().occupancy.participants).toBe(2);
    expect(state().micMuted).toBe(true);
  });

  it("sala encerrada vai para ended", async () => {
    h.server.room({ status: "ended", participants: 0, capacity: 6 });
    start();
    await flush();
    expect(state().phase).toBe("ended");
  });

  it("código malformado vai para ended sem consultar a API", async () => {
    start("NAO-VALE");
    await flush();
    expect(state().phase).toBe("ended");
    expect(h.server.calls).toHaveLength(0);
  });

  it("resposta fora do esquema vai para error", async () => {
    h.server.room({ status: "talvez" });
    start();
    await flush();
    expect(state().phase).toBe("error");
  });

  it.each([
    [409, "room_full", "full", null],
    [403, "banned", "banned", null],
    [410, "room_ended", "ended", null],
    [403, "turnstile_failed", "lobby", { kind: "turnstileFailed" }],
    [429, "rate_limited", "lobby", { kind: "rateLimited" }],
    [500, "internal_error", "error", null],
  ])("join com %i %s vai para %s", async (status, error, phase, notice) => {
    h.server.joinError(status, error);
    start();
    await flush();
    await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    expect(state().phase).toBe(phase);
    expect(state().notice).toEqual(notice);
    expect(h.sockets).toHaveLength(0);
  });

  it("hello leva o token de dono guardado por createRoom", async () => {
    h.server.on("POST", "/api/rooms", () => ({
      status: 200,
      body: { code: CODE, ownerToken: OWNER_TOKEN },
    }));
    const createRoom = createRoomWith(() => h.deps);
    expect(await createRoom("tok")).toEqual({ ok: true, code: CODE });
    expect(h.server.callsTo("POST", "/api/rooms")[0]?.body).toEqual({ turnstileToken: "tok" });

    await connect([], participant("me", { isOwner: true }));
    expect(h.socket.sent[0]).toEqual({ type: "hello", ownerToken: OWNER_TOKEN });
    expect(state().isOwner).toBe(true);
  });

  it("createRoom mapeia os erros", async () => {
    const createRoom = createRoomWith(() => h.deps);
    h.server.on("POST", "/api/rooms", () => ({ status: 403, body: { error: "turnstile_failed" } }));
    expect(await createRoom("x")).toEqual({ ok: false, reason: "turnstileFailed" });
    h.server.on("POST", "/api/rooms", () => ({ status: 429, body: { error: "rate_limited" } }));
    expect(await createRoom("x")).toEqual({ ok: false, reason: "rateLimited" });
    h.server.on("POST", "/api/rooms", () => ({ status: 200, body: { code: "x" } }));
    expect(await createRoom("x")).toEqual({ ok: false, reason: "error" });
  });

  it("a sala acabar apaga o token de dono", async () => {
    saveOwnerToken(h.storage, CODE, OWNER_TOKEN);
    await connect();
    h.socket.receive({ type: "room.ended" });
    expect(state().phase).toBe("ended");
    expect(h.storage.map.size).toBe(0);
  });
});

describe("prévia", () => {
  it("liga no lobby e para ao entrar", async () => {
    start();
    await flush();
    await client.actions.startPreview();
    const preview = h.previews[0];
    expect(state().preview).toBe(preview);
    await client.actions.join({ nickname: "Ana", turnstileToken: "tok" });
    expect(preview?.stop).toHaveBeenCalledOnce();
    expect(state().preview).toBeNull();
  });

  it("sem microfone gera aviso e continua", async () => {
    h.deps.createDevicePreview = async () => ({
      cameraStream: null,
      hasMicrophone: false,
      onMicrophoneLevel: () => () => undefined,
      stop: () => undefined,
    });
    start();
    await flush();
    await client.actions.startPreview();
    expect(state().notice).toEqual({ kind: "mediaPermissionDenied", device: "microphone" });
    expect(state().phase).toBe("lobby");
  });
});

describe("mídia", () => {
  it("cria a sessão com a qualidade gratuita e o ICE da API", async () => {
    await connect();
    const { options } = h.media;
    expect(options.selfId).toBe("me");
    expect(options.quality).toEqual(FREE_VIDEO_QUALITY);
    expect(options.relayQuality).toEqual(RELAY_VIDEO_QUALITY);
    expect(await options.getIceServers()).toEqual([{ urls: "stun:stun.test" }]);
    expect(h.media.enableMicrophone).toHaveBeenCalledOnce();
    expect(h.media.setMicrophoneMuted).toHaveBeenLastCalledWith(true);
  });

  it("presença chama setPeers sem a própria pessoa", async () => {
    await connect();
    expect(h.media.peers).toEqual(["bob"]);
    h.socket.receive({ type: "participant.joined", participant: participant("carol") });
    expect(h.media.peers).toEqual(["bob", "carol"]);
    h.socket.receive({ type: "participant.left", id: "bob", reason: "left" });
    expect(h.media.peers).toEqual(["carol"]);
    expect(state().participants.map((p) => p.id)).toEqual(["me", "carol"]);
  });

  it("sinalização passa pelo WebSocket nos dois sentidos", async () => {
    await connect();
    const received: unknown[] = [];
    h.media.options.transport.subscribe((from, data) => received.push([from, data]));
    const data = { kind: "candidate" as const, candidate: null };
    h.socket.receive({ type: "signal", from: "bob", data });
    expect(received).toEqual([["bob", data]]);
    h.media.options.transport.send("bob", data);
    expect(h.socket.sentOfType("signal")).toEqual([{ type: "signal", to: "bob", data }]);
  });

  it("junta eventos da mídia ao estado", async () => {
    await connect([participant("bob", { videos: [{ id: "v1", kind: "camera" }] })]);
    const audio = fakeStream("audio-bob");
    const video = fakeStream("video-bob");
    h.media.emit("peer", { peerId: "bob", state: "connected", relayed: true });
    h.media.emit("remoteAudio", "bob", audio);
    h.media.emit("speaking", "bob", true);
    h.media.emit("remoteVideoAdded", { peerId: "bob", videoId: "v1", stream: video });
    const bob = state().participants.find((p) => p.id === "bob");
    expect(bob).toMatchObject({ connection: "connected", relayed: true, speaking: true });
    expect(bob?.audioStream).toBe(audio);
    expect(state().videos).toEqual([
      { id: "v1", kind: "camera", ownerId: "bob", stream: video, isLocal: false },
    ]);
    expect(state().featuredVideoId).toBe("v1");
  });

  it("microfone negado vira aviso e a pessoa fica na sala", async () => {
    const create = h.deps.createMediaSession;
    h.deps.createMediaSession = (options) => {
      const media = create(options);
      media.enableMicrophone = () => Promise.reject(new DOMException("no", "NotAllowedError"));
      return media;
    };
    await connect();
    expect(state().phase).toBe("connected");
    expect(state().notice).toEqual({ kind: "mediaPermissionDenied", device: "microphone" });
    expect(state().micMuted).toBe(true);
  });

  it("setMicMuted liga na mídia e avisa o servidor", async () => {
    await connect();
    await client.actions.setMicMuted(false);
    expect(h.media.setMicrophoneMuted).toHaveBeenLastCalledWith(false);
    expect(h.socket.sentOfType("mic.set")).toEqual([{ type: "mic.set", muted: false }]);
    expect(state().micMuted).toBe(false);
    expect(state().participants[0]?.micMuted).toBe(false);
  });

  it("force.muted silencia e avisa", async () => {
    await connect();
    await client.actions.setMicMuted(false);
    h.socket.receive({ type: "force.muted" });
    expect(h.media.setMicrophoneMuted).toHaveBeenLastCalledWith(true);
    expect(state().micMuted).toBe(true);
    expect(state().notice).toEqual({ kind: "mutedByOwner" });
  });
});

describe("vídeo", () => {
  async function grant(kind: "camera" | "screen", videoId = "v-me") {
    const starting = client.actions.startVideo(kind);
    const request = h.socket.sentOfType("video.request").at(-1);
    expect(request?.kind).toBe(kind);
    h.socket.receive({
      type: "video.granted",
      requestId: request?.requestId ?? "",
      video: { id: videoId, kind },
    });
    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { videos: [{ id: videoId, kind }] }),
    });
    await starting;
  }

  it("autorizado publica e aparece como vídeo local", async () => {
    await connect();
    await grant("camera");
    expect(h.media.publishVideo).toHaveBeenCalledWith("v-me", "camera");
    expect(state().localVideoIds).toEqual(["v-me"]);
    const [video] = state().videos;
    expect(video).toMatchObject({ id: "v-me", isLocal: true, ownerId: "me" });
    expect(video?.stream).not.toBeNull();
  });

  it.each([
    ["room_limit", "videoRoomLimit"],
    ["person_limit", "videoPersonLimit"],
  ] as const)("negado por %s gera o aviso %s", async (reason, kind) => {
    await connect();
    const starting = client.actions.startVideo("camera");
    const [request] = h.socket.sentOfType("video.request");
    h.socket.receive({ type: "video.denied", requestId: request?.requestId ?? "", reason });
    await starting;
    expect(state().notice).toEqual({ kind });
    expect(h.media.publishVideo).not.toHaveBeenCalled();
  });

  it("falha de captura devolve o vídeo ao servidor", async () => {
    await connect();
    h.media.publishVideo.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await grant("camera");
    expect(h.socket.sentOfType("video.stop")).toEqual([{ type: "video.stop", videoId: "v-me" }]);
    expect(state().notice).toEqual({ kind: "mediaPermissionDenied", device: "camera" });
  });

  it("cancelar o seletor de tela devolve o vídeo sem aviso", async () => {
    await connect();
    h.media.publishVideo.mockRejectedValueOnce(new DOMException("cancel", "NotAllowedError"));
    await grant("screen");
    expect(h.socket.sentOfType("video.stop")).toHaveLength(1);
    expect(state().notice).toBeNull();
  });

  it("sem resposta no prazo desiste e devolve autorização atrasada", async () => {
    await connect();
    const starting = client.actions.startVideo("camera");
    const [request] = h.socket.sentOfType("video.request");
    await vi.advanceTimersByTimeAsync(VIDEO_REQUEST_TIMEOUT_MS);
    await starting;
    h.socket.receive({
      type: "video.granted",
      requestId: request?.requestId ?? "",
      video: { id: "late", kind: "camera" },
    });
    expect(h.media.publishVideo).not.toHaveBeenCalled();
    expect(h.socket.sentOfType("video.stop")).toEqual([{ type: "video.stop", videoId: "late" }]);
  });

  it("parar durante a captura não deixa o vídeo publicado", async () => {
    await connect();
    let finishCapture: () => void = () => undefined;
    h.media.publishVideo.mockImplementationOnce(
      (videoId, kind) =>
        new Promise((resolve) => {
          finishCapture = () => resolve({ videoId, kind, stream: fakeStream() });
        }),
    );
    const starting = client.actions.startVideo("camera");
    const request = h.socket.sentOfType("video.request").at(-1);
    h.socket.receive({
      type: "video.granted",
      requestId: request?.requestId ?? "",
      video: { id: "v1", kind: "camera" },
    });
    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { videos: [{ id: "v1", kind: "camera" }] }),
    });
    await flush();
    client.actions.stopVideo("v1");
    finishCapture();
    await starting;
    expect(h.media.unpublishVideo).toHaveBeenCalledTimes(2);
    expect(state().localVideoIds).toEqual([]);
    expect(h.socket.sentOfType("video.stop")).toHaveLength(1);
  });

  it("stopVideo e localVideoEnded despublicam e avisam o servidor", async () => {
    await connect();
    await grant("camera", "v1");
    client.actions.stopVideo("v1");
    expect(h.media.unpublishVideo).toHaveBeenCalledWith("v1");
    expect(h.socket.sentOfType("video.stop")).toEqual([{ type: "video.stop", videoId: "v1" }]);
    expect(state().videos).toEqual([]);

    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { videos: [] }),
    });
    await grant("screen", "v2");
    h.media.emit("localVideoEnded", "v2");
    expect(h.socket.sentOfType("video.stop").at(-1)).toEqual({ type: "video.stop", videoId: "v2" });
    expect(state().localVideoIds).toEqual([]);
  });
});

describe("destaque", () => {
  it("tela antes de câmera, depois o mais antigo; escolha da pessoa vale enquanto existir", async () => {
    await connect([
      participant("bob", { videos: [{ id: "cam-bob", kind: "camera" }] }),
      participant("carol"),
    ]);
    expect(state().featuredVideoId).toBe("cam-bob");

    h.socket.receive({
      type: "participant.updated",
      participant: participant("carol", { videos: [{ id: "scr-carol", kind: "screen" }] }),
    });
    expect(state().featuredVideoId).toBe("scr-carol");

    client.actions.setFeaturedVideo("cam-bob");
    expect(state().featuredVideoId).toBe("cam-bob");

    h.socket.receive({ type: "participant.left", id: "bob", reason: "left" });
    expect(state().featuredVideoId).toBe("scr-carol");

    h.socket.receive({
      type: "participant.updated",
      participant: participant("carol", { videos: [] }),
    });
    expect(state().featuredVideoId).toBeNull();
  });
});

describe("chat, reações, mão e moderação", () => {
  it("chat entra no estado e o limite vira aviso", async () => {
    await connect();
    client.actions.sendChat("  olá  ");
    expect(h.socket.sentOfType("chat.send")).toEqual([{ type: "chat.send", text: "olá" }]);
    h.socket.receive({
      type: "chat.message",
      message: { id: "m1", from: "me", nickname: "Ana", text: "olá", sentAt: 2 },
    });
    expect(state().chat.map((m) => m.id)).toEqual(["m1"]);
    h.socket.receive({ type: "error", code: "rate_limited" });
    expect(state().notice).toEqual({ kind: "chatRateLimited" });
    client.actions.sendChat("   ");
    expect(h.socket.sentOfType("chat.send")).toHaveLength(1);
  });

  it("reação some sozinha", async () => {
    await connect();
    client.actions.react("🎉");
    expect(h.socket.sentOfType("reaction.send")).toEqual([{ type: "reaction.send", reaction: "🎉" }]);
    h.socket.receive({ type: "reaction", from: "bob", reaction: "🎉" });
    expect(state().reactions).toEqual([{ id: expect.any(String), from: "bob", reaction: "🎉" }]);
    await vi.advanceTimersByTimeAsync(REACTION_LIFETIME_MS);
    expect(state().reactions).toEqual([]);
  });

  it("levanta a mão", async () => {
    await connect();
    client.actions.setHandRaised(true);
    expect(h.socket.sentOfType("hand.set")).toEqual([{ type: "hand.set", raised: true }]);
    expect(state().handRaised).toBe(true);
    expect(state().participants[0]?.handRaised).toBe(true);
  });

  it("moderação só sai para o dono", async () => {
    await connect();
    client.actions.moderate("kick", "bob");
    expect(h.socket.sentOfType("moderate")).toEqual([]);
    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { isOwner: true }),
    });
    expect(state().isOwner).toBe(true);
    client.actions.moderate("ban", "bob");
    expect(h.socket.sentOfType("moderate")).toEqual([{ type: "moderate", action: "ban", target: "bob" }]);
  });

  it("copia o link", async () => {
    start();
    await flush();
    await client.actions.copyLink();
    expect(h.clipboard).toEqual([`${ORIGIN}/s/${CODE}`]);
    expect(state().notice).toEqual({ kind: "linkCopied" });
    client.actions.dismissNotice();
    expect(state().notice).toBeNull();
  });
});

describe("saídas", () => {
  it.each([
    ["kicked", WS_CLOSE.kicked],
    ["banned", WS_CLOSE.banned],
    ["ended", WS_CLOSE.roomEnded],
    ["full", WS_CLOSE.roomFull],
    ["error", WS_CLOSE.replaced],
  ] as const)("fechamento leva a %s e solta a mídia", async (phase, code) => {
    await connect();
    const media = h.media;
    h.socket.serverClose(code);
    expect(state().phase).toBe(phase);
    expect(media.closed).toBe(true);
    expect(state().participants).toEqual([]);
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_DELAY_MS * 2);
    expect(h.sockets).toHaveLength(1);
  });

  it("removed leva a kicked ou banned", async () => {
    await connect();
    h.socket.receive({ type: "removed", reason: "banned" });
    expect(state().phase).toBe("banned");
    expect(h.socket.closedByClient).toBe(true);
  });

  it("unauthorized volta ao lobby", async () => {
    await connect();
    h.socket.serverClose(WS_CLOSE.unauthorized);
    expect(state().phase).toBe("lobby");
    await flush();
    expect(h.server.callsTo("GET", `/api/rooms/${CODE}`)).toHaveLength(2);
  });

  it("leave fecha tudo e volta ao lobby", async () => {
    await connect();
    const socket = h.socket;
    client.actions.leave();
    expect(state().phase).toBe("lobby");
    expect(socket.closedByClient).toBe(true);
    expect(h.media.closed).toBe(true);
    expect(state().chat).toEqual([]);
  });
});

describe("reconexão", () => {
  it("queda → reconnecting → connected, com reconnect() da mídia e sem novo join", async () => {
    saveOwnerToken(h.storage, CODE, OWNER_TOKEN);
    await connect();
    await client.actions.setMicMuted(false);
    const media = h.media;
    h.socket.serverClose(1006);
    expect(state().phase).toBe("reconnecting");
    expect(media.closed).toBe(false);

    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    expect(h.sockets).toHaveLength(2);
    h.socket.serverClose(1006); // segunda tentativa falha: espera dobra
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    expect(h.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    expect(h.sockets).toHaveLength(3);

    h.socket.accept();
    expect(h.socket.sent[0]).toEqual({ type: "hello", ownerToken: OWNER_TOKEN });
    h.socket.receive({
      type: "welcome",
      self: "me",
      participants: [participant("me"), participant("bob")],
      chat: [],
    });
    await flush();
    expect(state().phase).toBe("connected");
    expect(media.reconnect).toHaveBeenCalledOnce();
    expect(h.medias).toHaveLength(1);
    expect(h.server.callsTo("POST", `/api/rooms/${CODE}/join`)).toHaveLength(1);
    // O microfone aberto volta a constar na lista.
    expect(h.socket.sentOfType("mic.set")).toEqual([{ type: "mic.set", muted: false }]);
  });

  it("vídeo próprio liberado na queda é despublicado", async () => {
    await connect();
    const starting = client.actions.startVideo("camera");
    const [request] = h.socket.sentOfType("video.request");
    h.socket.receive({
      type: "video.granted",
      requestId: request?.requestId ?? "",
      video: { id: "v1", kind: "camera" },
    });
    h.socket.receive({
      type: "participant.updated",
      participant: participant("me", { videos: [{ id: "v1", kind: "camera" }] }),
    });
    await starting;
    h.socket.serverClose(1006);
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    h.socket.accept();
    h.socket.receive({ type: "welcome", self: "me", participants: [participant("me")], chat: [] });
    expect(h.media.unpublishVideo).toHaveBeenCalledWith("v1");
    expect(state().localVideoIds).toEqual([]);
  });

  it("volta da rede tenta na hora", async () => {
    await connect();
    h.socket.serverClose(1006);
    for (const handler of h.resumeHandlers) handler();
    expect(h.sockets).toHaveLength(2);
  });

  it("admissão perdida na reconexão volta ao lobby", async () => {
    await connect();
    h.socket.serverClose(1006);
    await vi.advanceTimersByTimeAsync(RECONNECT_BASE_DELAY_MS);
    h.socket.serverClose(WS_CLOSE.unauthorized);
    expect(state().phase).toBe("lobby");
  });

  it("ping periódico e silêncio derruba a conexão", async () => {
    await connect();
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(h.socket.raw).toContain(WS_PING_FRAME);
    await vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS);
    expect(state().phase).toBe("reconnecting");
  });
});

describe("robustez", () => {
  it("quadro inválido é ignorado e relatado sem conteúdo", async () => {
    await connect();
    const before = state();
    h.socket.receiveRaw(JSON.stringify({ type: "chat.message", message: { text: "segredo" } }));
    h.socket.receiveRaw("não é json");
    expect(state()).toBe(before);
    expect(h.reports).toEqual([
      { message: "room: invalid server frame", extra: { type: "chat.message" } },
      { message: "room: invalid server frame", extra: { type: "undefined" } },
    ]);
    expect(JSON.stringify(h.reports)).not.toContain("segredo");
  });

  it("dispose solta WebSocket, mídia, prévia, timers e listeners", async () => {
    await connect();
    client.actions.react("👍");
    h.socket.receive({ type: "reaction", from: "bob", reaction: "👍" });
    const media = h.media;
    const socket = h.socket;
    client.release();
    await flush();
    expect(socket.closedByClient).toBe(true);
    expect(media.closed).toBe(true);
    expect(h.resumeHandlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
