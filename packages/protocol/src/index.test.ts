import { describe, expect, it } from "vitest";
import {
  clientMessageSchema,
  healthResponseSchema,
  joinRoomRequestSchema,
  roomCodeSchema,
  serverMessageSchema,
  WS_PING_FRAME,
} from "./index";

describe("healthResponseSchema", () => {
  it("aceita a resposta esperada", () => {
    const parsed = healthResponseSchema.parse({ status: "ok", commit: "abc123", environment: "staging" });
    expect(parsed.commit).toBe("abc123");
  });

  it("recusa ambiente desconhecido e commit vazio", () => {
    const badEnvironment = { status: "ok", commit: "x", environment: "prod" };
    const emptyCommit = { status: "ok", commit: "", environment: "staging" };
    expect(healthResponseSchema.safeParse(badEnvironment).success).toBe(false);
    expect(healthResponseSchema.safeParse(emptyCommit).success).toBe(false);
  });
});

describe("sala", () => {
  it("valida o código da sala", () => {
    expect(roomCodeSchema.safeParse("abcdefgh23").success).toBe(true);
    expect(roomCodeSchema.safeParse("abcdefgh2").success).toBe(false);
    expect(roomCodeSchema.safeParse("ABCDEFGH23").success).toBe(false);
    expect(roomCodeSchema.safeParse("abcdefgh0l").success).toBe(false);
  });

  it("apara o apelido e aplica os limites", () => {
    const ok = joinRoomRequestSchema.parse({ nickname: "  Ana  ", turnstileToken: "t" });
    expect(ok.nickname).toBe("Ana");
    expect(joinRoomRequestSchema.safeParse({ nickname: " a ", turnstileToken: "t" }).success).toBe(false);
    expect(joinRoomRequestSchema.safeParse({ nickname: "a".repeat(25), turnstileToken: "t" }).success).toBe(
      false,
    );
  });

  it("recusa mensagens fora do protocolo", () => {
    expect(clientMessageSchema.safeParse({ type: "chat.send", text: "oi" }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "chat.send", text: "   " }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "chat.send", text: "a".repeat(2001) }).success).toBe(false);
    // Qual reação a pessoa pode enviar é decisão do servidor (pacotes equipados); o esquema só limita o tamanho.
    expect(clientMessageSchema.safeParse({ type: "reaction.send", reaction: "" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "reaction.send", reaction: "x".repeat(17) }).success).toBe(
      false,
    );
    const gift = { type: "gift.send", requestId: "g1", to: "p2" };
    expect(clientMessageSchema.safeParse({ ...gift, amount: 100 }).success).toBe(true);
    for (const amount of [0, -1, 1.5, 2001]) {
      expect(clientMessageSchema.safeParse({ ...gift, amount }).success).toBe(false);
    }
    expect(clientMessageSchema.safeParse({ type: "unknown" }).success).toBe(false);
    expect(serverMessageSchema.safeParse({ type: "video.denied", requestId: "r", reason: "x" }).success).toBe(
      false,
    );
  });

  it("o quadro de ping é uma mensagem válida do cliente", () => {
    expect(clientMessageSchema.safeParse(JSON.parse(WS_PING_FRAME)).success).toBe(true);
  });
});
