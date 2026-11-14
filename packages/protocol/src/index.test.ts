import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./index";

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
