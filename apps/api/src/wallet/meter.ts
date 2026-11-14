import { PROTECTED_ROOM_WARNING_MINUTES } from "@sualive/config";
import type { LedgerReason } from "@sualive/protocol";
import type { AppEnv } from "../env";
import { debitStatements, getWallet, runLedger } from "./ledger";

/**
 * Cobrança por minuto do que gasta banda nossa (entrega 4): o vídeo em conexão retransmitida, pago
 * por quem transmite, e a sala protegida, paga pelo dono. O Durable Object da sala chama daqui a
 * cada tique; todo débito passa pelo livro-razão (`./ledger`), e o saldo nunca fica negativo.
 *
 * O preço é em ouro por hora, mas o ouro é inteiro e o tique é de um minuto: o que não fecha uma
 * unidade fica no `carry` (em "ouro × ms por hora") e é cobrado quando fechar. Nada é arredondado
 * para cima nem perdido.
 */

const HOUR_MS = 3_600_000;

export interface MeterCharge {
  /** Ouro inteiro a debitar agora. */
  gold: number;
  /** Fração ainda não cobrada, para o próximo tique. */
  carry: number;
}

/**
 * Quanto cobrar por `elapsedMs` a `goldPerHour` ouro por hora, vezes `units` (pares retransmitidos;
 * 1 na sala protegida), somando o `carry` do tique anterior.
 */
export function meterCharge(
  goldPerHour: number,
  units: number,
  elapsedMs: number,
  carry: number,
): MeterCharge {
  if (![goldPerHour, units, elapsedMs, carry].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error("medição inválida");
  }
  const accrued = carry + goldPerHour * units * elapsedMs;
  return { gold: Math.floor(accrued / HOUR_MS), carry: accrued % HOUR_MS };
}

/** Por quanto tempo `balance` de ouro ainda cobre `goldPerHour × units` (ms). Infinito se nada é cobrado. */
export function meterRemainingMs(balance: number, goldPerHour: number, units: number, carry = 0): number {
  const rate = goldPerHour * units;
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((balance * HOUR_MS - carry) / rate));
}

/**
 * Avisos de saldo da sala protegida que passaram a valer: os limiares (em minutos) que o tempo
 * restante acabou de cruzar para baixo e que ainda não foram avisados. `warned` guarda os já dados;
 * quando o saldo volta a ficar acima de um limiar (recarga), ele sai de `warned` e pode avisar de novo.
 */
export function meterWarnings(
  remainingMs: number,
  warned: readonly number[],
): { fire: number[]; warned: number[] } {
  const below = PROTECTED_ROOM_WARNING_MINUTES.filter((minutes) => remainingMs <= minutes * 60_000);
  return { fire: below.filter((minutes) => !warned.includes(minutes)), warned: [...below] };
}

export interface MeterDebit {
  userId: string;
  /** Ouro inteiro do tique (de `meterCharge`). */
  gold: number;
  reason: Extract<LedgerReason, "relay_video" | "protected_room">;
  /** Única por tique e por pagante. Ex.: `protected:<sala>:<instante do tique>`. */
  reference: string;
  now: number;
}

export interface MeterDebitResult {
  /** Ouro efetivamente debitado: o pedido, ou o que havia de saldo. */
  charged: number;
  /** O saldo não cobriu o tique inteiro: quem paga ficou sem ouro. */
  exhausted: boolean;
  /** Saldo de ouro depois do débito. */
  balance: number;
}

/**
 * Debita o tique. Se o saldo não cobre tudo, debita o que há (o saldo vai a zero, nunca abaixo) e
 * devolve `exhausted`. Referência repetida (o mesmo tique duas vezes) não debita de novo.
 */
export async function debitMeter(env: AppEnv, debit: MeterDebit): Promise<MeterDebitResult> {
  const { userId, reason, reference, now } = debit;
  let wanted = debit.gold;
  if (!Number.isSafeInteger(wanted) || wanted < 0) throw new Error("ouro do tique inválido");
  let exhausted = false;
  let charged = 0;
  // Um gasto simultâneo pode baixar o saldo entre a leitura e o débito: lê de novo e tenta outra vez.
  for (let attempt = 0; attempt < 3 && wanted > 0; attempt++) {
    const outcome = await runLedger(
      env,
      debitStatements(env, { userId, currency: "gold", amount: wanted, reason, reference, now }),
    );
    if (outcome === "ok") {
      charged = wanted;
      break;
    }
    if (outcome === "duplicate") break;
    if (outcome !== "insufficient_funds")
      throw new Error(`débito de medição: resultado inesperado ${outcome}`);
    exhausted = true;
    wanted = Math.min(wanted, (await getWallet(env, userId, now)).gold);
  }
  const { gold: balance } = await getWallet(env, userId, now);
  return { charged, exhausted, balance };
}
