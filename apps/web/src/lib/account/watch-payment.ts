/**
 * Consulta de um pagamento Pix enquanto o QR Code está na tela, usada pelo Plus (`AccountStore`) e
 * pelos pacotes de ouro (`WalletStore`).
 */
import type { AccountApiFailure, AccountApiResult } from "./api";
import type { AccountDeps, TimerId } from "./deps";
import type { PaymentStatus } from "./types";

// ---------- Tempos técnicos (não são regras de produto) ----------

/** Primeira espera da consulta do pagamento; cresce a cada consulta até o teto (ms). */
export const PAYMENT_POLL_BASE_DELAY_MS = 2_000;
export const PAYMENT_POLL_MAX_DELAY_MS = 15_000;
const PAYMENT_POLL_GROWTH = 1.5;

/** Falhas passageiras na consulta do pagamento: tenta de novo na próxima volta. */
const TRANSIENT_FAILURES: ReadonlySet<AccountApiFailure> = new Set([
  "network",
  "rate_limited",
  "internal_error",
  "invalid_response",
]);

export interface WatchPaymentOptions {
  deps: Pick<AccountDeps, "timers" | "visibility">;
  /** Consulta o estado do pagamento uma vez. */
  fetchStatus(signal: AbortSignal): Promise<AccountApiResult<{ status: PaymentStatus }>>;
  /** Pagamento confirmado (antes de avisar `onChange`). */
  onPaid(): void;
  /** Falha a relatar ou tratar: resposta fora do esquema (e segue) ou erro definitivo (e encerra). */
  onFailure(error: AccountApiFailure): void;
  onChange(status: PaymentStatus): void;
}

/**
 * Consulta com espera crescente até um estado final. Para quando é cancelada, pausa com a aba oculta
 * e retoma (na hora) quando ela volta. Erro definitivo (pagamento desconhecido, sessão perdida...)
 * encerra como `failed`. Devolve a função que cancela.
 */
export function watchPayment({
  deps,
  fetchStatus,
  onPaid,
  onFailure,
  onChange,
}: WatchPaymentOptions): () => void {
  const { timers, visibility } = deps;
  const controller = new AbortController();
  let stopped = false;
  let inFlight = false;
  let timer: TimerId | null = null;
  let delay = PAYMENT_POLL_BASE_DELAY_MS;
  let last: PaymentStatus | null = null;

  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const emit = (status: PaymentStatus) => {
    if (status === last) return;
    last = status;
    onChange(status);
  };
  const schedule = () => {
    clearTimer();
    if (stopped || visibility.isHidden()) return;
    timer = timers.setTimeout(() => {
      timer = null;
      void poll();
    }, delay);
    delay = Math.min(delay * PAYMENT_POLL_GROWTH, PAYMENT_POLL_MAX_DELAY_MS);
  };
  const poll = async () => {
    if (stopped || inFlight || visibility.isHidden()) return;
    inFlight = true;
    const result = await fetchStatus(controller.signal);
    inFlight = false;
    if (stopped) return;
    if (result.ok) {
      const { status } = result.data;
      if (status === "pending") {
        emit(status);
        schedule();
        return;
      }
      stop();
      if (status === "paid") onPaid();
      emit(status);
      return;
    }
    if (TRANSIENT_FAILURES.has(result.error)) {
      if (result.error === "invalid_response") onFailure(result.error);
      schedule();
      return;
    }
    stop();
    onFailure(result.error);
    emit("failed");
  };
  const stopVisibility = visibility.onChange(() => {
    if (stopped) return;
    if (visibility.isHidden()) clearTimer();
    else if (timer === null) void poll();
  });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer();
    stopVisibility();
    controller.abort();
  };

  schedule();
  return stop;
}
