/**
 * Contrato entre a lógica da carteira, da loja e dos presentes (`src/lib/wallet`) e as telas. As telas
 * só conhecem `useWallet` e estes tipos: nada de fetch em componente.
 *
 * A carteira só existe para conta logada com o primeiro acesso concluído. Nada é carregado antes de
 * uma tela pedir (`load`, `loadLedger`, `loadShop`); quando a conta sai ou muda, o estado volta ao
 * inicial e o que já tinha sido pedido é carregado de novo para a conta nova.
 */
import type { Currency, GoldPackId } from "@sualive/config";
import type { GoldCheckoutResponse, LedgerEntry, ShopItem, WalletResponse } from "@sualive/protocol";
import type { PaymentStatus } from "../account/types";

export type {
  Currency,
  GoldCheckoutResponse,
  GoldPackId,
  LedgerEntry,
  PaymentStatus,
  ShopItem,
  WalletResponse,
};

export type WalletStatus =
  | "idle" // ninguém pediu ainda (ou a conta saiu)
  | "loading" // primeira carga em andamento
  | "ready" // dados na mão; recargas acontecem por baixo, sem voltar a `loading`
  | "error"; // a primeira carga falhou; pedir de novo tenta outra vez

export interface LedgerState {
  status: WalletStatus;
  /** Linhas do extrato, mais recentes primeiro (todas as páginas já carregadas). */
  entries: LedgerEntry[];
  /** Há páginas mais antigas: `loadMoreLedger()` traz a próxima. */
  hasMore: boolean;
  /** Uma página a mais está sendo carregada. */
  loadingMore: boolean;
}

export interface ShopState {
  status: WalletStatus;
  /** Catálogo inteiro, com `owned` e `equipped` desta conta. */
  items: ShopItem[];
}

export interface GoldPack {
  id: GoldPackId;
  /** Preço em centavos de real. */
  priceCents: number;
  /** Ouro creditado quando o Pix é confirmado. */
  gold: number;
}

export interface WalletState {
  /** Estado dos saldos (`wallet`). */
  status: WalletStatus;
  /** Saldos, ouro enviado hoje e limite diário. Nulo até a primeira carga. */
  wallet: WalletResponse | null;
  /** Extrato paginado. */
  ledger: LedgerState;
  /** Catálogo da loja. */
  shop: ShopState;
  /** Pacotes de ouro à venda (de `GOLD_PACKS`), para a tela montar os botões sem pedir ao servidor. */
  goldPacks: readonly GoldPack[];
}

/** Motivo de falha de uma ação, para a tela escolher o texto. */
export type WalletErrorReason =
  | "unauthorized" // sem sessão ou sem primeiro acesso
  | "insufficientFunds" // saldo menor que o valor
  | "dailyLimit" // passaria do limite diário de envio de ouro
  | "recipientNotFound" // @nome inexistente ou sem primeiro acesso
  | "selfGift" // presente para a própria conta
  | "alreadyOwned" // item já comprado
  | "notOwned" // equipar item que não é da conta
  | "notFound" // item ou pagamento inexistente
  | "billingUnavailable" // venda de ouro desligada neste ambiente
  | "invalid" // dados recusados (pelo cliente, antes de enviar, ou pelo servidor)
  | "rateLimited"
  | "error"; // rede, servidor ou resposta inesperada

export type WalletResult<T = void> = { ok: true; value: T } | { ok: false; reason: WalletErrorReason };

export interface WalletActions {
  /** Carrega (ou recarrega) os saldos. */
  load(): Promise<void>;
  /** Carrega (ou recarrega) a primeira página do extrato, descartando as demais. */
  loadLedger(): Promise<void>;
  /** Traz a próxima página do extrato (nada se não há mais ou se já está carregando). */
  loadMoreLedger(): Promise<void>;
  /** Carrega (ou recarrega) o catálogo da loja. */
  loadShop(): Promise<void>;
  /**
   * Cria a cobrança Pix de um pacote de ouro e devolve o QR Code. O CPF (11 dígitos) vai só no corpo
   * do pedido: nunca fica no estado, em URL ou em relato.
   */
  startGoldCheckout(input: { packId: string; taxId: string }): Promise<WalletResult<GoldCheckoutResponse>>;
  /**
   * Acompanha o pagamento enquanto o QR Code está na tela (pausa com a aba oculta) e chama
   * `onChange` a cada mudança de estado. Pago → recarrega saldos e extrato. Devolve a função que
   * cancela.
   */
  watchGoldPayment(paymentId: string, onChange: (status: PaymentStatus) => void): () => void;
  /** Envia ouro a outra conta pelo @nome (com ou sem "@"). Atualiza os saldos e o extrato. */
  sendGold(input: { to: string; amount: number }): Promise<WalletResult>;
  /** Presenteia 30 dias de Plus a outra conta pelo @nome. Atualiza os saldos e o extrato. */
  giftPlus(input: { to: string }): Promise<WalletResult>;
  /** Compra um item pagando com a moeda escolhida. Atualiza saldos, loja e extrato. */
  buyItem(itemId: string, currency: Currency): Promise<WalletResult>;
  /** Equipa ou desequipa um item comprado. Atualiza a loja (o servidor desequipa o que conflita). */
  setEquipped(itemId: string, equipped: boolean): Promise<WalletResult>;
  /** Recarrega o que já foi carregado (saldos, extrato, loja). */
  refresh(): Promise<void>;
}

/** Estado e ações da carteira, compartilhados pela aplicação inteira. */
export type UseWallet = () => { state: WalletState; actions: WalletActions };
