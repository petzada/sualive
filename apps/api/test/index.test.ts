import { healthResponseSchema } from "@sualive/protocol";
import { env, exports } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { RoomBase } from "../src/room";

async function fetchWith(path: string, overrides: Partial<Env> = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(
    new Request(`https://sualive.test${path}`) as Request<unknown, IncomingRequestCfProperties>,
    { ...env, ...overrides },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

describe("GET /api/health", () => {
  it("devolve o esquema do protocolo com o commit e o ambiente das vars", async () => {
    const response = await exports.default.fetch("https://sualive.test/api/health");

    expect(response.status).toBe(200);
    const body = healthResponseSchema.parse(await response.json());
    expect(body).toEqual({ status: "ok", commit: env.COMMIT_SHA, environment: env.ENVIRONMENT });
  });

  it("reflete o commit publicado", async () => {
    const response = await fetchWith("/api/health", { COMMIT_SHA: "abc1234" });
    expect(await response.json()).toMatchObject({ commit: "abc1234" });
  });
});

describe("GET /api/debug/error", () => {
  it("lança erro e responde 500 genérico com DEBUG_ROUTES=1", async () => {
    const response = await fetchWith("/api/debug/error", { DEBUG_ROUTES: "1" });

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "internal_error" });
    expect(text).not.toContain("Erro proposital");
    expect(text).not.toContain("at ");
  });

  it("responde 404 com DEBUG_ROUTES=0", async () => {
    const response = await fetchWith("/api/debug/error", { DEBUG_ROUTES: "0" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});

describe("rotas desconhecidas", () => {
  it("respondem 404 em JSON", async () => {
    const response = await exports.default.fetch("https://sualive.test/api/nao-existe");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});

describe("Durable Object Room", () => {
  it("o binding ROOM resolve um stub da classe Room", async () => {
    const stub = env.ROOM.getByName("sala-de-teste");

    const isRoom = await runInDurableObject(stub, (instance) => instance instanceof RoomBase);
    expect(isRoom).toBe(true);
  });
});
