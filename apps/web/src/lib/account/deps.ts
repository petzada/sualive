/**
 * Tudo o que o núcleo da conta usa do navegador, injetado. Os testes trocam cada peça por um dublê;
 * `browserAccountDeps` liga as peças reais.
 */
import * as Sentry from "@sentry/react";
import type { FetchLike } from "./api";

export type TimerId = ReturnType<typeof setTimeout>;

export interface AccountDeps {
  fetch: FetchLike;
  timers: {
    setTimeout(handler: () => void, ms: number): TimerId;
    clearTimeout(id: TimerId): void;
  };
  /** Aba visível ou oculta (a consulta do pagamento pausa com a aba oculta). */
  visibility: {
    isHidden(): boolean;
    /** Avisa a cada mudança. Devolve a função que cancela. */
    onChange(handler: () => void): () => void;
  };
  /** Relata ao Sentry um problema sem dados pessoais (nunca CPF, token ou corpo de resposta). */
  report: (message: string, extra?: Record<string, string | number>) => void;
}

export function browserAccountDeps(): AccountDeps {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    timers: {
      setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id),
    },
    visibility: {
      isHidden: () => document.visibilityState === "hidden",
      onChange: (handler) => {
        document.addEventListener("visibilitychange", handler);
        return () => document.removeEventListener("visibilitychange", handler);
      },
    },
    report: (message, extra) => {
      Sentry.captureMessage(message, { level: "warning", extra });
    },
  };
}
