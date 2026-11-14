import * as Sentry from "@sentry/react";

/** Starts Sentry only when a DSN was provided at build time. No replay, no tracing. */
export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    release: import.meta.env.VITE_COMMIT_SHA || undefined,
    environment: import.meta.env.VITE_ENVIRONMENT || undefined,
  });
}
