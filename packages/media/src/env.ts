/**
 * Tudo o que a malha usa do navegador passa por aqui. Os testes trocam este ambiente por dublês em
 * memória (WebRTC, câmera e Web Audio não existem no Node).
 */

export type TimerHandle = ReturnType<typeof setTimeout>;

/** Nível de áudio (RMS linear de 0 a 1) de um stream de microfone. */
export interface AudioMeter {
  level(): number;
  close(): void;
}

/** Fábrica de medidores; dona do `AudioContext`. */
export interface AudioAnalyzer {
  measure(stream: MediaStream): AudioMeter | null;
  close(): void;
}

export interface MediaEnvironment {
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  createMediaStream(tracks: MediaStreamTrack[]): MediaStream;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  /** Ausente quando o navegador não compartilha tela. */
  getDisplayMedia: ((options: DisplayMediaStreamOptions) => Promise<MediaStream>) | undefined;
  /** `null` quando não há Web Audio. */
  createAudioAnalyzer(): AudioAnalyzer | null;
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

/** Tamanho da janela do `AnalyserNode` (amostras); só afeta a suavidade do medidor. */
const ANALYSER_FFT_SIZE = 512;

function createWebAudioAnalyzer(): AudioAnalyzer | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  let context: AudioContext | null = null;
  return {
    measure(stream) {
      if (stream.getAudioTracks().length === 0) return null;
      context ??= new Context();
      // Criado fora de um gesto da pessoa, o contexto nasce suspenso.
      void context.resume().catch(() => undefined);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      return {
        level() {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          return Math.sqrt(sum / samples.length);
        },
        close() {
          source.disconnect();
          analyser.disconnect();
        },
      };
    },
    close() {
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}

function unavailable(what: string): Promise<never> {
  return Promise.reject(new DOMException(`${what} indisponível neste navegador`, "NotSupportedError"));
}

export function browserEnvironment(): MediaEnvironment {
  const devices = globalThis.navigator?.mediaDevices as Partial<MediaDevices> | undefined;
  const getDisplayMedia = devices?.getDisplayMedia;
  return {
    createPeerConnection: (config) => new RTCPeerConnection(config),
    createMediaStream: (tracks) => new MediaStream(tracks),
    getUserMedia: (constraints) =>
      devices?.getUserMedia ? devices.getUserMedia(constraints) : unavailable("getUserMedia"),
    getDisplayMedia:
      typeof getDisplayMedia === "function" ? (options) => getDisplayMedia.call(devices, options) : undefined,
    createAudioAnalyzer: createWebAudioAnalyzer,
    now: () => performance.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle),
  };
}

export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
