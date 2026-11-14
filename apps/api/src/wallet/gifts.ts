import { PLUS_GIFT_DAYS, PLUS_GIFT_PRICE_GOLD } from "@sualive/config";
import { transition } from "../billing/state";
import {
  loadSubscription,
  recordEvent,
  stateOf,
  writeSubscription,
  type SubscriptionExtras,
} from "../billing/store";
import type { AppEnv } from "../env";
import { debitStatements, runLedger, type LedgerOutcome } from "./ledger";

/** Tentativas quando a assinatura de quem recebe muda entre a leitura e a escrita. */
const GIFT_PLUS_ATTEMPTS = 3;

/** Falha do `batch` causada pela trava otimista da assinatura (outra escrita chegou antes). */
function isSubscriptionConflict(error: unknown): boolean {
  let text = "";
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      text += ` ${current.message}`;
      current = current.cause;
    } else {
      text += ` ${String(current)}`;
      break;
    }
  }
  return (
    text.includes("billing_webhook_events.processed_at") || text.includes("billing_subscriptions.user_id")
  );
}

/**
 * Presenteia PLUS_GIFT_DAYS dias de Plus: debita PLUS_GIFT_PRICE_GOLD de ouro de quem envia e
 * estende o plano de quem recebe no mesmo `batch` (vale tudo ou nada). Quem chama já conferiu que as
 * duas contas existem, concluíram o primeiro acesso e são diferentes.
 *
 * A trava otimista da assinatura vai na frente do `batch` (`recordEvent` com guarda, chave
 * `plus-gift:<id>`): se a assinatura mudou desde a leitura, o `batch` inteiro falha, nada é
 * debitado, e a operação lê de novo e tenta outra vez. Presente não renova, não dá selo de apoiador
 * inicial nem ouro (não há linha em `billing_payments`).
 */
export async function giftPlus(
  env: AppEnv,
  fromUserId: string,
  toUserId: string,
  now: number,
): Promise<Exclude<LedgerOutcome, "duplicate">> {
  if (fromUserId === toUserId) throw new Error("presente de Plus para a própria conta");
  for (let attempt = 1; ; attempt++) {
    const previous = await loadSubscription(env, toUserId);
    const { state } = transition(stateOf(previous), { type: "gift_received", at: now, days: PLUS_GIFT_DAYS });
    // Plano novo de presente: sem recorrência da Woovi, sem pedido de cancelamento nem aviso.
    const extras: SubscriptionExtras =
      state.cycle === "gift" && previous?.cycle !== "gift"
        ? { wooviCorrelationId: null, cancelRequestedAt: null, cancelConfirmedAt: null, expiryNoticeAt: null }
        : {};
    const giftId = crypto.randomUUID();
    try {
      const outcome = await runLedger(env, [
        recordEvent(env, `plus-gift:${giftId}`, now, { userId: toUserId, previous }),
        ...debitStatements(env, {
          userId: fromUserId,
          currency: "gold",
          amount: PLUS_GIFT_PRICE_GOLD,
          reason: "plus_gift",
          reference: `plus-gift:${giftId}`,
          counterpartUserId: toUserId,
          now,
        }),
        writeSubscription(env, toUserId, previous, state, extras, now),
      ]);
      if (outcome === "duplicate") throw new Error("referência de presente de Plus repetida");
      return outcome;
    } catch (error) {
      if (attempt < GIFT_PLUS_ATTEMPTS && isSubscriptionConflict(error)) continue;
      throw error;
    }
  }
}
