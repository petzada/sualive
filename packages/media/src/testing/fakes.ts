/**
 * Dublês em memória de WebRTC, captura e Web Audio, só para os testes. Simulam o suficiente da
 * máquina de estados de sinalização (ofertas implícitas, rollback implícito, `negotiationneeded`,
 * tracks remotos por stream) para exercitar a malha de verdade, duas pontas ligadas por um
 * transporte falso.
 */
import { signalDataSchema } from "@sualive/protocol";
import type { AudioAnalyzer, AudioMeter, MediaEnvironment } from "../env";
import type { SignalData, SignalTransport } from "../types";

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}${++sequence}`;
/** Assíncrono como o navegador, mas sem timer (os testes usam timers falsos). */
const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Tracks locais por id, para o lado remoto ler o nível de áudio de quem envia. */
const trackRegistry = new Map<string, FakeTrack>();

export class FakeTrack extends EventTarget {
  readonly id: string;
  enabled = true;
  readyState: MediaStreamTrackState = "live";
  contentHint = "";
  /** Nível de áudio simulado (0 a 1). */
  level = 0;
  readonly source: FakeTrack | undefined;
  /** Restrições pedidas depois da captura, em ordem. */
  readonly appliedConstraints: MediaTrackConstraints[] = [];
  private settings: MediaTrackSettings;

  constructor(
    readonly kind: "audio" | "video",
    settings: MediaTrackSettings = {},
    options: { id?: string; source?: FakeTrack } = {},
  ) {
    super();
    this.id = options.id ?? nextId("track");
    this.settings = settings;
    this.source = options.source;
    if (!options.source) trackRegistry.set(this.id, this);
  }

  getSettings(): MediaTrackSettings {
    return { ...this.settings };
  }

  /** Aceita só valores simples (true/false/número), como preferência. */
  async applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
    await tick();
    this.appliedConstraints.push(constraints);
    const next: Record<string, unknown> = { ...this.settings };
    for (const [key, value] of Object.entries(constraints)) {
      if (typeof value === "boolean" || typeof value === "number") next[key] = value;
    }
    this.settings = next as MediaTrackSettings;
  }

  stop(): void {
    this.readyState = "ended";
  }

  /** A pessoa parou pelo navegador. */
  endByBrowser(): void {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

export class FakeStream extends EventTarget {
  readonly id: string;
  private readonly tracks: FakeTrack[];

  constructor(tracks: FakeTrack[] = [], id: string = nextId("stream")) {
    super();
    this.tracks = [...tracks];
    this.id = id;
  }

  getTracks(): FakeTrack[] {
    return [...this.tracks];
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "video");
  }
  addTrack(track: FakeTrack): void {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
  removeTrack(track: FakeTrack): void {
    const index = this.tracks.indexOf(track);
    if (index >= 0) this.tracks.splice(index, 1);
  }
  /** Remoção vinda da negociação: dispara `removetrack`, como o navegador. */
  removeRemoteTrack(track: FakeTrack): void {
    this.removeTrack(track);
    this.dispatchEvent(new Event("removetrack"));
  }
}

export class FakeSender {
  track: FakeTrack | null;
  readonly streamIds: string[];
  params: { encodings: RTCRtpEncodingParameters[]; degradationPreference?: RTCDegradationPreference };
  setParametersCalls = 0;
  private transactionId = "";

  constructor(track: FakeTrack, streamIds: string[]) {
    this.track = track;
    this.streamIds = streamIds;
    this.params = { encodings: [{ active: true }] };
  }

  getParameters(): RTCRtpSendParameters {
    this.transactionId = nextId("tx");
    return {
      transactionId: this.transactionId,
      encodings: this.params.encodings.map((e) => ({ ...e })),
      ...(this.params.degradationPreference
        ? { degradationPreference: this.params.degradationPreference }
        : {}),
      codecs: [],
      headerExtensions: [],
      rtcp: {},
    };
  }

  async setParameters(params: RTCRtpSendParameters): Promise<void> {
    await tick();
    if (params.transactionId !== this.transactionId) {
      throw new DOMException("transactionId velho", "InvalidModificationError");
    }
    this.setParametersCalls += 1;
    this.params = {
      encodings: params.encodings.map((e) => ({ ...e })),
      ...(params.degradationPreference ? { degradationPreference: params.degradationPreference } : {}),
    };
  }

  async replaceTrack(track: FakeTrack | null): Promise<void> {
    this.track = track;
  }
}

export class FakeReceiver {
  constructor(readonly track: FakeTrack) {}

  getSynchronizationSources(): RTCRtpSynchronizationSource[] {
    const source = this.track.source;
    const audioLevel = source && source.enabled && source.readyState === "live" ? source.level : 0;
    return [{ source: 1, timestamp: 0, rtpTimestamp: 0, audioLevel }];
  }
}

interface SdpTrack {
  trackId: string;
  kind: "audio" | "video";
  streamId: string | null;
}

function buildSdp(cert: string, ufrag: string, tracks: SdpTrack[]): string {
  return [
    "v=0",
    `a=fingerprint:sha-256 ${cert}`,
    `a=x-ice:${ufrag}`,
    ...tracks.map((t) => `a=x-track:${t.trackId} ${t.kind} ${t.streamId ?? "-"}`),
  ].join("\n");
}

function parseSdp(sdp: string): { ufrag: string; tracks: SdpTrack[] } {
  let ufrag = "";
  const tracks: SdpTrack[] = [];
  for (const line of sdp.split("\n")) {
    if (line.startsWith("a=x-ice:")) ufrag = line.slice("a=x-ice:".length);
    if (line.startsWith("a=x-track:")) {
      const [trackId = "", kind = "audio", streamId = "-"] = line.slice("a=x-track:".length).split(" ");
      tracks.push({ trackId, kind: kind as "audio" | "video", streamId: streamId === "-" ? null : streamId });
    }
  }
  return { ufrag, tracks };
}

/**
 * Rede simulada: `blocked` impede que conexões (novas ou reiniciadas) cheguem a `connected`.
 * Conecta só pares coerentes: cada um com a descrição do outro e papéis DTLS opostos (um ofertou,
 * o outro respondeu). Duas "respostas cruzadas" nunca conectam, como no navegador.
 */
export class FakeNetwork {
  blocked = false;
  readonly pcs = new Map<string, FakePeerConnection>();

  tryConnect(pc: FakePeerConnection): void {
    if (this.blocked) return;
    const otherCert = sdpFingerprint(pc.currentRemoteDescription?.sdp);
    const other = otherCert ? this.pcs.get(otherCert) : undefined;
    if (!other || other.closed || pc.closed) return;
    const coherent =
      pc.signalingState === "stable" &&
      other.signalingState === "stable" &&
      sdpFingerprint(other.currentRemoteDescription?.sdp) === pc.cert &&
      pc.currentLocalDescription?.type !== other.currentLocalDescription?.type;
    if (!coherent) return;
    pc.markConnected();
    other.markConnected();
  }
}

function sdpFingerprint(sdp: string | undefined): string | null {
  const match = sdp ? /^a=fingerprint:sha-256 (.+)$/m.exec(sdp) : null;
  return match?.[1] ?? null;
}

export class FakePeerConnection extends EventTarget {
  readonly cert = nextId("cert");
  config: RTCConfiguration;
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  currentLocalDescription: RTCSessionDescriptionInit | null = null;
  currentRemoteDescription: RTCSessionDescriptionInit | null = null;
  private pendingLocal: RTCSessionDescriptionInit | null = null;
  private pendingRemote: RTCSessionDescriptionInit | null = null;
  readonly senders: FakeSender[] = [];
  readonly receivers = new Map<string, { receiver: FakeReceiver; streamId: string | null }>();
  readonly remoteStreams = new Map<string, FakeStream>();
  readonly addedCandidates: (RTCIceCandidateInit | null)[] = [];
  dataChannels: string[] = [];
  restartIceCalls = 0;
  closed = false;
  /** O par de candidatos em uso é TURN deste lado? */
  relay = false;
  private ufrag = nextId("ufrag");
  private gatheredUfrag = "";
  private remoteUfrag = "";
  private version = 0;
  private offeredVersion = 0;
  private negotiatedVersion = 0;
  private negotiationQueued = false;

  constructor(
    private readonly network: FakeNetwork,
    config: RTCConfiguration,
  ) {
    super();
    this.config = config;
    network.pcs.set(this.cert, this);
  }

  markConnected(): void {
    if (this.closed || this.connectionState === "connected") return;
    this.iceConnectionState = "connected";
    this.dispatchEvent(new Event("iceconnectionstatechange"));
    this.setConnectionState("connected");
  }

  getConfiguration(): RTCConfiguration {
    return this.config;
  }
  setConfiguration(config: RTCConfiguration): void {
    this.config = config;
  }

  createDataChannel(label: string): { label: string } {
    this.dataChannels.push(label);
    this.markDirty();
    return { label };
  }

  addTrack(track: FakeTrack, ...streams: FakeStream[]): FakeSender {
    if (this.closed) throw new DOMException("fechada", "InvalidStateError");
    if (this.senders.some((s) => s.track === track)) throw new DOMException("repetido", "InvalidAccessError");
    const sender = new FakeSender(
      track,
      streams.map((s) => s.id),
    );
    this.senders.push(sender);
    this.markDirty();
    return sender;
  }

  removeTrack(sender: FakeSender): void {
    if (this.closed) throw new DOMException("fechada", "InvalidStateError");
    sender.track = null;
    this.markDirty();
  }

  getSenders(): FakeSender[] {
    return [...this.senders];
  }

  getReceivers(): FakeReceiver[] {
    return [...this.receivers.values()].map((r) => r.receiver);
  }

  restartIce(): void {
    this.restartIceCalls += 1;
    this.ufrag = nextId("ufrag");
    this.markDirty();
  }

  private markDirty(): void {
    this.version += 1;
    this.queueNegotiationCheck();
  }

  private queueNegotiationCheck(): void {
    if (this.negotiationQueued || this.closed) return;
    this.negotiationQueued = true;
    setTimeout(() => {
      this.negotiationQueued = false;
      if (!this.closed && this.signalingState === "stable" && this.version > this.negotiatedVersion) {
        this.dispatchEvent(new Event("negotiationneeded"));
      }
    }, 0);
  }

  private localSdp(): string {
    const tracks: SdpTrack[] = this.senders.flatMap((s) =>
      s.track ? [{ trackId: s.track.id, kind: s.track.kind, streamId: s.streamIds[0] ?? null }] : [],
    );
    return buildSdp(this.cert, this.ufrag, tracks);
  }

  private setSignaling(state: RTCSignalingState): void {
    this.signalingState = state;
    this.dispatchEvent(new Event("signalingstatechange"));
  }

  async setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void> {
    await tick();
    if (this.closed) throw new DOMException("fechada", "InvalidStateError");
    const type =
      description?.type ??
      (this.signalingState === "stable" || this.signalingState === "have-local-offer" ? "offer" : "answer");
    const local: RTCSessionDescriptionInit = { type, sdp: this.localSdp() };
    if (type === "offer") {
      if (this.signalingState !== "stable" && this.signalingState !== "have-local-offer") {
        throw new DOMException("estado errado para oferta", "InvalidStateError");
      }
      this.pendingLocal = local;
      this.localDescription = local;
      this.offeredVersion = this.version;
      this.setSignaling("have-local-offer");
    } else if (type === "answer") {
      if (this.signalingState !== "have-remote-offer") {
        throw new DOMException("estado errado para resposta", "InvalidStateError");
      }
      this.localDescription = local;
      this.currentLocalDescription = local;
      this.currentRemoteDescription = this.pendingRemote;
      this.pendingRemote = null;
      this.negotiatedVersion = this.version;
      this.setSignaling("stable");
      this.onStable();
    } else {
      throw new DOMException(`tipo ${type} não simulado`, "NotSupportedError");
    }
    this.gather();
  }

  private gather(): void {
    if (this.gatheredUfrag === this.ufrag) return;
    this.gatheredUfrag = this.ufrag;
    const ufrag = this.ufrag;
    setTimeout(() => {
      if (this.closed) return;
      const candidate = {
        candidate: `candidate:${this.cert} 1 udp 1 192.0.2.1 9 typ host ufrag ${ufrag}`,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: ufrag,
      };
      this.dispatchEvent(Object.assign(new Event("icecandidate"), { candidate }));
      this.dispatchEvent(Object.assign(new Event("icecandidate"), { candidate: null }));
    }, 0);
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    await tick();
    if (this.closed) throw new DOMException("fechada", "InvalidStateError");
    const sdp = description.sdp ?? "";
    const knownRemote = sdpFingerprint(this.currentRemoteDescription?.sdp);
    if (knownRemote && sdpFingerprint(sdp) !== knownRemote) {
      // No navegador, a oferta de outra conexão não casa com as m-lines/DTLS já negociados.
      throw new DOMException("descrição de outra conexão", "InvalidAccessError");
    }
    if (description.type === "offer") {
      if (this.signalingState === "have-local-offer") {
        // Rollback implícito (o lado educado da perfect negotiation).
        this.pendingLocal = null;
        this.localDescription = this.currentLocalDescription;
        this.setSignaling("stable");
      }
      if (this.signalingState !== "stable") throw new DOMException("estado errado", "InvalidStateError");
      this.pendingRemote = description;
      this.remoteDescription = description;
      this.setSignaling("have-remote-offer");
      this.applyRemote(sdp);
    } else if (description.type === "answer") {
      if (this.signalingState !== "have-local-offer") {
        throw new DOMException("resposta sem oferta", "InvalidStateError");
      }
      this.remoteDescription = description;
      this.currentRemoteDescription = description;
      this.currentLocalDescription = this.pendingLocal;
      this.pendingLocal = null;
      this.negotiatedVersion = this.offeredVersion;
      this.setSignaling("stable");
      this.applyRemote(sdp);
      this.onStable();
    } else {
      throw new DOMException(`tipo ${description.type} não simulado`, "NotSupportedError");
    }
  }

  private applyRemote(sdp: string): void {
    const { ufrag, tracks } = parseSdp(sdp);
    this.remoteUfrag = ufrag;
    const present = new Set(tracks.map((t) => t.trackId));
    for (const [trackId, entry] of [...this.receivers]) {
      if (present.has(trackId)) continue;
      this.receivers.delete(trackId);
      if (entry.streamId) this.remoteStreams.get(entry.streamId)?.removeRemoteTrack(entry.receiver.track);
    }
    for (const t of tracks) {
      if (this.receivers.has(t.trackId)) continue;
      const source = trackRegistry.get(t.trackId);
      const track = new FakeTrack(t.kind, source?.getSettings() ?? {}, {
        id: t.trackId,
        ...(source ? { source } : {}),
      });
      const receiver = new FakeReceiver(track);
      this.receivers.set(t.trackId, { receiver, streamId: t.streamId });
      const streams: FakeStream[] = [];
      if (t.streamId) {
        let stream = this.remoteStreams.get(t.streamId);
        if (!stream) {
          stream = new FakeStream([], t.streamId);
          this.remoteStreams.set(t.streamId, stream);
        }
        stream.addTrack(track);
        streams.push(stream);
      }
      this.dispatchEvent(Object.assign(new Event("track"), { track, streams, receiver, transceiver: {} }));
    }
  }

  private onStable(): void {
    this.queueNegotiationCheck();
    if (!this.currentLocalDescription || !this.currentRemoteDescription) return;
    setTimeout(() => this.network.tryConnect(this), 0);
  }

  async addIceCandidate(candidate?: RTCIceCandidateInit | null): Promise<void> {
    await tick();
    if (this.closed) throw new DOMException("fechada", "InvalidStateError");
    if (!this.remoteDescription) throw new DOMException("sem descrição remota", "InvalidStateError");
    if (candidate?.usernameFragment && candidate.usernameFragment !== this.remoteUfrag) {
      throw new DOMException("ufrag desconhecido", "OperationError");
    }
    this.addedCandidates.push(candidate ?? null);
  }

  /** Relatório mínimo: transporte → par selecionado → candidatos. */
  remoteRelay = false;
  async getStats(): Promise<RTCStatsReport> {
    await tick();
    const report = new Map<string, Record<string, unknown>>([
      ["T", { id: "T", type: "transport", selectedCandidatePairId: "P" }],
      ["P", { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R" }],
      ["L", { id: "L", type: "local-candidate", candidateType: this.relay ? "relay" : "host" }],
      ["R", { id: "R", type: "remote-candidate", candidateType: this.remoteRelay ? "relay" : "srflx" }],
    ]);
    return report as unknown as RTCStatsReport;
  }

  close(): void {
    this.closed = true;
    this.signalingState = "closed";
    this.connectionState = "closed";
  }

  /** Simula mudança de estado da conexão (queda, falha). */
  setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }
}

// ---------- Transporte ----------

export interface HubMessage {
  from: string;
  to: string;
  data: SignalData;
}

/** WebSocket da sala simulado: entrega em ordem, assíncrona, validando pelo esquema do protocolo. */
export class FakeHub {
  readonly log: HubMessage[] = [];
  private readonly handlers = new Map<string, Set<(from: string, data: SignalData) => void>>();
  private holdPredicate: ((message: HubMessage) => boolean) | null = null;
  private readonly held: HubMessage[] = [];

  transport(id: string): SignalTransport {
    return {
      send: (to, data) => {
        // Ida e volta em JSON + validação: o formato tem de passar pelo servidor.
        const parsed = signalDataSchema.parse(JSON.parse(JSON.stringify(data)));
        const message = { from: id, to, data: parsed };
        this.log.push(message);
        if (this.holdPredicate?.(message)) this.held.push(message);
        else setTimeout(() => this.deliver(message), 0);
      },
      subscribe: (handler) => {
        let set = this.handlers.get(id);
        if (!set) {
          set = new Set();
          this.handlers.set(id, set);
        }
        set.add(handler);
        return () => {
          this.handlers.get(id)?.delete(handler);
        };
      },
    };
  }

  subscriberCount(id: string): number {
    return this.handlers.get(id)?.size ?? 0;
  }

  /** Segura as mensagens que casam até `release()`. */
  hold(predicate: (message: HubMessage) => boolean): void {
    this.holdPredicate = predicate;
  }

  release(): void {
    this.holdPredicate = null;
    for (const message of this.held.splice(0)) setTimeout(() => this.deliver(message), 0);
  }

  private deliver(message: HubMessage): void {
    for (const handler of [...(this.handlers.get(message.to) ?? [])]) handler(message.from, message.data);
  }
}

// ---------- Ambiente ----------

export interface FakeEnvOptions {
  network?: FakeNetwork;
  deny?: { audio?: boolean; video?: boolean; screen?: boolean };
  /** Sem `getDisplayMedia` (celular). */
  noScreen?: boolean;
  /** A tela compartilhada traz áudio da aba. */
  screenAudio?: boolean;
  /**
   * Como o navegador trata as opções de áudio da tela: `honor` aplica (padrão); `ignore` entrega o
   * áudio com o processamento de voz ligado; `reject` recusa o pedido com `TypeError` (só o simples
   * `audio: true` passa).
   */
  screenAudioConstraints?: "honor" | "ignore" | "reject";
  screenSettings?: MediaTrackSettings;
  cameraSettings?: MediaTrackSettings;
}

export interface FakeEnv {
  env: MediaEnvironment;
  pcs: FakePeerConnection[];
  userMediaCalls: MediaStreamConstraints[];
  displayMediaCalls: DisplayMediaStreamOptions[];
  /** Tracks entregues pela captura, em ordem. */
  captured: FakeTrack[];
  closedMeters: number;
  closedAnalyzers: number;
}

function deniedError(): DOMException {
  return new DOMException("Permissão negada", "NotAllowedError");
}

export function createFakeEnv(options: FakeEnvOptions = {}): FakeEnv {
  const network = options.network ?? new FakeNetwork();
  const fake: FakeEnv = {
    env: undefined as unknown as MediaEnvironment,
    pcs: [],
    userMediaCalls: [],
    displayMediaCalls: [],
    captured: [],
    closedMeters: 0,
    closedAnalyzers: 0,
  };
  const capture = (track: FakeTrack): FakeTrack => {
    fake.captured.push(track);
    return track;
  };

  const analyzer = (): AudioAnalyzer => ({
    measure(stream): AudioMeter | null {
      const track = stream.getAudioTracks()[0] as unknown as FakeTrack | undefined;
      if (!track) return null;
      return {
        level: () => track.level,
        close: () => {
          fake.closedMeters += 1;
        },
      };
    },
    close: () => {
      fake.closedAnalyzers += 1;
    },
  });

  fake.env = {
    createPeerConnection(config) {
      const pc = new FakePeerConnection(network, config);
      fake.pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    createMediaStream: (tracks) => new FakeStream(tracks as unknown as FakeTrack[]) as unknown as MediaStream,
    async getUserMedia(constraints) {
      fake.userMediaCalls.push(constraints);
      await tick();
      if (constraints.audio && options.deny?.audio) throw deniedError();
      if (constraints.video && options.deny?.video) throw deniedError();
      const tracks: FakeTrack[] = [];
      if (constraints.audio) tracks.push(capture(new FakeTrack("audio")));
      if (constraints.video) {
        tracks.push(
          capture(
            new FakeTrack("video", options.cameraSettings ?? { width: 1280, height: 720, frameRate: 30 }),
          ),
        );
      }
      return new FakeStream(tracks) as unknown as MediaStream;
    },
    getDisplayMedia: options.noScreen
      ? undefined
      : async (displayOptions) => {
          fake.displayMediaCalls.push(displayOptions);
          await tick();
          if (options.deny?.screen) throw deniedError();
          const mode = options.screenAudioConstraints ?? "honor";
          const audio = displayOptions.audio;
          if (mode === "reject" && typeof audio === "object") {
            throw new TypeError("opções de áudio não suportadas");
          }
          const tracks = [
            capture(
              new FakeTrack("video", options.screenSettings ?? { width: 1280, height: 720, frameRate: 30 }),
            ),
          ];
          if (options.screenAudio && audio) {
            // Padrão do Chrome para o áudio da aba: processamento de voz ligado, mono.
            const settings: MediaTrackSettings = {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            };
            if (mode === "honor" && typeof audio === "object") {
              for (const [key, value] of Object.entries(audio)) {
                if (typeof value === "boolean" || typeof value === "number") {
                  (settings as Record<string, unknown>)[key] = value;
                }
              }
            }
            tracks.push(capture(new FakeTrack("audio", settings)));
          }
          return new FakeStream(tracks) as unknown as MediaStream;
        },
    createAudioAnalyzer: analyzer,
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle),
  };
  return fake;
}
