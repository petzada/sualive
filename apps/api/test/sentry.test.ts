import type * as Sentry from "@sentry/cloudflare";
import { captureException } from "@sentry/cloudflare";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { sentryOptions } from "../src/sentry";

vi.mock("@sentry/cloudflare", async (importOriginal) => ({
  ...(await importOriginal<typeof Sentry>()),
  captureException: vi.fn(),
}));

afterEach(() => {
  vi.mocked(captureException).mockClear();
});

describe("sentryOptions", () => {
  it("não coleta o corpo das requisições (CPF) nem o IP de quem chamou", () => {
    const options = sentryOptions({ ...env, SENTRY_DSN: "https://chave@o0.ingest.sentry.io/0" });

    expect(options.enabled).toBe(true);
    expect(options.dataCollection).toEqual({ httpBodies: [], userInfo: false });
  });
});

describe("erros não tratados", () => {
  it("são enviados ao Sentry", async () => {
    const response = await app.request("/api/debug/error", {}, { ...env, DEBUG_ROUTES: "1" });

    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
    expect(vi.mocked(captureException).mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("404 não vai para o Sentry", async () => {
    const response = await app.request("/api/nao-existe", {}, env);

    expect(response.status).toBe(404);
    expect(captureException).not.toHaveBeenCalled();
  });
});
