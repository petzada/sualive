import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { texts } from "../texts";

/** Official script, explicit rendering. The only third-party script the screens load. */
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Cloudflare's public test key that always passes; used when no site key is configured. */
const TEST_SITE_KEY = "1x00000000000000000000AA";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean;
  theme: "light";
  language: string;
  size: "flexible";
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

  useEffect(() => {
    handlersRef.current = { onToken, onError };
  });

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        handlersRef.current.onToken(null);
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
          callback: (token) => handlersRef.current.onToken(token),
          // The widget refreshes an expired token by itself and calls `callback` again.
          "expired-callback": () => handlersRef.current.onToken(null),
          "timeout-callback": () => {
            handlersRef.current.onToken(null);
            if (widgetIdRef.current !== null) loaded.reset(widgetIdRef.current);
          },
          "error-callback": () => {
            handlersRef.current.onToken(null);
            handlersRef.current.onError();
            return true; // handled here; keeps the widget from logging to the console
          },
          theme: "light",
          // O widget só reconhece o código em minúsculas ("pt-BR" gera aviso e cai no fallback).
          language: "pt-br",
          size: "flexible",
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

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={texts.turnstile.label}
      className="min-h-16 w-full max-w-xs"
      data-testid="turnstile"
    />
  );
}
