/**
 * Tudo o que o núcleo da sala usa do navegador, injetado. Os testes trocam cada peça por um dublê;
 * `browserRoomDeps` liga as peças reais.
 */
import * as Sentry from "@sentry/react";
import {
  createDevicePreview,
  createMediaSession,
  getMediaCapabilities,
  type CreateMediaSession,
  type DevicePreview,
  type MediaCapabilities,
} from "@sualive/media";
import type { FetchLike } from "./api";

export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: unknown): void;
  onClose(code: number): void;
}

/** O pedaço do WebSocket que a sala usa. Depois de `close`, nenhum handler é chamado. */
export interface SocketLike {
  isOpen(): boolean;
  send(data: string): void;
  close(): void;
}

export type CreateSocket = (url: string, handlers: SocketHandlers) => SocketLike;

/** O pedaço do `localStorage` que a sala usa. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomDeps {
  fetch: FetchLike;
  createSocket: CreateSocket;
  createMediaSession: CreateMediaSession;
  createDevicePreview: () => Promise<DevicePreview>;
  getMediaCapabilities: () => MediaCapabilities;
  /** `null` quando o navegador bloqueia o armazenamento. */
  storage: StorageLike | null;
  writeClipboard: (text: string) => Promise<void>;
  /** Origem da página (ex.: `https://sualive.com`). */
  origin: string;
  /** Avisa quando a rede volta ou a aba volta a ficar visível. Devolve a função que cancela. */
  onResume: (handler: () => void) => () => void;
  /** Identificador aleatório (pedidos de vídeo, reações). */
  randomId: () => string;
  /** Relata ao Sentry um problema sem dados pessoais nem conteúdo do chat. */
  report: (message: string, extra?: Record<string, string | number>) => void;
}

function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const createBrowserSocket: CreateSocket = (url, handlers) => {
  const ws = new WebSocket(url);
  let closed = false;
  ws.onopen = () => {
    if (!closed) handlers.onOpen();
  };
  ws.onmessage = (event) => {
    if (!closed) handlers.onMessage(event.data);
  };
  ws.onclose = (event) => {
    if (closed) return;
    closed = true;
    handlers.onClose(event.code);
  };
  return {
    isOpen: () => !closed && ws.readyState === WebSocket.OPEN,
    send: (data) => ws.send(data),
    close: () => {
      closed = true;
      ws.onopen = ws.onmessage = ws.onclose = null;
      try {
        ws.close(1000);
      } catch {
        // já fechado
      }
    },
  };
};

function onBrowserResume(handler: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "visible") handler();
  };
  window.addEventListener("online", handler);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("online", handler);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function browserRoomDeps(): RoomDeps {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    createSocket: createBrowserSocket,
    createMediaSession,
    createDevicePreview,
    getMediaCapabilities,
    storage: browserStorage(),
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    origin: window.location.origin,
    onResume: onBrowserResume,
    randomId: () => crypto.randomUUID(),
    report: (message, extra) => {
      Sentry.captureMessage(message, { level: "warning", extra });
    },
  };
}

/** `ws://` ou `wss://` conforme a página, no mesmo host. */
export function socketUrl(origin: string, path: string): string {
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
