import type { VideoQuality } from "@sualive/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectMediaCapabilities } from "./capabilities";
import { createDevicePreviewWith, meterLevel } from "./preview";
import { createSpeakingDetector } from "./speaking";
import { createFakeEnv, type FakeTrack } from "./testing/fakes";
import { isRelayedConnection, sdpFingerprint, sendLimits } from "./webrtc-utils";

const QUALITY: VideoQuality = { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 };
const RELAY: VideoQuality = { width: 640, height: 360, frameRate: 24, maxBitrate: 500_000 };

describe("sendLimits", () => {
  it("conexão direta usa a qualidade da pessoa", () => {
    expect(sendLimits(QUALITY, RELAY, false, { width: 1280, height: 720 })).toEqual({
      maxBitrate: 1_500_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
  });

  it("retransmitida usa o menor teto e reduz a resolução", () => {
    expect(sendLimits(QUALITY, RELAY, true, { width: 1280, height: 720 })).toEqual({
      maxBitrate: 500_000,
      maxFramerate: 24,
      scaleResolutionDownBy: 2,
    });
  });

  it("webcam em pé compara lado maior com lado maior", () => {
    expect(sendLimits(QUALITY, RELAY, true, { width: 720, height: 1280 }).scaleResolutionDownBy).toBe(2);
  });

  it("captura maior que o teto também é reduzida no envio", () => {
    expect(sendLimits(QUALITY, RELAY, false, { width: 2560, height: 1440 }).scaleResolutionDownBy).toBe(2);
  });
});

describe("isRelayedConnection", () => {
  const report = (entries: Record<string, unknown>[]): RTCStatsReport =>
    new Map(entries.map((e) => [e.id as string, e])) as unknown as RTCStatsReport;

  it("lê o par selecionado do transporte", () => {
    expect(
      isRelayedConnection(
        report([
          { id: "T", type: "transport", selectedCandidatePairId: "P" },
          { id: "P", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R" },
          { id: "L", type: "local-candidate", candidateType: "relay" },
          { id: "R", type: "remote-candidate", candidateType: "host" },
        ]),
      ),
    ).toBe(true);
  });

  it("aceita o par marcado como selecionado (Firefox)", () => {
    expect(
      isRelayedConnection(
        report([
          { id: "P", type: "candidate-pair", selected: true, localCandidateId: "L", remoteCandidateId: "R" },
          { id: "L", type: "local-candidate", candidateType: "srflx" },
          { id: "R", type: "remote-candidate", candidateType: "relay" },
        ]),
      ),
    ).toBe(true);
  });

  it("sem par em uso não é retransmissão", () => {
    expect(isRelayedConnection(report([]))).toBe(false);
  });
});

describe("sdpFingerprint", () => {
  it("extrai a impressão digital DTLS", () => {
    expect(sdpFingerprint("v=0\r\na=fingerprint:sha-256 AB:CD\r\na=setup:actpass")).toBe("sha-256 AB:CD");
    expect(sdpFingerprint(undefined)).toBeNull();
  });
});

describe("indicador de fala", () => {
  it("liga acima do limite, segura nas pausas curtas e desliga depois do prazo", () => {
    const changes: [string, boolean][] = [];
    const detector = createSpeakingDetector((id, s) => changes.push([id, s]), {
      on: 0.1,
      off: 0.05,
      holdMs: 500,
    });
    detector.update("x", 0.07, 0); // entre os limites: não liga
    expect(changes).toEqual([]);
    detector.update("x", 0.2, 100);
    detector.update("x", 0.07, 200); // entre os limites: continua
    detector.update("x", 0, 600);
    expect(changes).toEqual([["x", true]]);
    detector.update("x", 0, 700);
    expect(changes).toEqual([
      ["x", true],
      ["x", false],
    ]);
    detector.update("x", 0.2, 800);
    detector.forceOff("x");
    expect(changes.at(-1)).toEqual(["x", false]);
  });
});

describe("getMediaCapabilities", () => {
  const devices = { getUserMedia: () => undefined, getDisplayMedia: () => undefined };

  it("computador com getDisplayMedia compartilha tela", () => {
    expect(
      detectMediaCapabilities({
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140",
        mediaDevices: devices,
      }),
    ).toEqual({ canShareScreen: true, canUseCamera: true });
  });

  it("celular não mostra compartilhar tela", () => {
    expect(
      detectMediaCapabilities({ userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile", mediaDevices: devices })
        .canShareScreen,
    ).toBe(false);
    expect(
      detectMediaCapabilities({ userAgent: "x", userAgentData: { mobile: true }, mediaDevices: devices })
        .canShareScreen,
    ).toBe(false);
    expect(
      detectMediaCapabilities({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari",
        maxTouchPoints: 5,
        mediaDevices: devices,
      }).canShareScreen,
    ).toBe(false);
  });

  it("sem getDisplayMedia não compartilha tela", () => {
    expect(
      detectMediaCapabilities({ userAgent: "Windows", mediaDevices: { getUserMedia: () => undefined } }),
    ).toEqual({ canShareScreen: false, canUseCamera: true });
    expect(detectMediaCapabilities(undefined)).toEqual({ canShareScreen: false, canUseCamera: false });
  });
});

describe("prévia de aparelhos", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra câmera e nível do microfone; stop solta tudo", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const fake = createFakeEnv();
    const preview = await createDevicePreviewWith(fake.env);
    expect(fake.userMediaCalls).toHaveLength(1); // um pedido só para os dois
    expect(preview.hasMicrophone).toBe(true);
    expect(preview.cameraStream?.getVideoTracks()).toHaveLength(1);

    const levels: number[] = [];
    const cancel = preview.onMicrophoneLevel((level) => levels.push(level));
    (fake.captured.find((t) => t.kind === "audio") as FakeTrack).level = 0.1;
    await vi.advanceTimersByTimeAsync(100);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.at(-1)).toBeCloseTo(meterLevel(0.1));
    cancel();
    expect(vi.getTimerCount()).toBe(0);

    preview.onMicrophoneLevel(() => undefined);
    preview.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(fake.captured.every((t) => t.readyState === "ended")).toBe(true);
    expect(fake.closedMeters).toBe(1);
    expect(fake.closedAnalyzers).toBe(1);
  });

  it("tolera câmera negada", async () => {
    const fake = createFakeEnv({ deny: { video: true } });
    const preview = await createDevicePreviewWith(fake.env);
    expect(preview.cameraStream).toBeNull();
    expect(preview.hasMicrophone).toBe(true);
    preview.stop();
  });

  it("tolera os dois negados", async () => {
    const fake = createFakeEnv({ deny: { video: true, audio: true } });
    const preview = await createDevicePreviewWith(fake.env);
    expect(preview.cameraStream).toBeNull();
    expect(preview.hasMicrophone).toBe(false);
    preview.stop();
  });

  it("medidor em escala de dB", () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(1)).toBe(1);
    expect(meterLevel(0.001)).toBeCloseTo(0);
    expect(meterLevel(0.0316)).toBeCloseTo(0.5, 1);
  });
});
