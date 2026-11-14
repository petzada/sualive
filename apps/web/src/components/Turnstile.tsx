import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { createPortal } from "react-dom";
import { reportTurnstileError } from "../monitoring";

/** Official script, explicit rendering. The only third-party script the screens load. */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Cloudflare's public test key of the invisible kind, which always passes; used when no site key is configured. */
const TEST_SITE_KEY = "1x00000000000000000000BB";

interface TurnstileRenderOptions {
  sitekey: string;
  /** `execute`: rendering runs nothing; the check only starts at `turnstile.execute()`. */
  execution: "execute";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  /** Receives Cloudflare's error code (e.g. "110200", "300030"). */
  "error-callback": (code?: string) => boolean;
  "unsupported-callback": () => void;
  /** Cloudflare demands an interaction: from here the widget has something to show. */
  "before-interactive-callback": () => void;
  /** The interaction is over (passed or not). */
  "after-interactive-callback": () => void;
  /** `never`: no token, challenge or retry is ever asked for without an action of the person. */
  "refresh-expired": "never";
  "refresh-timeout": "never";
  retry: "never";
  theme: "light";
  language: string;
  size: "flexible";
  appearance: "interaction-only";
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | null | undefined;
  execute(container: HTMLElement | string): void;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const fail = (script: HTMLScriptElement) => {
      scriptPromise = null; // lets the next action try again
      script.remove();
      reject(new Error("Turnstile script failed to load"));
    };
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (!window.turnstile) return fail(script);
      scriptPromise = null; // loaded: from here `window.turnstile` answers
      resolve(window.turnstile);
    };
    script.onerror = () => fail(script);
    document.head.append(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /**
   * Runs the check now, on an action of the person. Asks Cloudflare for exactly one token, which
   * arrives through `onToken` (or the failure through `onError`). Does nothing while a check runs.
   */
  execute(): void;
}

interface TurnstileProps {
  /** The token of the check that was asked for, or `null` when it expired. */
  onToken: (token: string | null) => void;
  /** The check failed, timed out, is not supported, or the script could not be loaded. */
  onError: () => void;
  ref?: Ref<TurnstileHandle>;
}

/**
 * `idle`: nothing asked; nothing on screen and every click goes through. `pending`: the person
 * asked and there is no token yet; whatever Cloudflare draws is visible and takes clicks, even if
 * it never says that it demands an interaction. `interactive`: Cloudflare demands an interaction;
 * the widget sits over the veil.
 */
type Phase = "idle" | "pending" | "interactive";

/**
 * The Turnstile check, run on demand. The widget is rendered when the screen mounts in the
 * `execute` mode, which asks Cloudflare for nothing; the check (and the only token) starts at
 * `execute()`, called on the person's click. After the token (or a failure) the widget is reset,
 * which in this mode clears it (and the "success" Cloudflare leaves drawn) without starting a new
 * check: the next one only runs at the next `execute()`.
 */
export function Turnstile({ onToken, onError, ref }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const handlersRef = useRef({ onToken, onError });
  // A check asked for and not finished yet (token, failure or timeout).
  const runningRef = useRef(false);
  // Asked for before the widget was rendered (script still loading): runs as soon as it is.
  const queuedRef = useRef(false);
  // Bumped to load the script again, on an action, after a failed load.
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    handlersRef.current = { onToken, onError };
  });

  useImperativeHandle(
    ref,
    () => ({
      execute() {
        if (runningRef.current) return;
        runningRef.current = true;
        setPhase("pending");
        const api = apiRef.current;
        const container = containerRef.current;
        if (api && container && widgetIdRef.current !== null) {
          api.execute(container);
        } else {
          queuedRef.current = true;
          // Not rendered. Still loading: renders and runs when it loads. Otherwise (the load or the
          // render failed) this loads and renders it again.
          const loading = scriptPromise !== null && !window.turnstile;
          if (!loading) setAttempt((current) => current + 1);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let rendered: { api: TurnstileApi; widgetId: string } | null = null;

    /** Ends the check that was running, then clears the widget for the next one. */
    const settle = (api: TurnstileApi, reset: boolean) => {
      runningRef.current = false;
      queuedRef.current = false;
      setPhase("idle");
      // Outside Cloudflare's own callback. In the `execute` mode a reset asks for nothing.
      if (reset) {
        setTimeout(() => {
          if (!cancelled && widgetIdRef.current !== null) api.reset(widgetIdRef.current);
        });
      }
    };

    const fail = (api: TurnstileApi | null, code: string, reset: boolean) => {
      // Nobody asked, or a duplicate of a failure already handled (Cloudflare may call again).
      if (!runningRef.current) return;
      reportTurnstileError(code);
      if (api) settle(api, reset);
      else {
        runningRef.current = false;
        queuedRef.current = false;
        setPhase("idle");
      }
      handlersRef.current.onToken(null);
      handlersRef.current.onError();
    };

    loadTurnstile()
      .then((api) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        let widgetId: string | null | undefined;
        try {
          widgetId = api.render(container, {
            sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY,
            execution: "execute",
            callback: (token) => {
              if (!runningRef.current) return; // never a token nobody asked for
              settle(api, true);
              handlersRef.current.onToken(token);
            },
            // The widget is reset as soon as the token arrives, so this is only a safety net: the
            // token is dropped and no new one is asked for ("refresh-expired": "never").
            "expired-callback": () => handlersRef.current.onToken(null),
            "timeout-callback": () => fail(api, "timeout", true),
            "error-callback": (code) => {
              fail(api, code ? String(code) : "unknown", true);
              return true; // handled here; keeps the widget from logging to the console
            },
            "unsupported-callback": () => fail(api, "unsupported", false),
            "before-interactive-callback": () => setPhase("interactive"),
            "after-interactive-callback": () => setPhase(runningRef.current ? "pending" : "idle"),
            "refresh-expired": "never",
            "refresh-timeout": "never",
            retry: "never",
            theme: "light",
            // O widget só reconhece o código em minúsculas ("pt-BR" gera aviso e cai no fallback).
            language: "pt-br",
            size: "flexible",
            // Nothing on screen while the check runs. A site key of the invisible kind never shows
            // anything at all; any other kind only appears if Cloudflare demands an interaction.
            appearance: "interaction-only",
          });
        } catch {
          widgetId = null;
        }
        if (widgetId === null || widgetId === undefined) {
          if (queuedRef.current) fail(null, "render", false);
          return;
        }
        rendered = { api, widgetId };
        apiRef.current = api;
        widgetIdRef.current = widgetId;
        if (queuedRef.current) {
          queuedRef.current = false;
          api.execute(container);
        }
      })
      .catch(() => {
        // Loaded ahead of any action: a failure only counts once someone asked for a check.
        if (!cancelled && queuedRef.current) fail(null, "script", false);
      });

    return () => {
      cancelled = true;
      // Leaving the screen ends the check: no callback comes after `remove`.
      if (rendered) rendered.api.remove(rendered.widgetId);
      // A check queued by `execute` stays queued: it runs on the widget of the next attempt.
      apiRef.current = null;
      widgetIdRef.current = null;
    };
  }, [attempt]);

  const interactive = phase === "interactive";
  const pending = phase === "pending";

  /*
   * Out of the flow of every screen: covers the window, above everything (the highest z-index
   * there is: headers, the video stage, popovers and hints stay below), and rendered on the body
   * (a `transform` or `perspective` up the tree would otherwise capture a fixed element). With
   * nothing asked the layer shows nothing and lets every click through. While a check asked by
   * the person runs, the widget is visible and takes clicks (Cloudflare draws nothing unless it
   * needs the person). When Cloudflare demands an interaction, the widget alone (no frame of
   * ours) sits in the center of the window over a discreet veil that keeps the clicks off the
   * page. All of it goes away with the token. The check is mandatory: no way to dismiss it.
   */
  return createPortal(
    <div
      data-testid="turnstile-overlay"
      data-interactive={interactive}
      data-pending={pending || interactive}
      className={`fixed inset-0 z-[2147483647] flex items-center justify-center px-4 ${
        interactive ? "bg-stage/40" : "pointer-events-none"
      }`}
    >
      {/*
        300px: the least the widget needs. Cloudflare leaves the widget on screen after the
        interaction ("success"), so it is kept out of sight whenever no check is running.
      */}
      <div
        ref={containerRef}
        className={`w-[300px] max-w-full empty:hidden ${
          interactive ? "" : pending ? "pointer-events-auto" : "invisible"
        }`}
        data-testid="turnstile"
      />
    </div>,
    document.body,
  );
}
