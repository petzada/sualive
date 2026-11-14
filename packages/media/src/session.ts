/**
 * Malha direta: uma `RTCPeerConnection` com cada outro participante, negociada com "perfect
 * negotiation" e sinalizada pelo WebSocket da sala.
 *
 * Convenções do fio (as duas pontas rodam este mesmo código):
 * - A voz vai num track de áudio sem stream associado; quem recebe reconhece a voz por isso.
 * - Cada vídeo publicado vai com o seu `MediaStream` (vídeo e, na tela, o áudio da aba). O sinal
 *   `streams` liga o id desse stream ao `videoId` autorizado pelo servidor.
 * - Um canal de dados negociado (`id` fixo, criado pelos dois lados) garante que a conexão nasce
 *   mesmo sem microfone nem vídeo; ele não carrega nada.
 */
import type { VideoKind } from "@sualive/protocol";
import type { AudioAnalyzer, AudioMeter, MediaEnvironment, TimerHandle } from "./env";
import { stopStream } from "./env";
import { createEmitter } from "./emitter";
import { createSpeakingDetector, SPEAKING_POLL_MS } from "./speaking";
import type {
  LocalVideo,
  MediaSession,
  MediaSessionEvents,
  MediaSessionOptions,
  PeerConnectionState,
  PeerStatus,
  PublishVideoOptions,
  RemoteVideo,
  SignalData,
} from "./types";
import { isRelayedConnection, sdpFingerprint, sendLimits } from "./webrtc-utils";

/** Tempos técnicos da reconexão (ms). */
export interface MeshTimings {
  /** Espera em `disconnected` antes de reiniciar o ICE (costuma voltar sozinho). */
  disconnectedGraceMs: number;
  /** Depois de `restartIce`, quanto esperar antes de recriar a conexão. */
  iceRestartTimeoutMs: number;
  /** Conexão nova que não conecta neste prazo é recriada. */
  connectTimeoutMs: number;
  /** Recriações seguidas sem sucesso antes de marcar `failed`. */
  maxRecreateAttempts: number;
  /** Sinais de quem ainda não está na lista de pares valem por este tempo. */
  pendingSignalTtlMs: number;
}

export const DEFAULT_MESH_TIMINGS: MeshTimings = {
  disconnectedGraceMs: 2_000,
  iceRestartTimeoutMs: 8_000,
  connectTimeoutMs: 20_000,
  maxRecreateAttempts: 3,
  pendingSignalTtlMs: 10_000,
};

const DATA_CHANNEL_LABEL = "sualive";
const DATA_CHANNEL_ID = 0;
const MAX_QUEUED_SIGNALS = 256;

/**
 * Áudio da aba ou do sistema: música e vídeo, não voz. Sem isto o Chrome aplica ao áudio da tela o
 * mesmo processamento do microfone (cancelamento de eco, supressão de ruído e ganho automático, em
 * mono), que corta notas sustentadas e o fundo da música e deixa estalos. Valores simples (sem
 * `exact`) são só preferência: o navegador que não os suporta ignora e a captura segue.
 */
const SCREEN_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
};

/** Erros de `getDisplayMedia` que indicam opções recusadas (não a pessoa cancelando). */
function isConstraintError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "OverconstrainedError"
  );
}

/** Garante, depois da captura, o áudio da tela sem processamento de voz e marcado como música. */
async function prepareScreenAudio(stream: MediaStream): Promise<void> {
  for (const track of stream.getAudioTracks()) {
    track.contentHint = "music";
    const settings = track.getSettings();
    const processed =
      settings.echoCancellation !== false ||
      settings.noiseSuppression !== false ||
      settings.autoGainControl !== false;
    if (!processed) continue;
    try {
      await track.applyConstraints(SCREEN_AUDIO_CONSTRAINTS);
    } catch {
      // O Chrome não troca o processamento depois da captura (OverconstrainedError): segue como veio.
    }
  }
}

type Candidate = Extract<SignalData, { kind: "candidate" }>["candidate"];
type Description = Extract<SignalData, { kind: "description" }>["description"];
type StreamEntry = Extract<SignalData, { kind: "streams" }>["streams"][number];

interface Publication {
  readonly videoId: string;
  readonly kind: VideoKind;
  readonly stream: MediaStream;
  readonly videoTrack: MediaStreamTrack;
  readonly abort: AbortController;
}

/** Uma `RTCPeerConnection` concreta. Recriar a conexão troca o `Link` inteiro. */
interface Link {
  readonly pc: RTCPeerConnection;
  readonly abort: AbortController;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Candidatos que chegaram antes da descrição remota. */
  readonly candidates: Candidate[];
  /** Track local (id) → sender. */
  readonly senders: Map<string, RTCRtpSender>;
  micSender: RTCRtpSender | null;
  /** Streams de vídeo recebidos, por id. */
  readonly remoteStreams: Map<string, MediaStream>;
  /** Vídeos já anunciados com `remoteVideoAdded`: streamId → videoId. */
  readonly shownVideos: Map<string, string>;
  voice: { receiver: RTCRtpReceiver; stream: MediaStream } | null;
  timer: TimerHandle | null;
  recovering: boolean;
  paramsChain: Promise<void>;
}

interface Peer {
  readonly id: string;
  /** Na colisão de ofertas, o educado desiste da dele. Decidido pela ordem dos ids. */
  readonly polite: boolean;
  link: Link | null;
  state: PeerConnectionState;
  relayed: boolean;
  /** Mapa enviado pelo par: streamId → videoId. */
  remoteStreamIds: Map<string, string>;
  attempts: number;
  signalChain: Promise<void>;
  /** Sinais que chegaram enquanto as credenciais de ICE eram buscadas. */
  queued: SignalData[];
}

export function createMeshSession(
  options: MediaSessionOptions,
  env: MediaEnvironment,
  timings: MeshTimings = DEFAULT_MESH_TIMINGS,
): MediaSession {
  const { selfId, transport, quality, relayQuality } = options;
  const emitter = createEmitter<MediaSessionEvents>();
  const peers = new Map<string, Peer>();
  const publications = new Map<string, Publication>();
  const pendingSignals = new Map<string, { at: number; data: SignalData }[]>();
  const speaking = createSpeakingDetector((id, value) => emitter.emit("speaking", id, value));

  let iceServers: RTCIceServer[] = [];
  let analyzer: AudioAnalyzer | null = null;
  let mic: { stream: MediaStream; track: MediaStreamTrack; meter: AudioMeter | null } | null = null;
  let micMuted = true;
  let micRequest = 0;
  let closed = false;

  const pollTimer = env.setInterval(pollSpeaking, SPEAKING_POLL_MS);
  const unsubscribe = transport.subscribe(onSignal);

  // ---------- Sinalização ----------

  function send(peerId: string, data: SignalData): void {
    if (closed) return;
    try {
      transport.send(peerId, data);
    } catch {
      // WebSocket fechado: `reconnect()` refaz a negociação quando ele voltar.
    }
  }

  function streamEntries(): StreamEntry[] {
    return [...publications.values()].map((pub) => ({ streamId: pub.stream.id, videoId: pub.videoId }));
  }

  function sendStreams(peer: Peer): void {
    send(peer.id, { kind: "streams", streams: streamEntries() });
  }

  function sendDescription(peer: Peer, link: Link): void {
    const description = link.pc.localDescription;
    if (!description) return;
    send(peer.id, { kind: "description", description: { type: description.type, sdp: description.sdp } });
  }

  function onSignal(from: string, data: SignalData): void {
    if (closed || from === selfId) return;
    const peer = peers.get(from);
    if (!peer) {
      // Pode chegar antes de `setPeers` incluir quem acabou de entrar.
      const now = env.now();
      const list = (pendingSignals.get(from) ?? []).filter(
        (entry) => now - entry.at <= timings.pendingSignalTtlMs,
      );
      if (list.length < MAX_QUEUED_SIGNALS) list.push({ at: now, data });
      pendingSignals.set(from, list);
      return;
    }
    dispatchSignal(peer, data);
  }

  function dispatchSignal(peer: Peer, data: SignalData): void {
    if (data.kind === "streams") {
      setRemoteStreams(peer, data.streams);
      return;
    }
    if (!peer.link) {
      if (peer.queued.length < MAX_QUEUED_SIGNALS) peer.queued.push(data);
      return;
    }
    // Em série por par: uma descrição termina antes do próximo sinal.
    peer.signalChain = peer.signalChain.then(() => handleSignal(peer, data)).catch(() => undefined);
  }

  async function handleSignal(peer: Peer, data: SignalData): Promise<void> {
    if (closed || peers.get(peer.id) !== peer) return;
    if (data.kind === "candidate") await handleCandidate(peer, data.candidate);
    else if (data.kind === "description") await handleDescription(peer, data.description);
  }

  async function addCandidate(link: Link, candidate: Candidate): Promise<void> {
    try {
      await link.pc.addIceCandidate(candidate ?? undefined);
    } catch {
      // Candidato de uma oferta ignorada ou de uma sessão de ICE anterior.
    }
  }

  async function handleCandidate(peer: Peer, candidate: Candidate): Promise<void> {
    const link = peer.link;
    if (!link) return;
    if (!link.pc.remoteDescription) {
      link.candidates.push(candidate);
      return;
    }
    await addCandidate(link, candidate);
  }

  async function handleDescription(peer: Peer, description: Description): Promise<void> {
    let link = peer.link;
    if (!link) return;
    if (description.type === "offer") {
      // Impressão digital nova = o par recriou a conexão (ou recarregou a página): recria também.
      const previous = sdpFingerprint(link.pc.currentRemoteDescription?.sdp);
      const next = sdpFingerprint(description.sdp);
      if (previous && next && previous !== next) {
        if (peer.state === "connected") setStatus(peer, "reconnecting");
        link = rebuildLink(peer);
      }
    }
    const pc = link.pc;
    const collision = description.type === "offer" && (link.makingOffer || pc.signalingState !== "stable");
    link.ignoreOffer = !peer.polite && collision;
    if (link.ignoreOffer) return;
    try {
      await pc.setRemoteDescription(description);
    } catch {
      return; // resposta fora de hora (ex.: de uma negociação já abandonada)
    }
    if (peer.link !== link) return;
    for (const candidate of link.candidates.splice(0)) await addCandidate(link, candidate);
    if (description.type === "offer") {
      await pc.setLocalDescription();
      if (peer.link !== link) return;
      sendDescription(peer, link);
    }
  }

  // ---------- Vídeos remotos ----------

  function setRemoteStreams(peer: Peer, streams: StreamEntry[]): void {
    peer.remoteStreamIds = new Map(streams.map((entry) => [entry.streamId, entry.videoId]));
    if (peer.link) syncRemoteVideos(peer, peer.link);
  }

  function hideRemoteVideo(peer: Peer, link: Link, streamId: string): void {
    const videoId = link.shownVideos.get(streamId);
    link.remoteStreams.delete(streamId);
    if (videoId === undefined) return;
    link.shownVideos.delete(streamId);
    emitter.emit("remoteVideoRemoved", peer.id, videoId);
  }

  /** Anuncia o vídeo só quando há track de vídeo E o `videoId` do stream (qualquer ordem). */
  function syncRemoteVideos(peer: Peer, link: Link): void {
    for (const [streamId, videoId] of [...link.shownVideos]) {
      if (peer.remoteStreamIds.get(streamId) !== videoId) hideRemoteVideo(peer, link, streamId);
    }
    for (const [streamId, stream] of link.remoteStreams) {
      const videoId = peer.remoteStreamIds.get(streamId);
      if (videoId === undefined || link.shownVideos.has(streamId)) continue;
      if (stream.getVideoTracks().length === 0) continue;
      link.shownVideos.set(streamId, videoId);
      emitter.emit("remoteVideoAdded", { peerId: peer.id, videoId, stream });
    }
  }

  function onTrack(peer: Peer, link: Link, event: RTCTrackEvent): void {
    if (peer.link !== link) return;
    const stream = event.streams[0];
    if (!stream) {
      if (event.track.kind !== "audio") return;
      const voiceStream = env.createMediaStream([event.track]);
      link.voice = { receiver: event.receiver, stream: voiceStream };
      emitter.emit("remoteAudio", peer.id, voiceStream);
      return;
    }
    if (!link.remoteStreams.has(stream.id)) {
      link.remoteStreams.set(stream.id, stream);
      stream.addEventListener(
        "removetrack",
        () => {
          if (peer.link === link && stream.getVideoTracks().length === 0) {
            hideRemoteVideo(peer, link, stream.id);
          }
        },
        { signal: link.abort.signal },
      );
    }
    syncRemoteVideos(peer, link);
  }

  // ---------- Parâmetros de envio ----------

  async function applyVideoSender(sender: RTCRtpSender, pub: Publication, relayed: boolean): Promise<void> {
    const limits = sendLimits(quality, relayQuality, relayed, pub.videoTrack.getSettings());
    const build = (withPreference: boolean): RTCRtpSendParameters | null => {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) return null; // ainda não negociado
      for (const encoding of params.encodings) {
        encoding.maxBitrate = limits.maxBitrate;
        encoding.maxFramerate = limits.maxFramerate;
        encoding.scaleResolutionDownBy = limits.scaleResolutionDownBy;
      }
      if (withPreference) {
        params.degradationPreference = pub.kind === "screen" ? "maintain-resolution" : "maintain-framerate";
      }
      return params;
    };
    const params = build(true);
    if (!params) return;
    try {
      await sender.setParameters(params);
    } catch {
      // Navegador sem `degradationPreference` em `setParameters`: aplica só os tetos.
      const fallback = build(false);
      if (fallback) await sender.setParameters(fallback);
    }
  }

  /** Reaplica os tetos de todos os vídeos deste par (em série, por causa do `transactionId`). */
  function applySenderParams(peer: Peer, link: Link): void {
    link.paramsChain = link.paramsChain
      .then(async () => {
        for (const pub of publications.values()) {
          if (peer.link !== link || closed) return;
          const sender = link.senders.get(pub.videoTrack.id);
          if (sender) await applyVideoSender(sender, pub, peer.relayed).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }

  async function checkRelay(peer: Peer, link: Link): Promise<void> {
    let report: RTCStatsReport;
    try {
      report = await link.pc.getStats();
    } catch {
      return;
    }
    if (peer.link !== link || closed) return;
    const relayed = isRelayedConnection(report);
    if (relayed === peer.relayed) return;
    peer.relayed = relayed;
    emitStatus(peer);
    applySenderParams(peer, link);
  }

  // ---------- Conexões ----------

  function status(peer: Peer): PeerStatus {
    return { peerId: peer.id, state: peer.state, relayed: peer.relayed };
  }

  function emitStatus(peer: Peer): void {
    emitter.emit("peer", status(peer));
  }

  function setStatus(peer: Peer, state: PeerConnectionState): void {
    if (peer.state === state) return;
    peer.state = state;
    emitStatus(peer);
  }

  function clearLinkTimer(link: Link): void {
    if (link.timer !== null) env.clearTimeout(link.timer);
    link.timer = null;
  }

  function addPublication(link: Link, pub: Publication): void {
    for (const track of pub.stream.getTracks()) {
      if (link.senders.has(track.id)) continue;
      link.senders.set(track.id, link.pc.addTrack(track, pub.stream));
    }
  }

  function openLink(peer: Peer): Link {
    const pc = env.createPeerConnection({ iceServers });
    const link: Link = {
      pc,
      abort: new AbortController(),
      makingOffer: false,
      ignoreOffer: false,
      candidates: [],
      senders: new Map(),
      micSender: null,
      remoteStreams: new Map(),
      shownVideos: new Map(),
      voice: null,
      timer: null,
      recovering: false,
      paramsChain: Promise.resolve(),
    };
    peer.link = link;
    const signal = link.abort.signal;

    pc.addEventListener(
      "negotiationneeded",
      async () => {
        // Primeira negociação de um par novo: só a ponta não educada oferece. Se as duas oferecem
        // juntas, a educada desfaz a oferta dela, que já leva o canal de dados, e o Chrome às vezes
        // não consegue responder depois disso ("Failed to start SCTP transport") ou entra numa
        // sequência de renegociações; a conexão ficava parada até o prazo de recriação. A
        // educada responde à oferta da outra e, se ainda faltar algo dela, o navegador pede uma
        // nova negociação ao voltar a `stable`. Ao recriar a conexão as duas voltam a oferecer.
        if (peer.polite && peer.attempts === 0 && !pc.currentRemoteDescription) return;
        try {
          link.makingOffer = true;
          await pc.setLocalDescription();
          if (peer.link === link) sendDescription(peer, link);
        } catch {
          // A colisão ou o fechamento cancelam esta oferta; a negociação segue pela outra ponta.
        } finally {
          link.makingOffer = false;
        }
      },
      { signal },
    );
    pc.addEventListener(
      "icecandidate",
      (event: RTCPeerConnectionIceEvent) => {
        if (peer.link !== link) return;
        const c = event.candidate;
        send(peer.id, {
          kind: "candidate",
          candidate:
            c && c.candidate
              ? {
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex,
                  usernameFragment: c.usernameFragment,
                }
              : null,
        });
      },
      { signal },
    );
    pc.addEventListener("track", (event: RTCTrackEvent) => onTrack(peer, link, event), { signal });
    pc.addEventListener("connectionstatechange", () => onConnectionState(peer, link), { signal });
    pc.addEventListener(
      "iceconnectionstatechange",
      () => {
        const state = pc.iceConnectionState;
        if (peer.link === link && (state === "connected" || state === "completed")) {
          void checkRelay(peer, link);
        }
      },
      { signal },
    );
    pc.addEventListener(
      "signalingstatechange",
      () => {
        if (peer.link === link && pc.signalingState === "stable") applySenderParams(peer, link);
      },
      { signal },
    );

    pc.createDataChannel(DATA_CHANNEL_LABEL, { negotiated: true, id: DATA_CHANNEL_ID });
    if (mic) link.micSender = pc.addTrack(mic.track);
    for (const pub of publications.values()) addPublication(link, pub);
    applySenderParams(peer, link);
    sendStreams(peer);

    link.timer = env.setTimeout(() => {
      link.timer = null;
      if (peer.link === link && pc.connectionState !== "connected") void recreate(peer);
    }, timings.connectTimeoutMs);

    const pending = pendingSignals.get(peer.id) ?? [];
    pendingSignals.delete(peer.id);
    const now = env.now();
    for (const entry of pending) {
      if (now - entry.at <= timings.pendingSignalTtlMs) dispatchSignal(peer, entry.data);
    }
    for (const data of peer.queued.splice(0)) dispatchSignal(peer, data);
    return link;
  }

  function closeLink(peer: Peer): void {
    const link = peer.link;
    if (!link) return;
    peer.link = null;
    link.abort.abort();
    clearLinkTimer(link);
    link.pc.close();
    for (const streamId of [...link.shownVideos.keys()]) hideRemoteVideo(peer, link, streamId);
    if (link.voice) emitter.emit("remoteAudio", peer.id, null);
    speaking.forceOff(peer.id);
  }

  function rebuildLink(peer: Peer): Link {
    closeLink(peer);
    peer.relayed = false;
    return openLink(peer);
  }

  async function recreate(peer: Peer): Promise<void> {
    if (closed || peers.get(peer.id) !== peer) return;
    peer.attempts += 1;
    if (peer.attempts > timings.maxRecreateAttempts) {
      setStatus(peer, "failed");
      return;
    }
    setStatus(peer, "reconnecting");
    const before = peer.link;
    await refreshIceServers();
    if (closed || peers.get(peer.id) !== peer || peer.link !== before) return;
    rebuildLink(peer);
  }

  function startRecovery(peer: Peer, link: Link, delay: number): void {
    if (link.recovering) return;
    link.recovering = true;
    clearLinkTimer(link);
    link.timer = env.setTimeout(() => {
      link.timer = null;
      if (peer.link !== link || link.pc.connectionState === "connected") return;
      try {
        link.pc.restartIce();
      } catch {
        // conexão já fechada
      }
      link.timer = env.setTimeout(() => {
        link.timer = null;
        if (peer.link === link && link.pc.connectionState !== "connected") void recreate(peer);
      }, timings.iceRestartTimeoutMs);
    }, delay);
  }

  function onConnectionState(peer: Peer, link: Link): void {
    if (peer.link !== link) return;
    switch (link.pc.connectionState) {
      case "connected":
        clearLinkTimer(link);
        link.recovering = false;
        peer.attempts = 0;
        setStatus(peer, "connected");
        void checkRelay(peer, link);
        applySenderParams(peer, link);
        break;
      case "disconnected":
        setStatus(peer, "reconnecting");
        startRecovery(peer, link, timings.disconnectedGraceMs);
        break;
      case "failed":
        setStatus(peer, "reconnecting");
        startRecovery(peer, link, 0);
        break;
      default:
        break;
    }
  }

  async function refreshIceServers(): Promise<void> {
    try {
      iceServers = await options.getIceServers();
    } catch {
      // Mantém as últimas credenciais; sem elas a conexão direta (STUN do navegador) ainda pode dar certo.
    }
  }

  function removePeer(peer: Peer): void {
    closeLink(peer);
    peers.delete(peer.id);
    pendingSignals.delete(peer.id);
    speaking.remove(peer.id);
  }

  // ---------- Indicador de fala ----------

  function pollSpeaking(): void {
    const now = env.now();
    const selfLevel =
      mic && !micMuted && mic.track.enabled && mic.track.readyState === "live"
        ? (mic.meter?.level() ?? 0)
        : 0;
    speaking.update(selfId, selfLevel, now);
    for (const peer of peers.values()) {
      const voice = peer.link?.voice;
      let level = 0;
      if (voice) {
        for (const source of voice.receiver.getSynchronizationSources()) {
          level = Math.max(level, source.audioLevel ?? 0);
        }
      }
      speaking.update(peer.id, level, now);
    }
  }

  // ---------- Captura ----------

  async function captureVideo(kind: VideoKind, deviceId: string | undefined): Promise<MediaStream> {
    const limits = {
      width: { max: quality.width },
      height: { max: quality.height },
      frameRate: { max: quality.frameRate },
    };
    if (kind === "screen") {
      if (!env.getDisplayMedia) {
        throw new DOMException("Compartilhamento de tela indisponível", "NotSupportedError");
      }
      // O navegador oferece o áudio da aba ou do sistema quando consegue; a pessoa pode recusar.
      let stream: MediaStream;
      try {
        stream = await env.getDisplayMedia({ video: limits, audio: SCREEN_AUDIO_CONSTRAINTS });
      } catch (error) {
        // Navegador que recusa as opções de áudio: volta ao pedido simples.
        if (!isConstraintError(error)) throw error;
        stream = await env.getDisplayMedia({ video: limits, audio: true });
      }
      await prepareScreenAudio(stream);
      return stream;
    }
    return env.getUserMedia({
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: quality.width, max: quality.width },
        height: { ideal: quality.height, max: quality.height },
        frameRate: { ideal: quality.frameRate, max: quality.frameRate },
      },
      audio: false,
    });
  }

  function unpublish(videoId: string): void {
    const pub = publications.get(videoId);
    if (!pub) return;
    publications.delete(videoId);
    pub.abort.abort();
    for (const peer of peers.values()) {
      const link = peer.link;
      if (!link) continue;
      for (const track of pub.stream.getTracks()) {
        const sender = link.senders.get(track.id);
        if (!sender) continue;
        link.senders.delete(track.id);
        try {
          link.pc.removeTrack(sender);
        } catch {
          // conexão fechada
        }
      }
      sendStreams(peer);
    }
    stopStream(pub.stream);
  }

  // ---------- Interface pública ----------

  return {
    setPeers(peerIds) {
      if (closed) return;
      const wanted = new Set(peerIds.filter((id) => id !== selfId));
      for (const peer of [...peers.values()]) if (!wanted.has(peer.id)) removePeer(peer);
      const added: Peer[] = [];
      for (const id of wanted) {
        if (peers.has(id)) continue;
        const peer: Peer = {
          id,
          polite: selfId > id,
          link: null,
          state: "connecting",
          relayed: false,
          remoteStreamIds: new Map(),
          attempts: 0,
          signalChain: Promise.resolve(),
          queued: [],
        };
        peers.set(id, peer);
        added.push(peer);
        emitStatus(peer);
      }
      if (added.length === 0) return;
      void refreshIceServers().then(() => {
        for (const peer of added) {
          if (!closed && peers.get(peer.id) === peer && !peer.link) openLink(peer);
        }
      });
    },

    async enableMicrophone(deviceId) {
      if (closed) throw new DOMException("Sessão encerrada", "InvalidStateError");
      const request = ++micRequest;
      const stream = await env.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const track = stream.getAudioTracks()[0];
      if (closed || request !== micRequest || !track) {
        stopStream(stream);
        if (!track && !closed && request === micRequest) {
          throw new DOMException("Nenhum microfone", "NotFoundError");
        }
        return;
      }
      if (!mic) micMuted = true; // começa mudo; trocar de aparelho mantém o estado
      track.enabled = !micMuted;
      const previous = mic;
      analyzer ??= env.createAudioAnalyzer();
      mic = { stream, track, meter: analyzer?.measure(stream) ?? null };
      for (const peer of peers.values()) {
        const link = peer.link;
        if (!link) continue;
        if (link.micSender) void link.micSender.replaceTrack(track).catch(() => undefined);
        else link.micSender = link.pc.addTrack(track);
      }
      if (previous) {
        previous.meter?.close();
        stopStream(previous.stream);
      }
    },

    setMicrophoneMuted(muted) {
      micMuted = muted;
      if (mic) mic.track.enabled = !muted;
      if (muted) speaking.forceOff(selfId);
    },

    isMicrophoneMuted() {
      return mic === null || micMuted;
    },

    async publishVideo(videoId, kind, publishOptions?: PublishVideoOptions): Promise<LocalVideo> {
      if (closed) throw new DOMException("Sessão encerrada", "InvalidStateError");
      const existing = publications.get(videoId);
      if (existing) return { videoId, kind: existing.kind, stream: existing.stream };
      const stream = await captureVideo(kind, publishOptions?.deviceId);
      const videoTrack = stream.getVideoTracks()[0];
      const raced = publications.get(videoId);
      if (closed || !videoTrack || raced) {
        stopStream(stream);
        if (raced) return { videoId, kind: raced.kind, stream: raced.stream };
        throw new DOMException(closed ? "Sessão encerrada" : "Nenhum vídeo", "InvalidStateError");
      }
      videoTrack.contentHint = kind === "screen" ? "detail" : "motion";
      const pub: Publication = { videoId, kind, stream, videoTrack, abort: new AbortController() };
      // A pessoa parou pelo navegador (barra "parar de compartilhar", câmera desconectada).
      videoTrack.addEventListener(
        "ended",
        () => {
          if (publications.get(videoId) !== pub) return;
          unpublish(videoId);
          emitter.emit("localVideoEnded", videoId);
        },
        { signal: pub.abort.signal },
      );
      publications.set(videoId, pub);
      for (const peer of peers.values()) {
        const link = peer.link;
        if (!link) continue;
        addPublication(link, pub);
        applySenderParams(peer, link);
        sendStreams(peer);
      }
      return { videoId, kind, stream };
    },

    unpublishVideo(videoId) {
      unpublish(videoId);
    },

    getPeers() {
      return [...peers.values()].map(status);
    },

    getRemoteVideos() {
      const videos: RemoteVideo[] = [];
      for (const peer of peers.values()) {
        const link = peer.link;
        if (!link) continue;
        for (const [streamId, videoId] of link.shownVideos) {
          const stream = link.remoteStreams.get(streamId);
          if (stream) videos.push({ peerId: peer.id, videoId, stream });
        }
      }
      return videos;
    },

    getLocalVideos() {
      return [...publications.values()].map((pub) => ({
        videoId: pub.videoId,
        kind: pub.kind,
        stream: pub.stream,
      }));
    },

    on(event, handler) {
      return emitter.on(event, handler);
    },

    reconnect() {
      if (closed) return;
      void refreshIceServers().then(() => {
        if (closed) return;
        for (const peer of peers.values()) {
          peer.attempts = 0;
          const link = peer.link;
          if (!link) {
            openLink(peer);
          } else if (peer.state === "connected" && link.pc.connectionState === "connected") {
            // A conexão direta sobreviveu à queda do WebSocket: só renova as credenciais.
            try {
              link.pc.setConfiguration({ ...link.pc.getConfiguration(), iceServers });
            } catch {
              // configuração recusada; segue com a anterior
            }
            sendStreams(peer);
          } else {
            setStatus(peer, "reconnecting");
            rebuildLink(peer);
          }
        }
      });
    },

    close() {
      if (closed) return;
      closed = true;
      emitter.clear();
      env.clearInterval(pollTimer);
      unsubscribe();
      for (const peer of [...peers.values()]) removePeer(peer);
      for (const pub of [...publications.values()]) {
        pub.abort.abort();
        stopStream(pub.stream);
      }
      publications.clear();
      if (mic) {
        mic.meter?.close();
        stopStream(mic.stream);
        mic = null;
      }
      analyzer?.close();
      analyzer = null;
      pendingSignals.clear();
      speaking.clear();
    },
  };
}
