import type { VideoQuality } from "@sualive/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeshSession, DEFAULT_MESH_TIMINGS } from "./session";
import {
  createFakeEnv,
  FakeHub,
  FakeNetwork,
  type FakeEnvOptions,
  type FakePeerConnection,
  FakeTrack,
} from "./testing/fakes";
import type { MediaSession, PeerStatus, RemoteVideo } from "./types";

const QUALITY: VideoQuality = { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 };
const RELAY: VideoQuality = { width: 640, height: 360, frameRate: 24, maxBitrate: 500_000 };
/** O que a captura de tela pede para o áudio: sem processamento de voz. */
const SCREEN_AUDIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
};

interface Node {
  id: string;
  session: MediaSession;
  fake: ReturnType<typeof createFakeEnv>;
  getIceServers: ReturnType<typeof vi.fn<() => Promise<RTCIceServer[]>>>;
  events: {
    peer: PeerStatus[];
    remoteAudio: { peerId: string; stream: MediaStream | null }[];
    added: RemoteVideo[];
    removed: { peerId: string; videoId: string }[];
    speaking: { peerId: string; speaking: boolean }[];
    ended: string[];
  };
}

function makeNode(id: string, hub: FakeHub, options: FakeEnvOptions = {}): Node {
  const fake = createFakeEnv(options);
  let calls = 0;
  const getIceServers = vi.fn(async () => [{ urls: `turn:${id}.example`, credential: `c${++calls}` }]);
  const session = createMeshSession(
    { selfId: id, transport: hub.transport(id), getIceServers, quality: QUALITY, relayQuality: RELAY },
    fake.env,
  );
  const events: Node["events"] = {
    peer: [],
    remoteAudio: [],
    added: [],
    removed: [],
    speaking: [],
    ended: [],
  };
  session.on("peer", (s) => events.peer.push(s));
  session.on("remoteAudio", (peerId, stream) => events.remoteAudio.push({ peerId, stream }));
  session.on("remoteVideoAdded", (v) => events.added.push(v));
  session.on("remoteVideoRemoved", (peerId, videoId) => events.removed.push({ peerId, videoId }));
  session.on("speaking", (peerId, speaking) => events.speaking.push({ peerId, speaking }));
  session.on("localVideoEnded", (videoId) => events.ended.push(videoId));
  return { id, session, fake, getIceServers, events };
}

const openPcs = (node: Node): FakePeerConnection[] => node.fake.pcs.filter((pc) => !pc.closed);
const onlyPc = (node: Node): FakePeerConnection => {
  const pcs = openPcs(node);
  expect(pcs).toHaveLength(1);
  return pcs[0]!;
};
const settle = (ms = 200): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);
const stateOf = (node: Node, peerId: string) => node.session.getPeers().find((p) => p.peerId === peerId);

async function connectAll(nodes: Node[]): Promise<void> {
  const ids = nodes.map((n) => n.id);
  for (const node of nodes) node.session.setPeers(ids);
  await settle();
  for (const node of nodes) {
    for (const other of nodes) {
      if (other !== node) expect(stateOf(node, other.id)?.state).toBe("connected");
    }
  }
}

let nodes: Node[] = [];
let hub: FakeHub;
let sharedNetwork: FakeNetwork;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  hub = new FakeHub();
  sharedNetwork = new FakeNetwork();
  nodes = [];
});

afterEach(() => {
  for (const node of nodes) node.session.close();
  vi.useRealTimers();
});

function node(id: string, options?: FakeEnvOptions): Node {
  const n = makeNode(id, hub, { network: sharedNetwork, ...options });
  nodes.push(n);
  return n;
}

describe("malha", () => {
  it("abre uma conexão por participante, ignora a si mesma e fecha quem saiu", async () => {
    const a = node("a");
    const b = node("b");
    const c = node("c");
    await connectAll([a, b, c]);
    expect(openPcs(a)).toHaveLength(2);
    expect(a.getIceServers).toHaveBeenCalledTimes(1);
    expect(openPcs(a)[0]!.config.iceServers).toEqual([{ urls: "turn:a.example", credential: "c1" }]);

    const toC = a.fake.pcs[1]!;
    a.session.setPeers(["a", "b"]);
    expect(toC.closed).toBe(true);
    expect(openPcs(a)).toHaveLength(1);
    expect(a.session.getPeers().map((p) => p.peerId)).toEqual(["b"]);
  });

  it("perfect negotiation: só a ponta não educada abre; ofertas simultâneas depois convergem", async () => {
    const a = node("a");
    const b = node("b");
    // A educada (b) já tem microfone: mesmo assim espera a primeira oferta da outra.
    await b.session.enableMicrophone();
    await connectAll([a, b]);
    const offers = hub.log.filter(
      (m) => m.data.kind === "description" && m.data.description.type === "offer",
    );
    // Sem colisão na primeira negociação: a educada nunca desfaz uma oferta com o canal de dados.
    expect(new Set(offers.map((m) => m.from))).toEqual(new Set(["a"]));
    expect(onlyPc(a).signalingState).toBe("stable");
    expect(onlyPc(b).signalingState).toBe("stable");

    expect(a.events.remoteAudio.filter((e) => e.stream)).toHaveLength(1);

    // Renegociação disparada pelos dois ao mesmo tempo (colisão real) converge.
    const before = offers.length;
    await Promise.all([a.session.enableMicrophone(), b.session.publishVideo("v1", "camera")]);
    await settle();
    const renegotiation = hub.log
      .filter((m) => m.data.kind === "description" && m.data.description.type === "offer")
      .slice(before);
    expect(new Set(renegotiation.map((m) => m.from))).toEqual(new Set(["a", "b"]));
    expect(onlyPc(a).signalingState).toBe("stable");
    expect(onlyPc(b).signalingState).toBe("stable");
    expect(b.events.remoteAudio.filter((e) => e.stream)).toHaveLength(1);
    expect(a.events.added.map((v) => v.videoId)).toEqual(["v1"]);
  });

  it("guarda candidatos que chegam antes da descrição remota", async () => {
    const a = node("a");
    const b = node("b");
    hub.hold((m) => m.to === "a" && m.data.kind === "description");
    a.session.setPeers(["a", "b"]);
    b.session.setPeers(["a", "b"]);
    await settle();
    const pcA = onlyPc(a);
    expect(pcA.remoteDescription).toBeNull();
    expect(hub.log.some((m) => m.to === "a" && m.data.kind === "candidate" && m.data.candidate)).toBe(true);
    expect(pcA.addedCandidates).toHaveLength(0);

    hub.release();
    await settle();
    expect(pcA.addedCandidates.some((c) => c?.usernameFragment)).toBe(true);
    expect(stateOf(a, "b")?.state).toBe("connected");
    expect(stateOf(b, "a")?.state).toBe("connected");
  });

  it("aceita sinais de quem ainda não está na lista de pares", async () => {
    const a = node("a");
    const b = node("b");
    b.session.setPeers(["a", "b"]);
    await settle();
    a.session.setPeers(["a", "b"]);
    await settle();
    expect(stateOf(a, "b")?.state).toBe("connected");
    expect(stateOf(b, "a")?.state).toBe("connected");
  });
});

describe("mapa de streams", () => {
  it("track antes do mapa: só anuncia o vídeo quando sabe o videoId", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    hub.hold((m) => m.to === "b" && m.data.kind === "streams");
    await a.session.publishVideo("v1", "camera");
    await settle();
    expect(onlyPc(b).remoteStreams.size).toBe(1);
    expect(b.events.added).toHaveLength(0);

    hub.release();
    await settle();
    expect(b.events.added).toHaveLength(1);
    expect(b.events.added[0]).toMatchObject({ peerId: "a", videoId: "v1" });
    expect(b.session.getRemoteVideos().map((v) => v.videoId)).toEqual(["v1"]);
  });

  it("mapa antes do track: anuncia quando o track chega", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    hub.hold((m) => m.to === "b" && m.data.kind === "description");
    await a.session.publishVideo("v1", "screen");
    await settle();
    expect(
      hub.log.some((m) => m.to === "b" && m.data.kind === "streams" && m.data.streams.length === 1),
    ).toBe(true);
    expect(b.events.added).toHaveLength(0);

    hub.release();
    await settle();
    expect(b.events.added.map((v) => v.videoId)).toEqual(["v1"]);
  });
});

describe("microfone e fala", () => {
  it("começa mudo, com eco e ruído do navegador, e o par recebe a voz", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.enableMicrophone("mic-2");
    expect(a.fake.userMediaCalls[0]).toEqual({
      audio: {
        deviceId: { exact: "mic-2" },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    const micTrack = a.fake.captured[0]!;
    expect(micTrack.enabled).toBe(false);
    expect(a.session.isMicrophoneMuted()).toBe(true);
    await settle();
    expect(b.events.remoteAudio).toHaveLength(1);
    expect(b.events.remoteAudio[0]?.peerId).toBe("a");

    a.session.setMicrophoneMuted(false);
    expect(micTrack.enabled).toBe(true);
    expect(a.session.isMicrophoneMuted()).toBe(false);
  });

  it("funciona sem microfone (só recebendo)", async () => {
    const a = node("a", { deny: { audio: true } });
    const b = node("b");
    await expect(a.session.enableMicrophone()).rejects.toThrow();
    await connectAll([a, b]);
    expect(a.session.isMicrophoneMuted()).toBe(true);
    await b.session.enableMicrophone();
    await settle();
    expect(a.events.remoteAudio).toHaveLength(1);
  });

  it("indicador de fala com histerese; mudo nunca aparece falando", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.enableMicrophone();
    await settle();
    const micTrack = a.fake.captured[0]!;
    micTrack.level = 0.3;
    await settle(1000);
    expect(a.events.speaking).toHaveLength(0); // mudo

    a.session.setMicrophoneMuted(false);
    await settle(300);
    expect(a.events.speaking).toEqual([{ peerId: "a", speaking: true }]);
    expect(b.events.speaking).toEqual([{ peerId: "a", speaking: true }]);

    // Pausa curta entre palavras não desliga.
    micTrack.level = 0;
    await settle(300);
    micTrack.level = 0.3;
    await settle(300);
    expect(b.events.speaking).toHaveLength(1);

    micTrack.level = 0;
    await settle(1000);
    expect(b.events.speaking.at(-1)).toEqual({ peerId: "a", speaking: false });

    micTrack.level = 0.3;
    await settle(300);
    expect(a.events.speaking.at(-1)).toEqual({ peerId: "a", speaking: true });
    a.session.setMicrophoneMuted(true);
    expect(a.events.speaking.at(-1)).toEqual({ peerId: "a", speaking: false });
    await settle(1000);
    expect(a.events.speaking.at(-1)).toEqual({ peerId: "a", speaking: false });
    expect(b.events.speaking.at(-1)).toEqual({ peerId: "a", speaking: false });
  });
});

describe("vídeo", () => {
  it("tela: captura limitada, nitidez, áudio da aba junto, parâmetros de envio aplicados", async () => {
    const a = node("a", { screenAudio: true });
    const b = node("b");
    await connectAll([a, b]);
    const local = await a.session.publishVideo("v1", "screen");
    expect(a.fake.displayMediaCalls[0]).toEqual({
      video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } },
      audio: SCREEN_AUDIO,
    });
    expect(local.stream.getTracks()).toHaveLength(2);
    expect(local.stream.getVideoTracks()[0]!.contentHint).toBe("detail");
    await settle();

    const sender = onlyPc(a).senders.find((s) => s.track?.kind === "video")!;
    expect(sender.params.encodings[0]).toMatchObject({
      maxBitrate: 1_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
    expect(sender.params.degradationPreference).toBe("maintain-resolution");
    // Áudio da aba no mesmo stream do vídeo.
    const remote = b.events.added[0]!;
    expect(
      remote.stream
        .getTracks()
        .map((t) => t.kind)
        .sort(),
    ).toEqual(["audio", "video"]);
    expect(b.events.remoteAudio).toHaveLength(0); // não confunde com a voz
  });

  it("áudio da tela: sem processamento de voz, estéreo e marcado como música", async () => {
    const a = node("a", { screenAudio: true });
    const local = await a.session.publishVideo("v1", "screen");
    expect(a.fake.displayMediaCalls).toHaveLength(1);
    const audio = local.stream.getAudioTracks()[0] as unknown as FakeTrack;
    expect(audio.contentHint).toBe("music");
    expect(audio.getSettings()).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    });
    expect(audio.appliedConstraints).toHaveLength(0); // já veio certo: não mexe de novo
  });

  it("áudio da tela: navegador que recusa as opções cai no pedido simples e corrige depois", async () => {
    const a = node("a", { screenAudio: true, screenAudioConstraints: "reject" });
    const local = await a.session.publishVideo("v1", "screen");
    expect(a.fake.displayMediaCalls.map((call) => call.audio)).toEqual([SCREEN_AUDIO, true]);
    const audio = local.stream.getAudioTracks()[0] as unknown as FakeTrack;
    expect(audio.contentHint).toBe("music");
    expect(audio.appliedConstraints).toEqual([SCREEN_AUDIO]);
    expect(audio.getSettings()).toMatchObject({ echoCancellation: false, noiseSuppression: false });
    expect(a.session.getLocalVideos()).toHaveLength(1);
  });

  it("áudio da tela: navegador que ignora as opções recebe a correção no track", async () => {
    const a = node("a", { screenAudio: true, screenAudioConstraints: "ignore" });
    const local = await a.session.publishVideo("v1", "screen");
    expect(a.fake.displayMediaCalls).toHaveLength(1);
    const audio = local.stream.getAudioTracks()[0] as unknown as FakeTrack;
    expect(audio.appliedConstraints).toEqual([SCREEN_AUDIO]);
    expect(audio.getSettings()).toMatchObject({ autoGainControl: false });
  });

  it("áudio da tela: a correção recusada pelo track não impede a transmissão", async () => {
    const a = node("a", { screenAudio: true, screenAudioConstraints: "ignore" });
    const b = node("b");
    await connectAll([a, b]);
    const spy = vi.spyOn(FakeTrack.prototype, "applyConstraints");
    spy.mockRejectedValueOnce(new DOMException("não", "OverconstrainedError"));
    const local = await a.session.publishVideo("v1", "screen");
    spy.mockRestore();
    expect(local.stream.getAudioTracks()[0]!.contentHint).toBe("music");
    await settle();
    expect(b.events.added).toHaveLength(1);
  });

  it("tela sem áudio (a pessoa não marcou o som) continua funcionando", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    const local = await a.session.publishVideo("v1", "screen");
    expect(local.stream.getAudioTracks()).toHaveLength(0);
    expect(a.fake.displayMediaCalls).toHaveLength(1);
    await settle();
    expect(b.events.added).toHaveLength(1);
  });

  it("negar a tela não repete o pedido", async () => {
    const a = node("a", { screenAudio: true, deny: { screen: true } });
    await expect(a.session.publishVideo("v1", "screen")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(a.fake.displayMediaCalls).toHaveLength(1);
  });

  it("parâmetros de vídeo nunca vão para o sender do áudio da tela", async () => {
    const a = node("a", { screenAudio: true });
    const b = node("b");
    await connectAll([a, b]);
    await a.session.publishVideo("v1", "screen");
    await settle();
    const pc = onlyPc(a);
    pc.relay = true;
    pc.setConnectionState("disconnected");
    pc.setConnectionState("connected");
    await settle();
    const audioSender = pc.senders.find((s) => s.track?.kind === "audio")!;
    const videoSender = pc.senders.find((s) => s.track?.kind === "video")!;
    expect(videoSender.setParametersCalls).toBeGreaterThan(0);
    expect(audioSender.setParametersCalls).toBe(0);
    expect(audioSender.params).toEqual({ encodings: [{ active: true }] });
  });

  it("webcam: fluidez e câmera escolhida", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    const local = await a.session.publishVideo("v1", "camera", { deviceId: "cam-1" });
    expect(a.fake.userMediaCalls[0]).toEqual({
      video: {
        deviceId: { exact: "cam-1" },
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    expect(local.stream.getVideoTracks()[0]!.contentHint).toBe("motion");
    await settle();
    const sender = onlyPc(a).senders.find((s) => s.track?.kind === "video")!;
    expect(sender.params.degradationPreference).toBe("maintain-framerate");
  });

  it("publicar vale para pares atuais e futuros; despublicar remove e solta a captura", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.publishVideo("v1", "camera");
    await settle();
    expect(b.events.added.map((v) => v.videoId)).toEqual(["v1"]);

    const c = node("c");
    a.session.setPeers(["a", "b", "c"]);
    b.session.setPeers(["a", "b", "c"]);
    c.session.setPeers(["a", "b", "c"]);
    await settle();
    expect(c.events.added).toHaveLength(1);
    expect(c.events.added[0]).toMatchObject({ peerId: "a", videoId: "v1" });
    const toC = a.fake.pcs[1]!;
    expect(toC.senders.find((s) => s.track?.kind === "video")?.params.encodings[0]?.maxBitrate).toBe(
      1_500_000,
    );

    a.session.unpublishVideo("v1");
    await settle();
    expect(b.events.removed).toEqual([{ peerId: "a", videoId: "v1" }]);
    expect(c.events.removed).toEqual([{ peerId: "a", videoId: "v1" }]);
    expect(a.fake.captured[0]!.readyState).toBe("ended");
    expect(a.session.getLocalVideos()).toHaveLength(0);
    expect(b.session.getRemoteVideos()).toHaveLength(0);
  });

  it("parar pelo navegador despublica e avisa", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.publishVideo("v1", "screen");
    await settle();
    (a.fake.captured[0] as FakeTrack).endByBrowser();
    await settle();
    expect(a.events.ended).toEqual(["v1"]);
    expect(a.session.getLocalVideos()).toHaveLength(0);
    expect(b.events.removed).toEqual([{ peerId: "a", videoId: "v1" }]);
  });

  it("rejeita quando a pessoa nega a permissão", async () => {
    const a = node("a", { deny: { screen: true } });
    await expect(a.session.publishVideo("v1", "screen")).rejects.toThrow();
    expect(a.session.getLocalVideos()).toHaveLength(0);
  });
});

describe("retransmissão", () => {
  it("limita o envio ao par retransmitido e volta ao normal quando deixa de ser", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.publishVideo("v1", "camera");
    await settle();
    const pc = onlyPc(a);
    const sender = pc.senders.find((s) => s.track?.kind === "video")!;

    pc.relay = true;
    pc.setConnectionState("disconnected");
    pc.setConnectionState("connected");
    await settle();
    expect(stateOf(a, "b")).toEqual({ peerId: "b", state: "connected", relayed: true });
    expect(a.events.peer.at(-1)).toEqual({ peerId: "b", state: "connected", relayed: true });
    expect(sender.params.encodings[0]).toMatchObject({
      maxBitrate: 500_000,
      maxFramerate: 24,
      scaleResolutionDownBy: 2,
    });

    pc.relay = false;
    pc.setConnectionState("disconnected");
    pc.setConnectionState("connected");
    await settle();
    expect(stateOf(a, "b")?.relayed).toBe(false);
    expect(sender.params.encodings[0]).toMatchObject({
      maxBitrate: 1_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
  });

  it("detecta retransmissão na ponta remota", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    const pc = onlyPc(a);
    pc.remoteRelay = true;
    pc.setConnectionState("connected");
    await settle();
    expect(stateOf(a, "b")?.relayed).toBe(true);
  });
});

describe("reconexão", () => {
  it("em falha tenta restartIce; se não voltar, recria a conexão com credenciais novas", async () => {
    const network = new FakeNetwork();
    const a = node("a", { network });
    const b = node("b", { network });
    await a.session.publishVideo("v1", "camera");
    await connectAll([a, b]);
    expect(b.events.added).toHaveLength(1);
    const first = onlyPc(a);

    network.blocked = true;
    first.setConnectionState("failed");
    onlyPc(b).setConnectionState("failed");
    expect(stateOf(a, "b")?.state).toBe("reconnecting");
    await settle();
    expect(first.restartIceCalls).toBe(1);
    expect(first.closed).toBe(false);

    network.blocked = false;
    await settle(DEFAULT_MESH_TIMINGS.iceRestartTimeoutMs);
    expect(first.closed).toBe(true);
    expect(a.getIceServers).toHaveBeenCalledTimes(2);
    const second = onlyPc(a);
    expect(second.config.iceServers).toEqual([{ urls: "turn:a.example", credential: "c2" }]);
    expect(stateOf(a, "b")?.state).toBe("connected");
    expect(stateOf(b, "a")?.state).toBe("connected");
    // A outra ponta percebeu a conexão nova (impressão digital) e recriou também.
    expect(b.fake.pcs.filter((pc) => pc.closed).length).toBeGreaterThanOrEqual(1);
    // O vídeo volta para quem assiste.
    expect(b.events.removed).toEqual([{ peerId: "a", videoId: "v1" }]);
    expect(b.events.added).toHaveLength(2);
    expect(a.events.peer.map((p) => p.state)).toContain("reconnecting");
  });

  it("restartIce sozinho resolve uma queda curta sem recriar", async () => {
    const network = new FakeNetwork();
    const a = node("a", { network });
    const b = node("b", { network });
    await connectAll([a, b]);
    const pc = onlyPc(a);
    pc.setConnectionState("disconnected");
    await settle(DEFAULT_MESH_TIMINGS.disconnectedGraceMs + 200);
    expect(pc.restartIceCalls).toBe(1);
    expect(pc.closed).toBe(false);
    expect(stateOf(a, "b")?.state).toBe("connected");
    await settle(DEFAULT_MESH_TIMINGS.iceRestartTimeoutMs);
    expect(pc.closed).toBe(false);
  });

  it("desiste depois de várias recriações e marca failed", async () => {
    const network = new FakeNetwork();
    network.blocked = true;
    const a = node("a", { network });
    const b = node("b", { network });
    a.session.setPeers(["a", "b"]);
    b.session.setPeers(["a", "b"]);
    await settle(
      (DEFAULT_MESH_TIMINGS.connectTimeoutMs + 500) * (DEFAULT_MESH_TIMINGS.maxRecreateAttempts + 2),
    );
    expect(stateOf(a, "b")?.state).toBe("failed");
  });

  it("reconnect() busca credenciais novas, mantém o que está conectado e refaz o resto", async () => {
    const a = node("a");
    const b = node("b");
    const c = node("c");
    await connectAll([a, b, c]);
    const [toB, toC] = openPcs(a);
    toC!.setConnectionState("disconnected");
    a.session.reconnect();
    await settle();
    expect(a.getIceServers).toHaveBeenCalledTimes(2);
    expect(toB!.closed).toBe(false);
    expect(toB!.config.iceServers).toEqual([{ urls: "turn:a.example", credential: "c2" }]);
    expect(toC!.closed).toBe(true);
    expect(stateOf(a, "c")?.state).toBe("connected");
    expect(stateOf(c, "a")?.state).toBe("connected");
  });
});

describe("close()", () => {
  it("fecha conexões, solta microfone e vídeo, para timers e a escuta", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.enableMicrophone();
    await a.session.publishVideo("v1", "screen");
    await settle();
    b.session.close();
    a.session.close();
    expect(a.fake.pcs.every((pc) => pc.closed)).toBe(true);
    expect(a.fake.captured.every((t) => t.readyState === "ended")).toBe(true);
    expect(a.fake.closedMeters).toBe(1);
    expect(a.fake.closedAnalyzers).toBe(1);
    expect(hub.subscriberCount("a")).toBe(0);
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    expect(a.session.getPeers()).toEqual([]);
  });

  it("quem sai some da malha: voz e vídeos são retirados", async () => {
    const a = node("a");
    const b = node("b");
    await connectAll([a, b]);
    await a.session.enableMicrophone();
    await a.session.publishVideo("v1", "camera");
    await settle();
    b.session.setPeers(["b"]);
    expect(b.events.removed).toEqual([{ peerId: "a", videoId: "v1" }]);
    expect(b.events.remoteAudio.at(-1)).toEqual({ peerId: "a", stream: null });
    expect(b.session.getPeers()).toEqual([]);
  });
});
