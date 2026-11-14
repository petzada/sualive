import type { MediaEnvironment, TimerHandle } from "./env";
import { stopStream } from "./env";
import type { DevicePreview } from "./types";

/** Atualização do medidor de microfone (ms). */
const LEVEL_INTERVAL_MS = 50;
/** Faixa do medidor em dB: abaixo disso é 0, 0 dBFS é 1. */
const LEVEL_FLOOR_DB = -60;

/** RMS linear → 0..1 em escala de dB, que acompanha melhor o ouvido. */
export function meterLevel(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB));
}

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

async function requestDevices(env: MediaEnvironment): Promise<MediaStream[]> {
  try {
    // Um pedido só: o navegador mostra uma única permissão para os dois.
    return [await env.getUserMedia({ audio: MIC_CONSTRAINTS, video: true })];
  } catch {
    // Falta um dos aparelhos ou a pessoa negou um deles: tenta cada um sozinho.
    const results = await Promise.allSettled([
      env.getUserMedia({ audio: MIC_CONSTRAINTS }),
      env.getUserMedia({ video: true }),
    ]);
    return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }
}

export async function createDevicePreviewWith(env: MediaEnvironment): Promise<DevicePreview> {
  const streams = await requestDevices(env);
  const audioTracks = streams.flatMap((stream) => stream.getAudioTracks());
  const videoTracks = streams.flatMap((stream) => stream.getVideoTracks());
  const micStream = audioTracks.length > 0 ? env.createMediaStream(audioTracks) : null;
  const cameraStream = videoTracks.length > 0 ? env.createMediaStream(videoTracks) : null;
  const analyzer = micStream ? env.createAudioAnalyzer() : null;
  const meter = micStream && analyzer ? analyzer.measure(micStream) : null;
  const handlers = new Set<(level: number) => void>();
  let timer: TimerHandle | null = null;
  let stopped = false;

  function tick(): void {
    const level = meterLevel(meter?.level() ?? 0);
    for (const handler of [...handlers]) handler(level);
  }

  return {
    cameraStream,
    hasMicrophone: micStream !== null,
    onMicrophoneLevel(handler) {
      if (stopped) return () => undefined;
      handlers.add(handler);
      timer ??= env.setInterval(tick, LEVEL_INTERVAL_MS);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0 && timer !== null) {
          env.clearInterval(timer);
          timer = null;
        }
      };
    },
    stop() {
      if (stopped) return;
      stopped = true;
      handlers.clear();
      if (timer !== null) env.clearInterval(timer);
      timer = null;
      meter?.close();
      analyzer?.close();
      for (const stream of streams) stopStream(stream);
    },
  };
}
