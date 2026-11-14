import type { VideoQuality } from "@sualive/config";

/** Impressão digital DTLS da descrição. Muda quando o par recriou a conexão do lado dele. */
export function sdpFingerprint(sdp: string | undefined): string | null {
  if (!sdp) return null;
  const match = /^a=fingerprint:(.+)$/m.exec(sdp);
  return match?.[1]?.trim() ?? null;
}

interface StatsEntry {
  type?: string;
  selectedCandidatePairId?: string;
  selected?: boolean;
  nominated?: boolean;
  state?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
}

/** O par de candidatos em uso passa por TURN (em qualquer ponta)? */
export function isRelayedConnection(report: RTCStatsReport): boolean {
  const entries: StatsEntry[] = [];
  report.forEach((value: StatsEntry) => entries.push(value));
  const byId = (id: string | undefined): StatsEntry | undefined =>
    id === undefined ? undefined : (report.get(id) as StatsEntry | undefined);

  let pair: StatsEntry | undefined;
  for (const entry of entries) {
    if (entry.type === "transport" && entry.selectedCandidatePairId) {
      pair = byId(entry.selectedCandidatePairId);
      if (pair) break;
    }
  }
  // Firefox marca o par em uso no próprio `candidate-pair`.
  pair ??= entries.find(
    (entry) =>
      entry.type === "candidate-pair" &&
      (entry.selected === true || (entry.nominated === true && entry.state === "succeeded")),
  );
  if (!pair) return false;
  return (
    byId(pair.localCandidateId)?.candidateType === "relay" ||
    byId(pair.remoteCandidateId)?.candidateType === "relay"
  );
}

export interface SendLimits {
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

/**
 * Teto de envio de um vídeo para um par: a qualidade da pessoa e, se a conexão é retransmitida, também
 * a de retransmissão. A redução de resolução compara lado maior com lado maior (webcam em pé).
 */
export function sendLimits(
  quality: VideoQuality,
  relayQuality: VideoQuality,
  relayed: boolean,
  settings: { width?: number | undefined; height?: number | undefined },
): SendLimits {
  const target: VideoQuality = relayed
    ? {
        width: Math.min(quality.width, relayQuality.width),
        height: Math.min(quality.height, relayQuality.height),
        frameRate: Math.min(quality.frameRate, relayQuality.frameRate),
        maxBitrate: Math.min(quality.maxBitrate, relayQuality.maxBitrate),
      }
    : quality;
  const width = settings.width ?? target.width;
  const height = settings.height ?? target.height;
  const scale = Math.max(
    1,
    Math.max(width, height) / Math.max(target.width, target.height),
    Math.min(width, height) / Math.min(target.width, target.height),
  );
  return { maxBitrate: target.maxBitrate, maxFramerate: target.frameRate, scaleResolutionDownBy: scale };
}
