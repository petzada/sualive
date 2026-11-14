import type { SignalData } from "@sualive/protocol";

/**
 * Filtro de candidatos ICE da sala protegida (entrega 4): nenhum participante pode receber o IP de
 * outro. Na sinalização, o Durable Object só deixa passar candidatos de retransmissão (`typ relay`),
 * avulsos ou dentro do SDP, nos dois sentidos. Além disso:
 *
 * - o endereço relacionado (`raddr`/`rport`) de um candidato de retransmissão é o IP público de quem
 *   o gerou (o Firefox o informa): vira `0.0.0.0 0`;
 * - as linhas `c=` e `a=rtcp:` do SDP levam o endereço do candidato padrão: viram `0.0.0.0` (o mesmo
 *   valor que o navegador usa antes de reunir candidatos; a conexão de fato sai dos candidatos).
 *
 * Funções puras, testadas sem o Durable Object.
 */

const ZERO_IPV4 = "0.0.0.0";

/** Divide a linha do candidato (com ou sem `a=` e `candidate:`) em campos. */
function tokens(line: string): string[] {
  return line.trim().split(/\s+/);
}

/** Tipo do candidato (`host`, `srflx`, `prflx`, `relay`), ou `null` se a linha não é um candidato válido. */
export function candidateType(line: string): string | null {
  const parts = tokens(line);
  if (parts.length < 8 || !/^(a=)?candidate:/i.test(parts[0]!)) return null;
  const typ = parts.indexOf("typ");
  // foundation, componente, transporte, prioridade, endereço, porta vêm antes de `typ`.
  if (typ < 6 || typ + 1 >= parts.length) return null;
  return parts[typ + 1]!.toLowerCase();
}

/** O candidato é de retransmissão? */
export function isRelayCandidate(line: string): boolean {
  return candidateType(line) === "relay";
}

/** Candidato de retransmissão com o endereço relacionado apagado; `null` se não é de retransmissão. */
export function sanitizeRelayCandidate(line: string): string | null {
  if (!isRelayCandidate(line)) return null;
  const parts = tokens(line);
  const raddr = parts.indexOf("raddr");
  if (raddr >= 0 && raddr + 1 < parts.length) parts[raddr + 1] = ZERO_IPV4;
  const rport = parts.indexOf("rport");
  if (rport >= 0 && rport + 1 < parts.length) parts[rport + 1] = "0";
  return parts.join(" ");
}

/**
 * SDP só com candidatos de retransmissão: tira as linhas `a=candidate` dos outros tipos, apaga o
 * endereço relacionado e zera os endereços das linhas `c=` e `a=rtcp:`. Mantém o fim de linha.
 */
export function filterSdp(sdp: string): string {
  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const out: string[] = [];
  for (const line of sdp.split(/\r?\n/)) {
    if (/^a=candidate:/i.test(line)) {
      const relay = sanitizeRelayCandidate(line);
      if (relay !== null) out.push(relay);
      continue;
    }
    if (/^c=IN IP[46] /i.test(line)) {
      out.push(`c=IN IP4 ${ZERO_IPV4}`);
      continue;
    }
    const rtcp = /^a=rtcp:(\d+)( IN IP[46] \S+)?/i.exec(line);
    if (rtcp) {
      out.push(rtcp[2] ? `a=rtcp:${rtcp[1]} IN IP4 ${ZERO_IPV4}` : line);
      continue;
    }
    out.push(line);
  }
  return out.join(eol);
}

/**
 * Sinal como pode ser repassado na sala protegida, ou `null` se deve ser descartado (candidato que
 * não é de retransmissão). O fim dos candidatos (`candidate: null`) e os outros sinais passam.
 */
export function protectedSignal(data: SignalData): SignalData | null {
  if (data.kind === "candidate") {
    if (data.candidate === null) return data;
    // Candidato vazio também marca o fim dos candidatos (alguns navegadores mandam assim).
    if (data.candidate.candidate.trim() === "") return data;
    const relay = sanitizeRelayCandidate(data.candidate.candidate);
    return relay === null ? null : { ...data, candidate: { ...data.candidate, candidate: relay } };
  }
  if (data.kind === "description" && data.description.sdp !== undefined) {
    return { ...data, description: { ...data.description, sdp: filterSdp(data.description.sdp) } };
  }
  return data;
}
