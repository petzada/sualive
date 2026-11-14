import { describe, expect, it } from "vitest";
import { candidateType, filterSdp, protectedSignal } from "../src/room/ice";

const host = "candidate:1 1 udp 2122260223 192.168.0.10 50000 typ host generation 0";
const srflx = "candidate:2 1 udp 1686052607 203.0.113.7 50001 typ srflx raddr 192.168.0.10 rport 50000";
const prflx =
  "candidate:3 1 tcp 1845501695 198.51.100.4 9 typ prflx raddr 192.168.0.10 rport 9 tcptype active";
const relay = "candidate:4 1 udp 41885439 104.30.0.1 60000 typ relay raddr 203.0.113.7 rport 50001";
const relayV6 = "candidate:5 1 udp 41885439 2606:4700::1 60000 typ relay raddr :: rport 0";

describe("filtro de candidatos da sala protegida", () => {
  it("reconhece o tipo de cada candidato e recusa linha malformada", () => {
    expect([host, srflx, prflx, relay, relayV6].map(candidateType)).toEqual([
      "host",
      "srflx",
      "prflx",
      "relay",
      "relay",
    ]);
    expect(candidateType(`a=${relay}`)).toBe("relay");
    expect(candidateType("candidate:1 1 udp typ relay")).toBeNull();
    expect(candidateType("lixo typ relay")).toBeNull();
  });

  it("candidato avulso: só o de retransmissão passa, sem o endereço relacionado", () => {
    const wrap = (candidate: string) => ({
      kind: "candidate" as const,
      candidate: { candidate, sdpMid: "0" },
    });
    expect(protectedSignal(wrap(host))).toBeNull();
    expect(protectedSignal(wrap(srflx))).toBeNull();
    expect(protectedSignal(wrap(prflx))).toBeNull();
    expect(protectedSignal(wrap(relay))).toEqual(
      wrap("candidate:4 1 udp 41885439 104.30.0.1 60000 typ relay raddr 0.0.0.0 rport 0"),
    );
    expect(protectedSignal({ kind: "candidate", candidate: null })).toEqual({
      kind: "candidate",
      candidate: null,
    });
    const streams = { kind: "streams" as const, streams: [] };
    expect(protectedSignal(streams)).toBe(streams);
  });

  it("SDP: tira os candidatos que não são de retransmissão e zera c= e a=rtcp", () => {
    const sdp = [
      "v=0",
      "c=IN IP6 2001:db8::1",
      "a=rtcp:9 IN IP4 203.0.113.7",
      `a=${host}`,
      `a=${relay}`,
      "",
    ].join("\n");
    expect(filterSdp(sdp)).toBe(
      [
        "v=0",
        "c=IN IP4 0.0.0.0",
        "a=rtcp:9 IN IP4 0.0.0.0",
        "a=candidate:4 1 udp 41885439 104.30.0.1 60000 typ relay raddr 0.0.0.0 rport 0",
        "",
      ].join("\n"),
    );
  });
});
