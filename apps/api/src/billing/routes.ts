import {
  planSchema,
  plusCheckoutRequestSchema,
  plusCheckoutResponseSchema,
  plusPaymentResponseSchema,
  plusPaymentStatusSchema,
} from "@sualive/protocol";
import { Hono, type Context } from "hono";
import { sameOriginOnly } from "../auth/csrf";
import { getViewer, type Viewer } from "../auth/viewer";
import type { AppEnv } from "../env";
import { apiError } from "../errors";
import { createCheckout, getPaymentStatus, requestCancel } from "./checkout";
import { isValidCpf } from "./cpf";
import { applyBillingEvent } from "./events";
import { isBillingEnabled } from "./plan";
import { parseWebhookEvent, verifyWebhook } from "./woovi";

type Env = { Bindings: AppEnv };
type Ctx = Context<Env>;

/** Conta logada, com primeiro acesso concluído, num ambiente com cobrança ligada. */
async function requireSubscriber(c: Ctx): Promise<Viewer | Response> {
  const viewer = await getViewer(c);
  if (!viewer) return apiError(c, "unauthorized");
  if (!viewer.onboarded) return apiError(c, "onboarding_required");
  if (!isBillingEnabled(c.env)) return apiError(c, "billing_unavailable");
  return viewer;
}

async function readJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** `/api/plus/*`: checkout, consulta de pagamento e cancelamento. */
export const plus = new Hono<Env>();

// Checkout e cancelamento mudam estado com o cookie de conta: só a própria origem pode chamar.
plus.use(sameOriginOnly);

plus.post("/checkout", async (c) => {
  const viewer = await requireSubscriber(c);
  if (viewer instanceof Response) return viewer;
  const body = plusCheckoutRequestSchema.safeParse(await readJson(c));
  if (!body.success || !isValidCpf(body.data.taxId)) return apiError(c, "invalid_request");
  const result = await createCheckout(c.env, viewer, body.data.cycle, body.data.taxId, Date.now());
  if (!result.ok) return apiError(c, result.error);
  return c.json(plusCheckoutResponseSchema.parse(result.body));
});

// Só leitura: quem muda o estado do pagamento é o webhook.
plus.get("/payments/:id", async (c) => {
  const viewer = await requireSubscriber(c);
  if (viewer instanceof Response) return viewer;
  const status = await getPaymentStatus(c.env, viewer.userId, c.req.param("id"));
  if (status === null) return apiError(c, "not_found");
  return c.json(plusPaymentResponseSchema.parse({ status: plusPaymentStatusSchema.parse(status) }));
});

plus.post("/cancel", async (c) => {
  const viewer = await requireSubscriber(c);
  if (viewer instanceof Response) return viewer;
  const plan = await requestCancel(c.env, viewer.userId, Date.now());
  return c.json(planSchema.parse(plan));
});

/** `/api/webhooks/*`: notificações da Woovi. */
export const webhooks = new Hono<Env>();

webhooks.post("/woovi", async (c) => {
  if (!isBillingEnabled(c.env)) return apiError(c, "billing_unavailable");
  // A assinatura é sobre o corpo bruto: lido como texto antes de qualquer parse.
  const rawBody = await c.req.text();
  if (!(await verifyWebhook(c.env, rawBody, c.req.raw.headers))) return apiError(c, "unauthorized");
  const event = await parseWebhookEvent(rawBody);
  const result = await applyBillingEvent(c.env, event, Date.now());
  return c.json({ ok: true, result });
});
