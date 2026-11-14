import {
  apiErrorSchema,
  createRoomResponseSchema,
  joinRoomResponseSchema,
  roomInfoResponseSchema,
} from "@sualive/protocol";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, vi } from "vitest";
import { NO_PLAN, type PlanStatus } from "../src/billing/plan";
import type { AppEnv } from "../src/env";
import type { TestUser } from "./account";
import { fetchWithEnv, GOOD_TURNSTILE, ORIGIN, randomIp, roomStub, TestClient, type Guest } from "./helpers";

/**
 * Ajudantes dos testes da sala da entrega 4: plano injetado por conta, relógio controlado, chamadas
 * com o ambiente alterado (chave de TURN) e o alarme do Durable Object.
 */

/** Chave de TURN falsa: liga a sala protegida. A API do TURN nunca é chamada nestes testes. */
export const TURN_ENV: Partial<AppEnv> = {
  TURN_KEY_ID: "id-da-chave-falsa",
  TURN_KEY_API_TOKEN: "token-falso-da-chave",
};

export const PLUS: PlanStatus = {
  plan: { status: "active", plus: true, cycle: "monthly", periodEnd: Date.now() + 86_400_000, renews: true },
  badges: ["plus"],
};

/**
 * Plano por conta, para usar com `vi.mock("../src/billing/plan")` no arquivo de teste:
 * `vi.mocked(getPlanStatus).mockImplementation(planFor)`.
 */
export const plusUsers = new Set<string>();
export async function planFor(_env: AppEnv, userId: string): Promise<PlanStatus> {
  return plusUsers.has(userId) ? PLUS : NO_PLAN;
}

/** Relógio controlado: `Date.now` parado em `now`, avançado à mão. */
export function useClock(start = Date.now()) {
  const clock = { now: start, advance: (ms: number) => (clock.now += ms) };
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  return clock;
}

/** Requisição ao Worker com o ambiente alterado (por padrão, com a chave de TURN). */
export function requestWith(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    cookie?: string;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
  env: Partial<AppEnv> = TURN_ENV,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip ?? randomIp());
  if (init.cookie) headers.set("Cookie", init.cookie);
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.body);
  }
  return fetchWithEnv(new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body }), env);
}

export async function errorOf(response: Response): Promise<string> {
  return apiErrorSchema.parse(await response.json()).error;
}

/** Cria sala (protegida ou não) como a conta dada. Devolve a resposta crua. */
export function createRoomAs(
  user: Pick<TestUser, "cookie"> | null,
  options: { protected?: boolean; env?: Partial<AppEnv> } = {},
): Promise<Response> {
  return requestWith(
    "/api/rooms",
    {
      method: "POST",
      cookie: user?.cookie,
      body: { turnstileToken: GOOD_TURNSTILE, ...(options.protected ? { protected: true } : {}) },
    },
    options.env ?? TURN_ENV,
  );
}

export async function createProtectedRoom(user: Pick<TestUser, "cookie">) {
  const response = await createRoomAs(user, { protected: true });
  expect(response.status, await response.clone().text()).toBe(200);
  return createRoomResponseSchema.parse(await response.json());
}

/** Entra na sala, com conta (cookie da conta) ou sem (apelido). */
export async function joinWith(
  key: string,
  who: { cookie?: string; nickname?: string },
  env: Partial<AppEnv> = TURN_ENV,
): Promise<Guest> {
  const ip = randomIp();
  const response = await requestWith(
    `/api/rooms/${key}/join`,
    {
      method: "POST",
      cookie: who.cookie,
      ip,
      body: { turnstileToken: GOOD_TURNSTILE, ...(who.nickname ? { nickname: who.nickname } : {}) },
    },
    env,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const body = joinRoomResponseSchema.parse(await response.json());
  const setCookie = response.headers.get("Set-Cookie");
  return { ...body, cookie: setCookie ? setCookie.split(";")[0]! : who.cookie!, ip };
}

/** Abre o WebSocket com o ambiente alterado, manda `hello` e espera o `welcome`. */
export async function connectWith(
  key: string,
  guest: Pick<Guest, "cookie" | "ip">,
  options: { ownerToken?: string; env?: Partial<AppEnv> } = {},
) {
  const response = await requestWith(
    `/api/rooms/${key}/ws`,
    { cookie: guest.cookie, ip: guest.ip, headers: { Upgrade: "websocket" } },
    options.env ?? TURN_ENV,
  );
  expect(response.status).toBe(101);
  const client = new TestClient(response.webSocket!);
  client.send(options.ownerToken ? { type: "hello", ownerToken: options.ownerToken } : { type: "hello" });
  const welcome = await client.next("welcome");
  return { client, welcome };
}

export async function roomInfoWith(key: string, env: Partial<AppEnv> = TURN_ENV) {
  return roomInfoResponseSchema.parse(await (await requestWith(`/api/rooms/${key}`, {}, env)).json());
}

/** Dispara o alarme do Durable Object da sala agora. */
export function runAlarm(key: string): Promise<boolean> {
  return runDurableObjectAlarm(roomStub(key));
}

/** Lê uma chave do storage do Durable Object da sala. */
export function storageGet<T>(key: string, storageKey: string): Promise<T | undefined> {
  return runInDurableObject(roomStub(key), (_, state) => state.storage.get<T>(storageKey));
}

/** Espera um pouco para as mensagens em trânsito chegarem. */
export function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
