import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { app } from "../src/app";
import type { Viewer } from "../src/auth/viewer";
import { getViewer } from "../src/auth/viewer";
import { createDb } from "../src/db";
import { users } from "../src/db/schema";
import type { AppEnv } from "../src/env";
import { mockOutboundFetch } from "./helpers";

/**
 * Woovi simulada para os testes de cobrança. Os segredos são falsos e entram pelo env do teste
 * (terceiro argumento de `app.request`); nenhuma chamada sai para a rede.
 * Quem usa precisa de `vi.mock("../src/auth/viewer")` no topo do arquivo de teste.
 */

export const WOOVI_SECRETS = {
  WOOVI_APP_ID: "appid-falso-da-woovi-para-testes",
  WOOVI_WEBHOOK_SECRET: "segredo-falso-do-webhook-para-testes",
} satisfies Partial<AppEnv>;

export const billingEnv = { ...env, ...WOOVI_SECRETS } as AppEnv;
export const db = createDb(env.DB);

/** CPFs de teste (dígitos verificadores válidos, gerados para teste). */
export const VALID_CPF = "52998224725";
export const INVALID_CPF = "52998224724";

export const FAKE_EMV = "00020101021226870014br.gov.bcb.pix2565qr-h.woovi.digital/qr/v2/rec/teste6304ABCD";
export const FAKE_BRCODE = "00020101021226870014br.gov.bcb.pix2565qr-h.woovi.digital/qr/v2/cob/teste6304DCBA";

// ---------- Contas ----------

export async function createUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, nickname: "Pessoa de teste", handle: null, createdAt: Date.now() });
  return id;
}

export function loginAs(userId: string | null, onboarded = true) {
  const viewer: Viewer | null = userId
    ? {
        userId,
        handle: "teste",
        nickname: "Pessoa de teste",
        avatarUrl: null,
        onboarded,
        roomTheme: "default",
      }
    : null;
  vi.mocked(getViewer).mockResolvedValue(viewer);
}

// ---------- Assinatura do webhook ----------

let keyPair: CryptoKeyPair | null = null;
let publicPem = "";

/** Par de chaves RSA de teste no lugar do da Woovi (a chave pública vem do endpoint simulado). */
export async function setupWebhookKeys() {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const spki = new Uint8Array((await crypto.subtle.exportKey("spki", keyPair.publicKey)) as ArrayBuffer);
  const base64 = btoa(String.fromCharCode(...spki));
  publicPem = `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

export async function sign(body: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair!.privateKey,
    new TextEncoder().encode(body),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ---------- API da Woovi simulada ----------

export interface WooviCall {
  method: string;
  path: string;
  body: unknown;
  authorization: string | null;
}

export interface WooviMock {
  calls: WooviCall[];
  /** Situação devolvida por GET /api/v1/subscriptions/:id (por correlationID). */
  remote: Map<string, { status: string; pixRecurring: string }>;
  /** Faz as chamadas de criação falharem. */
  failCreate: boolean;
}

export function mockWoovi(): WooviMock {
  const mock: WooviMock = { calls: [], remote: new Map(), failCreate: false };
  mockOutboundFetch(async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? "GET";
    if (pathname === "/api/v1/webhook/public-keys") {
      return Response.json({ public_keys: [{ key_identifier: "teste", is_current: true, key: publicPem }] });
    }
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    mock.calls.push({ method, path: pathname, body, authorization: headers.get("Authorization") });
    if (mock.failCreate && method === "POST") return Response.json({ error: "falha" }, { status: 400 });
    if (method === "POST" && pathname === "/api/v1/subscriptions") {
      const correlationID = (body as { correlationID: string }).correlationID;
      mock.remote.set(correlationID, { status: "ACTIVE", pixRecurring: "CREATED" });
      return Response.json({
        subscription: {
          correlationID,
          status: "ACTIVE",
          globalID: `global-${correlationID}`,
          pixRecurring: {
            recurrencyId: "RN-teste",
            emv: FAKE_EMV,
            journey: "PAYMENT_ON_APPROVAL",
            status: "CREATED",
          },
        },
      });
    }
    if (method === "POST" && pathname === "/api/v1/charge") {
      return Response.json({
        charge: {
          correlationID: (body as { correlationID: string }).correlationID,
          brCode: FAKE_BRCODE,
          qrCodeImage: "https://api.woovi.com/openpix/charge/brcode/image/teste.png",
          expiresDate: new Date(Date.now() + 86_400_000).toISOString(),
          status: "ACTIVE",
        },
      });
    }
    const cancel = pathname.match(/^\/api\/v1\/subscriptions\/([^/]+)\/cancel$/);
    if (method === "PUT" && cancel) {
      const id = decodeURIComponent(cancel[1]!);
      mock.remote.set(id, { status: "INACTIVE", pixRecurring: "CANCELED" });
      return Response.json({ subscription: { correlationID: id } });
    }
    const get = pathname.match(/^\/api\/v1\/subscriptions\/([^/]+)$/);
    if (method === "GET" && get) {
      const id = decodeURIComponent(get[1]!);
      const remote = mock.remote.get(id);
      if (!remote) return Response.json({ error: "not found" }, { status: 400 });
      return Response.json({
        subscription: {
          correlationID: id,
          status: remote.status,
          pixRecurring: { status: remote.pixRecurring },
        },
      });
    }
    throw new Error(`chamada inesperada à Woovi: ${method} ${pathname}`);
  });
  return mock;
}

export function wooviCalls(mock: WooviMock, method: string, pathPrefix: string) {
  return mock.calls.filter((call) => call.method === method && call.path.startsWith(pathPrefix));
}

// ---------- Requisições ----------

export function request(path: string, init: RequestInit = {}, overrides: Partial<AppEnv> = {}) {
  return app.request(path, init, { ...billingEnv, ...overrides });
}

export function postJson(path: string, body: unknown, overrides: Partial<AppEnv> = {}) {
  return request(
    path,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    overrides,
  );
}

export async function sendWebhook(
  payload: unknown,
  options: { authorization?: string | null; signature?: string | null; rawBody?: string } = {},
) {
  const rawBody = options.rawBody ?? JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const authorization =
    options.authorization === undefined ? WOOVI_SECRETS.WOOVI_WEBHOOK_SECRET : options.authorization;
  if (authorization !== null) headers.Authorization = authorization;
  const signature = options.signature === undefined ? await sign(rawBody) : options.signature;
  if (signature !== null) headers["x-webhook-signature"] = signature;
  return request("/api/webhooks/woovi", { method: "POST", body: rawBody, headers });
}

// ---------- Corpos de webhook (formato da documentação da Woovi) ----------

export const payloads = {
  chargeCompleted: (correlationID: string) => ({
    event: "OPENPIX:CHARGE_COMPLETED",
    charge: {
      correlationID,
      status: "COMPLETED",
      value: 15990,
      customer: { name: "X", taxID: { taxID: VALID_CPF } },
    },
    pix: { value: 15990 },
  }),
  chargeExpired: (correlationID: string) => ({
    event: "OPENPIX:CHARGE_EXPIRED",
    charge: { correlationID, status: "EXPIRED", value: 15990 },
  }),
  recurrenceApproved: (correlationID: string) => ({
    event: "PIX_AUTOMATIC_APPROVED",
    correlationID,
    status: "ACTIVE",
    globalID: `global-${correlationID}`,
    pixRecurring: { status: "APPROVED", journey: "PAYMENT_ON_APPROVAL" },
  }),
  recurrenceRejected: (correlationID: string) => ({
    event: "PIX_AUTOMATIC_REJECTED",
    correlationID,
    status: "INACTIVE",
    globalID: `global-${correlationID}`,
    pixRecurring: { status: "REJECTED", journey: "PAYMENT_ON_APPROVAL" },
  }),
  installmentCompleted: (correlationID: string, installment: number) => ({
    event: "PIX_AUTOMATIC_COBR_COMPLETED",
    installmentNumber: installment,
    value: 1990,
    status: "COMPLETED",
    cobr: {
      status: "COMPLETED",
      tries: [{ tryStatus: "PAID", requestedExecutionDate: `2026-0${installment}-05` }],
    },
    correlationID,
    paymentSubscriptionGlobalID: `global-${correlationID}`,
    globalID: `installment-${correlationID}-${installment}`,
  }),
  installmentTryRejected: (correlationID: string, installment: number, attempt: number) => ({
    event: "PIX_AUTOMATIC_COBR_TRY_REJECTED",
    installmentNumber: installment,
    value: 1990,
    status: "CANCELED",
    cobr: {
      status: "FAILED_TRY",
      tries: Array.from({ length: attempt }, (_, i) => ({
        tryStatus: "REJECTED",
        requestedExecutionDate: `2026-0${installment}-0${5 + i}`,
        rejectCode: "FBRD",
      })),
    },
    correlationID,
    paymentSubscriptionGlobalID: `global-${correlationID}`,
    globalID: `installment-${correlationID}-${installment}`,
  }),
  installmentRejected: (correlationID: string, installment: number) => ({
    event: "PIX_AUTOMATIC_COBR_REJECTED",
    installmentNumber: installment,
    status: "CANCEL",
    cobr: { status: "REJECTED", rejectCode: "DTED" },
    correlationID,
    paymentSubscriptionGlobalID: `global-${correlationID}`,
    globalID: `installment-${correlationID}-${installment}`,
  }),
};
