import type { AppEnv } from "../env";

/**
 * Tudo o que conhece o formato da Woovi fica aqui: chamadas à API, autenticação do webhook e
 * tradução dos eventos para os tipos internos. O resto da cobrança não lê campo da Woovi.
 *
 * Documentação consultada (repositório público da documentação oficial, github.com/Open-Pix/woovi-developers):
 * - Pix Automático: developers.woovi.com/docs/pix-automatic/pix-automatic-how-to-create,
 *   .../pix-automatic-state-machine, .../pix-automatic-api-routes e .../webhooks/pix-automatic-webhooks
 * - Cobrança: developers.woovi.com/docs/charge/how-to-create-charge-using-api
 * - Webhook: developers.woovi.com/docs/webhook/seguranca/webhook-signature-validation,
 *   .../webhook-public-keys, .../webhook-sandbox-public-key, .../webhook-headers
 * - Autenticação da API: developers.woovi.com/docs/apis/api-getting-started
 *
 * Nunca registrar em log o corpo das respostas nem dos webhooks (têm CPF e nome).
 */

export const WOOVI_PRODUCTION_API = "https://api.woovi.com";
export const WOOVI_SANDBOX_API = "https://api.woovi-sandbox.com";

/** Produção usa a API de produção; homologação e desenvolvimento usam o sandbox da Woovi. */
export function wooviApiBase(env: AppEnv): string {
  return env.ENVIRONMENT === "production" ? WOOVI_PRODUCTION_API : WOOVI_SANDBOX_API;
}

/** Falha numa chamada à Woovi. A mensagem nunca leva o corpo da resposta. */
export class WooviError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(`Woovi ${operation} respondeu ${status}`);
    this.name = "WooviError";
  }
}

async function call(env: AppEnv, operation: string, method: string, path: string, body?: unknown) {
  if (!env.WOOVI_APP_ID) throw new Error("WOOVI_APP_ID ausente");
  const response = await fetch(`${wooviApiBase(env)}${path}`, {
    method,
    // A Woovi recebe o AppID cru, sem "Bearer".
    headers: { Authorization: env.WOOVI_APP_ID, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new WooviError(response.status, operation);
  return (await response.json()) as unknown;
}

// Leitura defensiva de JSON (o pacote não depende de biblioteca de esquema).
type Json = Record<string, unknown>;

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Json)[key] : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------- API ----------

export interface WooviCustomer {
  name: string;
  /** CPF só com dígitos. Vai para a Woovi e não é guardado aqui. */
  taxId: string;
}

export interface CreateRecurrenceInput {
  correlationId: string;
  valueCents: number;
  customer: WooviCustomer;
  /** Contrato mostrado ao pagador (a Woovi exige menos de 30 caracteres). */
  comment: string;
  /** Dia do mês da cobrança; na jornada 3 precisa ser o dia de hoje. */
  chargeDay: number;
  /** Dias até a cobrança recorrente expirar (mínimo 3). */
  dueDays: number;
}

/**
 * Pix Automático mensal na jornada 3 (`PAYMENT_ON_APPROVAL`): um QR Code autoriza a recorrência e
 * paga a primeira parcela, com três novas tentativas em 7 dias se uma renovação falhar. Devolve o
 * Pix copia e cola (`emv`); a Woovi não devolve imagem para assinaturas.
 */
export async function createRecurrence(
  env: AppEnv,
  input: CreateRecurrenceInput,
): Promise<{ brCode: string }> {
  const result = await call(env, "criar recorrência", "POST", "/api/v1/subscriptions", {
    name: input.comment,
    value: input.valueCents,
    customer: { name: input.customer.name, taxID: input.customer.taxId },
    correlationID: input.correlationId,
    comment: input.comment,
    frequency: "MONTHLY",
    type: "PIX_RECURRING",
    pixRecurringOptions: { journey: "PAYMENT_ON_APPROVAL", retryPolicy: "THREE_RETRIES_7_DAYS" },
    dayGenerateCharge: input.chargeDay,
    dayDue: input.dueDays,
  });
  const brCode = text(field(field(field(result, "subscription"), "pixRecurring"), "emv"));
  if (!brCode) throw new WooviError(200, "criar recorrência (resposta inesperada)");
  return { brCode };
}

export interface CreateChargeInput {
  correlationId: string;
  valueCents: number;
  customer: WooviCustomer;
  comment: string;
  expiresInSeconds: number;
}

/** Cobrança Pix única (plano anual). */
export async function createCharge(
  env: AppEnv,
  input: CreateChargeInput,
): Promise<{ brCode: string; qrCodeImageUrl: string | null; expiresAt: number | null }> {
  const result = await call(env, "criar cobrança", "POST", "/api/v1/charge", {
    correlationID: input.correlationId,
    value: input.valueCents,
    comment: input.comment,
    expiresIn: input.expiresInSeconds,
    customer: { name: input.customer.name, taxID: input.customer.taxId },
  });
  const charge = field(result, "charge");
  const brCode = text(field(charge, "brCode"));
  if (!brCode) throw new WooviError(200, "criar cobrança (resposta inesperada)");
  const qrCodeImage = text(field(charge, "qrCodeImage"));
  const expiresDate = text(field(charge, "expiresDate"));
  const expiresAt = expiresDate ? Date.parse(expiresDate) : NaN;
  return {
    brCode,
    qrCodeImageUrl: qrCodeImage?.startsWith("https://") ? qrCodeImage : null,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  };
}

/**
 * Situação da recorrência na Woovi, do ponto de vista da cobrança:
 * - `pending`: criada, ainda não autorizada;
 * - `active`: autorizada e cobrando;
 * - `overdue`: com parcela vencida (a Woovi chama de `EXPIRED`);
 * - `stopped`: não cobra mais (cancelada por nós, revogada no banco, recusada ou concluída).
 */
export type RecurrenceStatus = "pending" | "active" | "overdue" | "stopped";

export async function getRecurrenceStatus(env: AppEnv, correlationId: string): Promise<RecurrenceStatus> {
  const result = await call(
    env,
    "consultar recorrência",
    "GET",
    `/api/v1/subscriptions/${encodeURIComponent(correlationId)}`,
  );
  const subscription = field(result, "subscription");
  if (subscription === undefined) throw new WooviError(200, "consultar recorrência (resposta inesperada)");
  const status = text(field(subscription, "status"));
  const recurring = text(field(field(subscription, "pixRecurring"), "status"));
  if (
    status === "INACTIVE" ||
    status === "COMPLETED" ||
    recurring === "CANCELED" ||
    recurring === "REJECTED" ||
    recurring === "EXPIRED"
  ) {
    return "stopped";
  }
  if (recurring === "CREATED") return "pending";
  if (status === "EXPIRED") return "overdue";
  return "active";
}

/** Cancela a recorrência (a Woovi para de gerar cobranças). */
export async function cancelRecurrence(env: AppEnv, correlationId: string): Promise<void> {
  await call(
    env,
    "cancelar recorrência",
    "PUT",
    `/api/v1/subscriptions/${encodeURIComponent(correlationId)}/cancel`,
  );
}

// ---------- Autenticação do webhook ----------

/**
 * Chaves públicas com que a Woovi assina o cabeçalho `x-webhook-signature`
 * (base64 de RSA-SHA256 do corpo bruto). Ficam embutidas como reserva; a lista atual vem de
 * `GET /api/v1/webhook/public-keys`, em cache por uma hora, para acompanhar uma troca de chave.
 */
const PRODUCTION_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/+NtIkjzevvqD+I3MMv3bLXDt
pvxBjY4BsRrSdca3rtAwMcRYYvxSnd7jagVLpctMiOxQO8ieUCKLSWHpsMAjO/zZ
WMKbqoG8MNpi/u3fp6zz0mcHCOSqYsPUUG19buW8bis5ZZ2IZgBObWSpTvJ0cnj6
HKBAA82Jln+lGwS1MwIDAQAB
-----END PUBLIC KEY-----`;

const SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoZwBaFwmstKqy9VAqqxi
SbCWgJR3dd5CTtDi6Fwthtd2owFkZIMqTqKg3Bq5ExjuOxE+v/1gIWFqR9jNjbtY
umwPq+wXQhvx9TrQgrrFMVZ6tMPcwzj8Nknw182N/HMIQsV6B+8JWWzf/cN4ZZVS
sRZfQvoVgFM7PSvSvc/h6v0X2Lkzjypvw7ZRkfxoc+z7B0p3vdQmLSKxPRpLzdLL
VlJ+CJA2aATKVQR5feiuWHKdOlvCT7IRhal0hxUAjc7rxho5eHgaxWO5rITke8wS
IjYIpuw38vMobYSxXb6iuj5Zrjpe2GV8vwuGud8H2dngYhkqbGuY5f4j1kfcN7gC
8QIDAQAB
-----END PUBLIC KEY-----`;

export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";
const PUBLIC_KEYS_TTL_MS = 60 * 60 * 1000;

const keyCache = new Map<string, { keys: string[]; fetchedAt: number }>();

/** Esvazia o cache de chaves (testes). */
export function resetWebhookKeyCache(): void {
  keyCache.clear();
}

async function publicKeys(env: AppEnv): Promise<string[]> {
  const base = wooviApiBase(env);
  const embedded = base === WOOVI_PRODUCTION_API ? PRODUCTION_PUBLIC_KEY : SANDBOX_PUBLIC_KEY;
  const cached = keyCache.get(base);
  if (cached && Date.now() - cached.fetchedAt < PUBLIC_KEYS_TTL_MS) return [...cached.keys, embedded];
  try {
    const response = await fetch(`${base}/api/v1/webhook/public-keys`);
    if (!response.ok) throw new Error(`chaves públicas: ${response.status}`);
    const list = field(await response.json(), "public_keys");
    const keys = (Array.isArray(list) ? list : [])
      .map((entry) => text(field(entry, "key")))
      .filter((key): key is string => key !== undefined);
    if (keys.length === 0) throw new Error("chaves públicas: lista vazia");
    keyCache.set(base, { keys, fetchedAt: Date.now() });
    return [...keys, embedded];
  } catch {
    // A documentação manda seguir com a chave que já se tem se a busca falhar.
    return cached ? [...cached.keys, embedded] : [embedded];
  }
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyWithKey(pem: string, signature: BufferSource, body: BufferSource) {
  try {
    const der = base64ToBytes(pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, ""));
    const key = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, body);
  } catch {
    return false;
  }
}

function timingSafeEqualText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

/**
 * Autentica o webhook. Duas verificações, as duas obrigatórias:
 * 1. `x-webhook-signature`: assinatura RSA-SHA256 do corpo bruto com a chave privada da Woovi,
 *    conferida com a chave pública dela (método recomendado pela documentação). Prova que veio da
 *    Woovi.
 * 2. `Authorization` igual a `WOOVI_WEBHOOK_SECRET`: o valor que o dono cadastra no campo
 *    "authorization" (cabeçalho HTTP) de cada webhook na Woovi. Prova que veio dos webhooks desta
 *    conta, e não de um evento assinado pela Woovi para outra empresa e reenviado para cá.
 *
 * O HMAC `X-OpenPix-Signature` não é usado: está marcado como depreciado e cada webhook cadastrado
 * tem a própria chave, enquanto o ambiente tem um único segredo para os vários webhooks.
 */
export async function verifyWebhook(env: AppEnv, rawBody: string, headers: Headers): Promise<boolean> {
  const secret = env.WOOVI_WEBHOOK_SECRET;
  const authorization = headers.get("Authorization");
  const signatureHeader = headers.get(WEBHOOK_SIGNATURE_HEADER);
  if (!secret || !authorization || !signatureHeader) return false;
  if (!timingSafeEqualText(authorization.trim(), secret)) return false;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64ToBytes(signatureHeader.trim());
  } catch {
    return false;
  }
  const body = new TextEncoder().encode(rawBody);
  for (const pem of await publicKeys(env)) {
    if (await verifyWithKey(pem, signature, body)) return true;
  }
  return false;
}

// ---------- Eventos ----------

/** Nomes exatos dos eventos tratados (cada um é um webhook cadastrado na Woovi). */
export const WOOVI_EVENTS = {
  chargeCompleted: "OPENPIX:CHARGE_COMPLETED",
  chargeExpired: "OPENPIX:CHARGE_EXPIRED",
  recurrenceApproved: "PIX_AUTOMATIC_APPROVED",
  recurrenceRejected: "PIX_AUTOMATIC_REJECTED",
  installmentCompleted: "PIX_AUTOMATIC_COBR_COMPLETED",
  installmentTryRejected: "PIX_AUTOMATIC_COBR_TRY_REJECTED",
  installmentRejected: "PIX_AUTOMATIC_COBR_REJECTED",
} as const;

/**
 * Evento já traduzido. `key` identifica o fato (não a entrega): o mesmo fato entregue duas vezes
 * tem a mesma chave e só é aplicado uma vez.
 */
export type BillingEvent =
  | { kind: "charge_paid"; key: string; correlationId: string }
  | { kind: "charge_expired"; key: string; correlationId: string }
  | { kind: "recurrence_approved"; key: string; recurrenceId: string }
  | { kind: "recurrence_rejected"; key: string; recurrenceId: string }
  | {
      kind: "installment_paid";
      key: string;
      recurrenceId: string;
      installmentId: string;
      /** Número da parcela; 1 é a paga junto com a autorização. Nulo se a Woovi não mandar. */
      installmentNumber: number | null;
    }
  | { kind: "installment_failed"; key: string; recurrenceId: string; installmentId: string }
  | { kind: "installment_rejected"; key: string; recurrenceId: string; installmentId: string }
  | { kind: "ignored"; event: string | null };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Traduz o corpo (já autenticado) do webhook. Formato desconhecido vira `ignored`. */
export async function parseWebhookEvent(rawBody: string): Promise<BillingEvent> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { kind: "ignored", event: null };
  }
  const event = text(field(payload, "event")) ?? null;

  switch (event) {
    case WOOVI_EVENTS.chargeCompleted:
    case WOOVI_EVENTS.chargeExpired: {
      const correlationId = text(field(field(payload, "charge"), "correlationID"));
      if (!correlationId) return { kind: "ignored", event };
      return event === WOOVI_EVENTS.chargeCompleted
        ? { kind: "charge_paid", key: `charge_paid:${correlationId}`, correlationId }
        : { kind: "charge_expired", key: `charge_expired:${correlationId}`, correlationId };
    }
    case WOOVI_EVENTS.recurrenceApproved:
    case WOOVI_EVENTS.recurrenceRejected: {
      const recurrenceId = text(field(payload, "correlationID"));
      if (!recurrenceId) return { kind: "ignored", event };
      return event === WOOVI_EVENTS.recurrenceApproved
        ? { kind: "recurrence_approved", key: `recurrence_approved:${recurrenceId}`, recurrenceId }
        : { kind: "recurrence_rejected", key: `recurrence_rejected:${recurrenceId}`, recurrenceId };
    }
    case WOOVI_EVENTS.installmentCompleted:
    case WOOVI_EVENTS.installmentTryRejected:
    case WOOVI_EVENTS.installmentRejected: {
      // Nos eventos de parcela, `correlationID` é o da recorrência e `globalID` o da parcela.
      const recurrenceId = text(field(payload, "correlationID"));
      const installmentId = text(field(payload, "globalID"));
      if (!recurrenceId || !installmentId) return { kind: "ignored", event };
      if (event === WOOVI_EVENTS.installmentCompleted) {
        const number = field(payload, "installmentNumber");
        return {
          kind: "installment_paid",
          key: `installment_paid:${installmentId}`,
          recurrenceId,
          installmentId,
          installmentNumber: typeof number === "number" && Number.isInteger(number) ? number : null,
        };
      }
      if (event === WOOVI_EVENTS.installmentRejected) {
        return {
          kind: "installment_rejected",
          key: `installment_rejected:${installmentId}`,
          recurrenceId,
          installmentId,
        };
      }
      // Cada tentativa recusada é um fato diferente: a chave leva a tentativa (ou, sem ela, o corpo).
      const triesField = field(field(payload, "cobr"), "tries");
      const tries: unknown[] = Array.isArray(triesField) ? triesField : [];
      const last = tries.at(-1);
      const attempt = text(field(last, "requestedExecutionDate")) ?? text(field(last, "createdAt"));
      const discriminator = attempt ? `${tries.length}:${attempt}` : await sha256Hex(rawBody);
      return {
        kind: "installment_failed",
        key: `installment_failed:${installmentId}:${discriminator}`,
        recurrenceId,
        installmentId,
      };
    }
    default:
      return { kind: "ignored", event };
  }
}
