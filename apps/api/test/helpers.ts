import {
  createRoomResponseSchema,
  joinRoomResponseSchema,
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "@sualive/protocol";
import { env, exports } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { expect, vi } from "vitest";
import worker from "../src/index";
import type { AppEnv } from "../src/env";
import { TURNSTILE_VERIFY_URL } from "../src/external";

export const ORIGIN = "https://sualive.test";
/** Token que o Turnstile simulado aceita; qualquer outro é recusado. */
export const GOOD_TURNSTILE = "turnstile-ok";
export const BAD_TURNSTILE = "turnstile-recusado";

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/**
 * Simula o `fetch` de saída (o Worker roda no mesmo isolate dos testes). Turnstile: aceita só
 * GOOD_TURNSTILE. Outras URLs vão para `extra`; sem ele, falham (nunca chamam a rede).
 */
export function mockOutboundFetch(extra?: FetchHandler) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === TURNSTILE_VERIFY_URL) {
      const body = init?.body as FormData;
      return Response.json({ success: body.get("response") === GOOD_TURNSTILE });
    }
    if (extra) return extra(url, init);
    throw new Error(`fetch inesperado nos testes: ${url}`);
  });
}

/** IP aleatório para não esbarrar no limite por IP entre testes. */
export function randomIp(): string {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${part()}.${part()}.${part()}`;
}

export function api(path: string, init: RequestInit & { ip?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip ?? randomIp());
  return exports.default.fetch(`${ORIGIN}${path}`, { ...init, headers });
}

/** Chama o handler com o ambiente alterado (ex.: chaves de TURN, ASSETS falso). */
export async function fetchWithEnv(request: Request, overrides: Partial<AppEnv>) {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(
    request as Request<unknown, IncomingRequestCfProperties>,
    { ...env, ...overrides } as AppEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

export function postJson(path: string, body: unknown, init: { ip?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.cookie) headers.Cookie = init.cookie;
  return api(path, { method: "POST", body: JSON.stringify(body), headers, ip: init.ip });
}

export async function createRoom() {
  const response = await postJson("/api/rooms", { turnstileToken: GOOD_TURNSTILE });
  expect(response.status).toBe(200);
  return createRoomResponseSchema.parse(await response.json());
}

/** `nome=valor` do Set-Cookie, para mandar de volta no cabeçalho Cookie. */
export function cookieFrom(response: Response): string {
  const header = response.headers.get("Set-Cookie");
  if (!header) throw new Error("sem Set-Cookie");
  return header.split(";")[0]!;
}

export interface Guest {
  participantId: string;
  nickname: string;
  cookie: string;
  ip: string;
}

export async function join(
  code: string,
  nickname: string,
  options: { ip?: string; cookie?: string } = {},
): Promise<Guest> {
  const ip = options.ip ?? randomIp();
  const response = await postJson(
    `/api/rooms/${code}/join`,
    { nickname, turnstileToken: GOOD_TURNSTILE },
    { ip, cookie: options.cookie },
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body = joinRoomResponseSchema.parse(await response.json());
  return { ...body, cookie: cookieFrom(response), ip };
}

/** Cliente de WebSocket de teste: guarda as mensagens e espera por tipo. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  closeCode: number | null = null;
  private waiters: (() => void)[] = [];

  constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      this.messages.push(serverMessageSchema.parse(JSON.parse(event.data as string)));
      this.notify();
    });
    ws.addEventListener("close", (event) => {
      this.closeCode = event.code;
      this.notify();
    });
    ws.accept();
  }

  private notify() {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private changed(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  send(message: ClientMessage | string) {
    this.ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  /** Próxima mensagem ainda não lida do tipo pedido (as de outros tipos ficam para depois). */
  async next<T extends ServerMessage["type"]>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.messages.findIndex((m) => m.type === type);
      if (index >= 0) {
        const [message] = this.messages.splice(index, 1);
        return message as Extract<ServerMessage, { type: T }>;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`sem mensagem ${type}; recebidas: ${this.messages.map((m) => m.type).join(", ")}`);
      }
      await Promise.race([this.changed(), new Promise((r) => setTimeout(r, remaining))]);
    }
  }

  /** Nenhuma mensagem do tipo chegou (espera um pouco). */
  async expectNone(type: ServerMessage["type"], waitMs = 100) {
    await new Promise((r) => setTimeout(r, waitMs));
    expect(this.messages.filter((m) => m.type === type)).toEqual([]);
  }

  async closed(timeoutMs = 2000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (this.closeCode === null) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("a conexão não fechou");
      await Promise.race([this.changed(), new Promise((r) => setTimeout(r, remaining))]);
    }
    return this.closeCode;
  }

  close() {
    this.ws.close(1000, "bye");
  }
}

/** Abre o WebSocket da sala (sem `hello`). */
export async function openSocket(code: string, guest?: Pick<Guest, "cookie" | "ip">) {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (guest) headers.Cookie = guest.cookie;
  const response = await api(`/api/rooms/${code}/ws`, { headers, ip: guest?.ip });
  expect(response.status).toBe(101);
  return new TestClient(response.webSocket!);
}

/** Abre, manda `hello` e espera o `welcome`. */
export async function connect(code: string, guest: Guest, ownerToken?: string) {
  const client = await openSocket(code, guest);
  client.send(ownerToken ? { type: "hello", ownerToken } : { type: "hello" });
  const welcome = await client.next("welcome");
  return { client, welcome };
}

export function roomStub(code: string) {
  return env.ROOM.get(env.ROOM.idFromName(code));
}
