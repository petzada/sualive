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

/**
 * Records a failed Turnstile check with Cloudflare's error code only (e.g. "110200", "300030",
 * "timeout", "unsupported", "script"): evidence for the next investigation, no personal data.
 * Does nothing when Sentry was not started.
 */
export function reportTurnstileError(code: string): void {
  Sentry.captureMessage("turnstile_error", { level: "warning", tags: { turnstile_error: code } });
}
