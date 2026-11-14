/**
 * Núcleo da carteira, da loja e dos presentes, sem React: guarda o `WalletState`, fala com a API e
 * avisa quem assina (`subscribe`/`getSnapshot`, no formato do `useSyncExternalStore`). Tudo o que
 * toca o navegador e a conta chega por `WalletDeps`.
 *
 * - Nada é carregado antes de alguém pedir; o que foi pedido fica lembrado (`wanted`) para `refresh()`
 *   e para recarregar quando a conta muda.
 * - A carteira só existe para conta logada com o primeiro acesso concluído. Pedido feito enquanto a
 *   conta ainda carrega espera por ela; sem conta, fica em `idle`.
 * - Quando a conta sai ou muda, o estado zera e respostas e consultas de pagamento em andamento são
 *   descartadas.
 * - Uma resposta velha nunca sobrescreve uma mais nova: cada parte (saldos, extrato, loja) tem o seu
 *   contador, que também anda quando uma ação traz o dado novo.
 */
import { GOLD_PACKS } from "@sualive/config";
import {
  buyItemRequestSchema,
  equipItemRequestSchema,
  giftGoldRequestSchema,
  giftPlusRequestSchema,
  goldCheckoutRequestSchema,
  type ShopItem,
  type WalletResponse,
} from "@sualive/protocol";
import type { AccountState } from "../account/types";
import { watchPayment } from "../account/watch-payment";
import { createWalletApi, type WalletApi, type WalletApiFailure, type WalletApiResult } from "./api";
import type { WalletDeps } from "./deps";
import type {
  LedgerState,
  PaymentStatus,
  ShopState,
  WalletActions,
  WalletErrorReason,
  WalletResult,
  WalletState,
  WalletStatus,
} from "./types";

type Resource = "wallet" | "ledger" | "shop";

const INITIAL_LEDGER: LedgerState = { status: "idle", entries: [], hasMore: false, loadingMore: false };
const INITIAL_SHOP: ShopState = { status: "idle", items: [] };
const INITIAL_STATE: WalletState = {
  status: "idle",
  wallet: null,
  ledger: INITIAL_LEDGER,
  shop: INITIAL_SHOP,
  goldPacks: GOLD_PACKS,
};

/** Código da API → motivo que a tela entende. */
export function toWalletErrorReason(error: WalletApiFailure): WalletErrorReason {
  switch (error) {
    case "unauthorized":
    case "onboarding_required":
      return "unauthorized";
    case "insufficient_funds":
      return "insufficientFunds";
    case "daily_limit":
      return "dailyLimit";
    case "recipient_not_found":
      return "recipientNotFound";
    case "self_gift":
      return "selfGift";
    case "already_owned":
      return "alreadyOwned";
    case "not_owned":
      return "notOwned";
    case "not_found":
      return "notFound";
    case "billing_unavailable":
      return "billingUnavailable";
    case "invalid_request":
      return "invalid";
    case "rate_limited":
      return "rateLimited";
    default:
      return "error";
  }
}

/** Conta que tem carteira: logada e com o primeiro acesso concluído. */
function walletOwner(account: AccountState): string | null {
  return account.status === "authenticated" && account.user?.onboarded ? account.user.id : null;
}

/** Resultado sem valor, para as ações que só mudam o estado. */
function done<T>(result: WalletResult<T>): WalletResult {
  return result.ok ? { ok: true, value: undefined } : result;
}

/** @nome digitado pela pessoa, sem espaços nas pontas nem o "@" do começo. */
function cleanHandle(value: string): string {
  return value.trim().replace(/^@/, "");
}

export class WalletStore {
  readonly actions: WalletActions;

  private state: WalletState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly api: WalletApi;
  private started = false;
  private stopAccount: (() => void) | null = null;
  /** Conta dona do estado atual (`null` = sem carteira). */
  private owner: string | null = null;
  /** Muda a cada troca de conta: invalida tudo o que estava em andamento. */
  private generation = 0;
  private readonly wanted = new Set<Resource>();
  private readonly seq: Record<Resource, number> = { wallet: 0, ledger: 0, shop: 0 };
  private nextCursor: string | null = null;
  private morePending: Promise<void> | null = null;
  private readonly watchers = new Set<() => void>();

  constructor(private readonly deps: WalletDeps) {
    this.api = createWalletApi(deps.fetch);
    this.actions = {
      load: () => this.request("wallet"),
      loadLedger: () => this.request("ledger"),
      loadMoreLedger: () => this.loadMoreLedger(),
      loadShop: () => this.request("shop"),
      startGoldCheckout: (input) => this.startGoldCheckout(input),
      watchGoldPayment: (paymentId, onChange) => this.watchGoldPayment(paymentId, onChange),
      sendGold: (input) => this.sendGold(input),
      giftPlus: (input) => this.giftPlus(input),
      buyItem: (itemId, currency) => this.buyItem(itemId, currency),
      setEquipped: (itemId, equipped) => this.setEquipped(itemId, equipped),
      refresh: () => this.refresh(),
    };
  }

  // ---------- Assinatura ----------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): WalletState => this.state;

  /** Para de ouvir a conta e cancela as consultas de pagamento (testes). */
  dispose(): void {
    this.stopAccount?.();
    this.stopAccount = null;
    this.stopWatchers();
    this.listeners.clear();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.owner = walletOwner(this.deps.account.getSnapshot());
    this.stopAccount = this.deps.account.subscribe(() => this.onAccount());
  }

  private update(patch: Partial<WalletState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  private setLedger(patch: Partial<LedgerState>): void {
    this.update({ ledger: { ...this.state.ledger, ...patch } });
  }

  private setShop(patch: Partial<ShopState>): void {
    this.update({ shop: { ...this.state.shop, ...patch } });
  }

  private statusOf(resource: Resource): WalletStatus {
    if (resource === "wallet") return this.state.status;
    return this.state[resource].status;
  }

  private setStatus(resource: Resource, status: WalletStatus): void {
    if (this.statusOf(resource) === status) return;
    if (resource === "wallet") this.update({ status });
    else if (resource === "ledger") this.setLedger({ status });
    else this.setShop({ status });
  }

  // ---------- Conta ----------

  private onAccount(): void {
    const account = this.deps.account.getSnapshot();
    const owner = walletOwner(account);
    if (owner !== this.owner) {
      this.reset(owner);
      return;
    }
    // Sem carteira: o que foi pedido espera a conta carregar ou fica parado.
    if (owner === null) for (const resource of this.wanted) this.waitForAccount(resource);
  }

  /** Outra conta (ou nenhuma): zera tudo e carrega de novo o que já tinha sido pedido. */
  private reset(owner: string | null): void {
    this.owner = owner;
    this.generation += 1;
    for (const resource of Object.keys(this.seq) as Resource[]) this.seq[resource] += 1;
    this.nextCursor = null;
    this.morePending = null;
    this.stopWatchers();
    this.update(INITIAL_STATE);
    for (const resource of this.wanted) void this.fetch(resource);
  }

  private waitForAccount(resource: Resource): void {
    if (this.statusOf(resource) === "ready") return;
    this.setStatus(resource, this.deps.account.getSnapshot().status === "loading" ? "loading" : "idle");
  }

  private stopWatchers(): void {
    for (const stop of [...this.watchers]) stop();
  }

  // ---------- Cargas ----------

  private request(resource: Resource): Promise<void> {
    this.start();
    this.wanted.add(resource);
    return this.fetch(resource);
  }

  private fetch(resource: Resource): Promise<void> {
    if (resource === "wallet") return this.fetchWallet();
    if (resource === "ledger") return this.fetchLedger();
    return this.fetchShop();
  }

  private async refresh(): Promise<void> {
    this.start();
    await Promise.all([...this.wanted].map((resource) => this.fetch(resource)));
  }

  /** Começa uma carga: devolve o que confere se a resposta ainda vale, ou `null` sem carteira. */
  private begin(resource: Resource): (() => boolean) | null {
    if (this.owner === null) {
      this.waitForAccount(resource);
      return null;
    }
    const generation = this.generation;
    const request = ++this.seq[resource];
    if (this.statusOf(resource) !== "ready") this.setStatus(resource, "loading");
    return () => generation === this.generation && request === this.seq[resource];
  }

  /** Falha de uma carga: com dado na mão, segue com ele; sem, vira `error`. */
  private loadFailed(resource: Resource, error: WalletApiFailure): void {
    this.failed(error, resource);
    if (this.statusOf(resource) !== "ready") this.setStatus(resource, "error");
  }

  private async fetchWallet(): Promise<void> {
    const current = this.begin("wallet");
    if (!current) return;
    const result = await this.api.getWallet();
    if (!current()) return;
    if (result.ok) this.update({ status: "ready", wallet: result.data });
    else this.loadFailed("wallet", result.error);
  }

  private async fetchLedger(): Promise<void> {
    const current = this.begin("ledger");
    if (!current) return;
    this.morePending = null;
    if (this.state.ledger.loadingMore) this.setLedger({ loadingMore: false });
    const result = await this.api.getLedger();
    if (!current()) return;
    if (!result.ok) {
      this.loadFailed("ledger", result.error);
      return;
    }
    this.nextCursor = result.data.nextCursor;
    this.setLedger({
      status: "ready",
      entries: result.data.entries,
      hasMore: result.data.nextCursor !== null,
      loadingMore: false,
    });
  }

  private loadMoreLedger(): Promise<void> {
    this.start();
    const cursor = this.nextCursor;
    if (this.owner === null || this.state.ledger.status !== "ready" || cursor === null) {
      return Promise.resolve();
    }
    if (this.morePending) return this.morePending;
    const generation = this.generation;
    const request = this.seq.ledger;
    const current = () => generation === this.generation && request === this.seq.ledger;
    this.setLedger({ loadingMore: true });
    const pending: Promise<void> = this.api.getLedger(cursor).then((result) => {
      if (this.morePending === pending) this.morePending = null;
      if (!current()) return;
      if (!result.ok) {
        this.failed(result.error, "ledger");
        this.setLedger({ loadingMore: false });
        return;
      }
      const known = new Set(this.state.ledger.entries.map((entry) => entry.id));
      this.nextCursor = result.data.nextCursor;
      this.setLedger({
        entries: [
          ...this.state.ledger.entries,
          ...result.data.entries.filter((entry) => !known.has(entry.id)),
        ],
        hasMore: result.data.nextCursor !== null,
        loadingMore: false,
      });
    });
    this.morePending = pending;
    return pending;
  }

  private async fetchShop(): Promise<void> {
    const current = this.begin("shop");
    if (!current) return;
    const result = await this.api.getShop();
    if (!current()) return;
    if (result.ok) this.setShop({ status: "ready", items: result.data.items });
    else this.loadFailed("shop", result.error);
  }

  // ---------- Dados novos trazidos por ações ----------

  private applyWallet(wallet: WalletResponse): void {
    this.seq.wallet += 1;
    this.update({ status: "ready", wallet });
  }

  private applyShop(items: ShopItem[]): void {
    this.seq.shop += 1;
    this.setShop({ status: "ready", items });
  }

  /** Um movimento novo entrou no livro-razão: o extrato já carregado é recarregado. */
  private reloadLedger(): void {
    if (this.wanted.has("ledger")) void this.fetchLedger();
  }

  // ---------- Ações ----------

  /** Trata a falha de uma rota e devolve o motivo para a tela (nunca relata dado pessoal). */
  private failed(error: WalletApiFailure, route: string): WalletErrorReason {
    if (error === "unauthorized" || error === "onboarding_required") {
      // O servidor sabe algo que o estado não sabe: a conta é consultada de novo (e, se mudou, a
      // carteira zera).
      void this.deps.account.refresh().catch(() => undefined);
    } else if (error === "invalid_response" || error === "internal_error") {
      this.deps.report("wallet: request failed", { route, error });
    }
    return toWalletErrorReason(error);
  }

  /**
   * Faz a ação e, se deu certo, põe no estado o dado novo que ela trouxe (`apply`). Se a conta mudou
   * no meio, o resultado é de outra carteira: volta para quem pediu, mas não entra no estado.
   */
  private async run<T>(
    route: string,
    call: () => Promise<WalletApiResult<T>>,
    apply: (data: T) => void,
  ): Promise<WalletResult<T>> {
    this.start();
    if (this.owner === null) return { ok: false, reason: "unauthorized" };
    const generation = this.generation;
    const result = await call();
    const sameAccount = generation === this.generation;
    if (result.ok) {
      if (sameAccount) apply(result.data);
      return { ok: true, value: result.data };
    }
    const reason = this.failed(result.error, route);
    // Recusa por saldo ou limite: os números na tela estavam velhos.
    if (
      sameAccount &&
      (reason === "insufficientFunds" || reason === "dailyLimit") &&
      this.wanted.has("wallet")
    ) {
      void this.fetchWallet();
    }
    return { ok: false, reason };
  }

  private startGoldCheckout(input: { packId: string; taxId: string }) {
    const body = goldCheckoutRequestSchema.safeParse(input);
    if (!body.success) return Promise.resolve({ ok: false as const, reason: "invalid" as const });
    // O CPF vai só no corpo do pedido: nunca em relato, URL ou estado.
    return this.run(
      "gold-checkout",
      () => this.api.startGoldCheckout(body.data),
      () => undefined,
    );
  }

  private watchGoldPayment(paymentId: string, onChange: (status: PaymentStatus) => void): () => void {
    this.start();
    const stopWatch = watchPayment({
      deps: this.deps,
      fetchStatus: (signal) => this.api.getGoldPayment(paymentId, signal),
      onPaid: () => {
        // O ouro entrou: saldos e extrato mudaram.
        this.wanted.add("wallet");
        void this.refresh();
      },
      onFailure: (error) => void this.failed(error, "gold-payment"),
      onChange,
    });
    const stop = () => {
      this.watchers.delete(stop);
      stopWatch();
    };
    this.watchers.add(stop);
    return stop;
  }

  private sendGold(input: { to: string; amount: number }): Promise<WalletResult> {
    const body = giftGoldRequestSchema.safeParse({ to: cleanHandle(input.to), amount: input.amount });
    if (!body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run(
      "gift-gold",
      () => this.api.giftGold(body.data),
      (wallet) => {
        this.applyWallet(wallet);
        this.reloadLedger();
      },
    ).then(done);
  }

  private giftPlus(input: { to: string }): Promise<WalletResult> {
    const body = giftPlusRequestSchema.safeParse({ to: cleanHandle(input.to) });
    if (!body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run(
      "gift-plus",
      () => this.api.giftPlus(body.data),
      (wallet) => {
        this.applyWallet(wallet);
        this.reloadLedger();
      },
    ).then(done);
  }

  private buyItem(itemId: string, currency: string): Promise<WalletResult> {
    const body = buyItemRequestSchema.safeParse({ currency });
    if (!itemId || !body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run(
      "shop-buy",
      () => this.api.buyItem(itemId, body.data),
      ({ wallet, items }) => {
        this.applyWallet(wallet);
        this.applyShop(items);
        this.reloadLedger();
      },
    ).then(done);
  }

  private setEquipped(itemId: string, equipped: boolean): Promise<WalletResult> {
    const body = equipItemRequestSchema.safeParse({ equipped });
    if (!itemId || !body.success) return Promise.resolve({ ok: false, reason: "invalid" });
    return this.run(
      "shop-equip",
      () => this.api.equipItem(itemId, body.data),
      ({ items }) => {
        this.applyShop(items);
      },
    ).then(done);
  }
}
