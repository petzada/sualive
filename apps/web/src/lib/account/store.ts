/**
 * Núcleo da conta, sem React: guarda o `AccountState`, fala com a API e avisa quem assina
 * (`subscribe`/`getSnapshot`, no formato do `useSyncExternalStore`). Tudo o que toca o navegador
 * chega por `AccountDeps`.
 *
 * `/api/me` é consultado uma vez, quando alguém assina ou pede a conta pela primeira vez; depois,
 * só com `refresh()` (ou quando uma ação precisa saber o estado novo).
 */
import {
  onboardingRequestSchema,
  plusCheckoutRequestSchema,
  updateMeRequestSchema,
  type AuthProvider,
  type MeUser,
} from "@sualive/protocol";
import { createAccountApi, type AccountApi, type AccountApiFailure, type AccountApiResult } from "./api";
import type { AccountDeps } from "./deps";
import type { AccountActions, AccountErrorReason, AccountResult, AccountState, PaymentStatus } from "./types";
import { watchPayment } from "./watch-payment";

export { PAYMENT_POLL_BASE_DELAY_MS, PAYMENT_POLL_MAX_DELAY_MS } from "./watch-payment";

/** Mesmo limite do servidor para o caminho de volta do login. */
const RETURN_TO_MAX_LENGTH = 512;

const INITIAL_STATE: AccountState = {
  status: "loading",
  user: null,
  providers: [],
  billingEnabled: false,
};

/** Código da API → motivo que a tela entende. */
export function toAccountErrorReason(error: AccountApiFailure): AccountErrorReason {
  switch (error) {
    case "handle_taken":
      return "handleTaken";
    case "handle_reserved":
      return "handleReserved";
    case "handle_change_too_soon":
      return "handleChangeTooSoon";
    case "plus_required":
      return "plusRequired";
    case "billing_unavailable":
      return "billingUnavailable";
    case "already_subscribed":
      return "alreadySubscribed";
    case "unauthorized":
    case "onboarding_required":
      return "unauthorized";
    case "invalid_request":
      return "invalid";
    case "rate_limited":
      return "rateLimited";
    default:
      return "error";
  }
}

/**
 * Caminho local seguro para voltar depois do login (mesma regra do servidor): começa com "/" e
 * não com "//" nem "/\", sem espaços, caracteres de controle ou barra invertida.
 */
export function isLocalPath(value: string): boolean {
  if (!value || value.length > RETURN_TO_MAX_LENGTH) return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return false;
  return !/[\s\p{Cc}\\]/u.test(value);
}

export function loginUrl(provider: AuthProvider, returnTo?: string): string {
  const path = `/api/auth/${encodeURIComponent(provider)}/start`;
  return returnTo !== undefined && isLocalPath(returnTo)
    ? `${path}?returnTo=${encodeURIComponent(returnTo)}`
    : path;
}

export class AccountStore {
  readonly actions: AccountActions;

  private state: AccountState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly api: AccountApi;
  private started = false;
  /** Muda a cada consulta de /api/me e a cada mudança local da conta: só vale a resposta mais nova. */
  private meRequest = 0;
  private pending: Promise<void> | null = null;

  constructor(private readonly deps: AccountDeps) {
    this.api = createAccountApi(deps.fetch);
    this.actions = {
      loginUrl,
      logout: () => this.logout(),
      refresh: () => this.refresh(),
      completeOnboarding: (input) => this.completeOnboarding(input),
      updateProfile: (input) => this.updateProfile(input),
      checkHandle: (handle) => this.checkHandle(handle),
      markTermsSeen: () => this.markTermsSeen(),
      deleteAccount: () => this.deleteAccount(),
      startPlusCheckout: (input) => this.startPlusCheckout(input),
      watchPlusPayment: (paymentId, onChange) => this.watchPlusPayment(paymentId, onChange),
      cancelPlus: () => this.cancelPlus(),
    };
  }

  // ---------- Assinatura ----------

  /** Assinar começa o carregamento (uma vez só). */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): AccountState => this.state;

  /** Conta logada depois do carregamento em andamento; `null` sem conta ou se a consulta falhou. */
  readonly current = async (): Promise<MeUser | null> => {
    this.start();
    while (this.pending) await this.pending;
    return this.state.status === "authenticated" ? this.state.user : null;
  };

  readonly refresh = (): Promise<void> => {
    this.started = true;
    return this.fetchMe();
  };

  private start(): void {
    if (this.started) return;
    this.started = true;
    void this.fetchMe();
  }

  private update(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  private fetchMe(): Promise<void> {
    const request = ++this.meRequest;
    if (this.state.status === "error") this.update({ status: "loading" });
    const tracked: Promise<void> = this.api
      .getMe()
      .then((result) => {
        if (request !== this.meRequest) return;
        if (!result.ok) {
          if (result.error !== "network") this.deps.report("account: me failed", { error: result.error });
          // Com a conta já conhecida, uma falha passageira não desloga ninguém.
          if (this.state.status === "loading") this.update({ status: "error", user: null });
          return;
        }
        const { user, providers, billingEnabled } = result.data;
        this.update({ status: user ? "authenticated" : "anonymous", user, providers, billingEnabled });
      })
      .finally(() => {
        if (this.pending === tracked) this.pending = null;
      });
    this.pending = tracked;
    return tracked;
  }

  /** A conta mudou por uma ação: vale sobre qualquer consulta de /api/me que ainda esteja no ar. */
  private setUser(user: MeUser | null): void {
    this.meRequest += 1;
    this.update({ status: user ? "authenticated" : "anonymous", user });
  }

  /** Trata a falha de uma rota que exige conta e devolve o motivo para a tela. */
  private failed(error: AccountApiFailure, route: string): AccountErrorReason {
    if (error === "unauthorized") {
      // A sessão não vale mais: a pessoa volta a anônima.
      if (this.state.status === "authenticated") this.setUser(null);
    } else if (error === "onboarding_required") {
      // O servidor sabe algo que o estado não sabe: consulta de novo.
      void this.refresh();
    } else if (error === "invalid_response" || error === "internal_error") {
      this.deps.report("account: request failed", { route, error });
    }
    return toAccountErrorReason(error);
  }

  private async run<T, R>(
    route: string,
    call: Promise<AccountApiResult<T>>,
    onOk: (data: T) => R,
  ): Promise<AccountResult<R>> {
    const result = await call;
    if (result.ok) return { ok: true, value: onOk(result.data) };
    return { ok: false, reason: this.failed(result.error, route) };
  }

  // ---------- Ações ----------

  private async logout(): Promise<void> {
    const result = await this.api.logout();
    if (result.ok || result.error === "unauthorized") {
      this.setUser(null);
      return;
    }
    // Não deu para confirmar a saída: o estado passa a ser o que o servidor disser.
    await this.refresh();
  }

  private completeOnboarding(input: {
    handle: string;
    adult: true;
    acceptTerms: true;
  }): Promise<AccountResult> {
    const body = onboardingRequestSchema.safeParse(input);
    if (!body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run("onboarding", this.api.completeOnboarding(body.data), (user) => {
      this.setUser(user);
    });
  }

  private updateProfile(input: { nickname?: string; handle?: string }): Promise<AccountResult> {
    const changes: { nickname?: string; handle?: string } = {};
    if (input.nickname !== undefined) changes.nickname = input.nickname;
    if (input.handle !== undefined) changes.handle = input.handle;
    const body = updateMeRequestSchema.safeParse(changes);
    if (!body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run("profile", this.api.updateMe(body.data), (user) => {
      this.setUser(user);
    });
  }

  private checkHandle(handle: string) {
    return this.run("handle", this.api.checkHandle(handle), (availability) => availability);
  }

  private markTermsSeen(): Promise<AccountResult> {
    return this.run("terms-seen", this.api.markTermsSeen(), (user) => {
      this.setUser(user);
    });
  }

  private deleteAccount(): Promise<AccountResult> {
    return this.run("delete", this.api.deleteMe(), () => {
      this.setUser(null);
    });
  }

  private startPlusCheckout(input: { cycle: "monthly" | "annual"; taxId: string }) {
    const body = plusCheckoutRequestSchema.safeParse(input);
    if (!body.success) return Promise.resolve({ ok: false as const, reason: "invalid" as const });
    // O CPF vai só no corpo do pedido: nunca em relato, URL ou estado.
    return this.run("checkout", this.api.startCheckout(body.data), (checkout) => checkout);
  }

  private cancelPlus() {
    return this.run("cancel", this.api.cancelPlus(), (plan) => {
      const user = this.state.user;
      if (this.state.status === "authenticated" && user) this.setUser({ ...user, plan });
      return plan;
    });
  }

  /** Acompanha o pagamento do Plus (veja `watchPayment`). Pago → atualiza a conta (o plano mudou). */
  private watchPlusPayment(paymentId: string, onChange: (status: PaymentStatus) => void): () => void {
    return watchPayment({
      deps: this.deps,
      fetchStatus: (signal) => this.api.getPayment(paymentId, signal),
      onPaid: () => void this.refresh(),
      onFailure: (error) => void this.failed(error, "payment"),
      onChange,
    });
  }
}
