import { captureException } from "@sentry/cloudflare";
import { healthResponseSchema } from "@sualive/protocol";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";

export const app = new Hono<{ Bindings: AppEnv }>();

app.get("/api/health", (c) => {
  const body = healthResponseSchema.parse({
    status: "ok",
    commit: c.env.COMMIT_SHA,
    environment: c.env.ENVIRONMENT,
  });
  return c.json(body);
});

// Erro proposital para validar o Sentry. Só existe com DEBUG_ROUTES="1" (homologação).
app.get("/api/debug/error", (c) => {
  if (c.env.DEBUG_ROUTES !== "1") return c.notFound();
  throw new Error("Erro proposital de /api/debug/error");
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // O Hono trata o erro antes do `withSentry`, então o envio ao Sentry é explícito.
  captureException(err);
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});
