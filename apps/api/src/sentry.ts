import type { CloudflareOptions } from "@sentry/cloudflare";
import type { AppEnv } from "./env";

/** Opções do Sentry a partir do ambiente. Sem `SENTRY_DSN`, o SDK fica desligado. */
export function sentryOptions(env: AppEnv): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    release: env.COMMIT_SHA,
    environment: env.ENVIRONMENT,
  };
}
