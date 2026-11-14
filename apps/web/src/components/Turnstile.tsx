import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

/** Official script, explicit rendering. The only third-party script the screens load. */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Cloudflare's public test key of the invisible kind, which always passes; used when no site key is configured. */
const TEST_SITE_KEY = "1x00000000000000000000BB";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean;
  /** Cloudflare demands an interaction: from here the widget has something to show. */
  "before-interactive-callback": () => void;
  /** The interaction is over (passed or not): the widget has nothing to show again. */
  "after-interactive-callback": () => void;
  theme: "light";
  language: string;
  size: "flexible";
  appearance: "interaction-only";
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | null | undefined;
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
      scriptPromise = null; // lets a later reset try again
      script.remove();
      reject(new Error("Turnstile script failed to load"));
    };
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail(script));
    script.onerror = () => fail(script);
    document.head.append(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Discards the current token and asks for a new one (tokens are single-use). */
  reset(): void;
}

interface TurnstileProps {
  /** A fresh token, or `null` when the current one expired or was discarded. */
  onToken: (token: string | null) => void;
  /** The challenge failed or the script could not be loaded. */
  onError: () => void;
  ref?: Ref<TurnstileHandle>;
}

export function Turnstile({ onToken, onError, ref }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const handlersRef = useRef({ onToken, onError });
  // Bumped to load the script again after a failed load.
  const [attempt, setAttempt] = useState(0);
  // Only while Cloudflare demands an interaction from the person (a suspect visit).
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    handlersRef.current = { onToken, onError };
  });

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        handlersRef.current.onToken(null);
        setInteractive(false);
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        } else {
          setAttempt((current) => current + 1);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let api: TurnstileApi | null = null;

    loadTurnstile()
      .then((loaded) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        api = loaded;
        const widgetId = loaded.render(container, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY,
          callback: (token) => {
            setInteractive(false);
            handlersRef.current.onToken(token);
          },
          // The widget refreshes an expired token by itself and calls `callback` again.
          "expired-callback": () => handlersRef.current.onToken(null),
          "timeout-callback": () => {
            setInteractive(false);
            handlersRef.current.onToken(null);
            if (widgetIdRef.current !== null) loaded.reset(widgetIdRef.current);
          },
          "error-callback": () => {
            setInteractive(false);
            handlersRef.current.onToken(null);
            handlersRef.current.onError();
            return true; // handled here; keeps the widget from logging to the console
          },
          "before-interactive-callback": () => setInteractive(true),
          "after-interactive-callback": () => setInteractive(false),
          theme: "light",
          // O widget só reconhece o código em minúsculas ("pt-BR" gera aviso e cai no fallback).
          language: "pt-br",
          size: "flexible",
          // Nothing on screen while the check runs. A site key of the invisible kind never shows
          // anything at all; any other kind only appears if Cloudflare demands an interaction.
          appearance: "interaction-only",
        });
        widgetIdRef.current = widgetId ?? null;
      })
      .catch(() => {
        if (!cancelled) handlersRef.current.onError();
      });

    return () => {
      cancelled = true;
      if (api && widgetIdRef.current !== null) api.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [attempt]);

  /*
   * Out of the flow of every screen: covers the window, above everything (the highest z-index
   * there is: headers, the video stage, popovers and hints stay below), and rendered on the body
   * (a `transform` or `perspective` up the tree would otherwise capture a fixed element). With
   * nothing demanded from the person the widget shows nothing and the layer lets every click
   * through. When Cloudflare demands an interaction, the widget alone (no frame of ours) sits in
   * the center of the window over a discreet veil that keeps the clicks off the page; both go
   * away when that ends. The check is mandatory, so there is no way to dismiss it.
   */
  return createPortal(
    <div
      data-testid="turnstile-overlay"
      data-interactive={interactive}
      className={`fixed inset-0 z-[2147483647] flex items-center justify-center px-4 ${
        interactive ? "bg-stage/40" : "pointer-events-none"
      }`}
    >
      {/*
        300px: the least the widget needs. Cloudflare leaves the widget on screen after the
        interaction ("success"), so it is kept out of sight whenever nothing is demanded.
      */}
      <div
        ref={containerRef}
        className={`w-[300px] max-w-full empty:hidden ${interactive ? "" : "invisible"}`}
        data-testid="turnstile"
      />
    </div>,
    document.body,
  );
}
