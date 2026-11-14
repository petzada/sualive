/**
 * Contrato entre a lógica de conta do cliente (`src/lib/account`) e as telas. As telas só conhecem
 * `useAccount` e estes tipos: nada de fetch em componente.
 */
import type {
  AuthProvider,
  HandleAvailabilityResponse,
  MeUser,
  Plan,
  PlusCheckoutResponse,
  PlusCycle,
} from "@sualive/protocol";

export type AccountStatus =
  | "loading" // consultando /api/me
  | "anonymous" // sem login
  | "authenticated"
  | "error"; // falha ao consultar; `refresh()` tenta de novo

export interface AccountState {
  status: AccountStatus;
  /** Nulo fora de `authenticated`. `user.onboarded === false` → mandar para o primeiro acesso. */
  user: MeUser | null;
  /** Logins disponíveis neste ambiente; só eles ganham botão. */
  providers: AuthProvider[];
  /** A assinatura do Plus está ligada neste ambiente. */
  billingEnabled: boolean;
}

/** Motivo de falha de uma ação de conta, para a tela escolher o texto. */
export type AccountErrorReason =
  | "unauthorized"
  | "handleTaken"
  | "handleReserved"
  | "handleChangeTooSoon"
  | "plusRequired"
  | "billingUnavailable"
  | "alreadySubscribed"
  | "invalid" // dados recusados pelo servidor
  | "rateLimited"
  | "error";

export type AccountResult<T = void> = { ok: true; value: T } | { ok: false; reason: AccountErrorReason };

export type PaymentStatus = "pending" | "paid" | "expired" | "failed";

export interface AccountActions {
  /** Endereço para iniciar o login (navegação de página inteira). `returnTo` é um caminho local. */
  loginUrl(provider: AuthProvider, returnTo?: string): string;
  logout(): Promise<void>;
  /** Consulta /api/me de novo (ex.: depois de pagar). */
  refresh(): Promise<void>;
  /** Primeiro acesso: declara 18 anos, aceita os termos e escolhe o @nome. */
  completeOnboarding(input: { handle: string; adult: true; acceptTerms: true }): Promise<AccountResult>;
  updateProfile(input: { nickname?: string; handle?: string }): Promise<AccountResult>;
  checkHandle(handle: string): Promise<AccountResult<HandleAvailabilityResponse>>;
  /** Grava que a conta viu a versão atual dos termos: a faixa de aviso some (`user.termsUpdate`). */
  markTermsSeen(): Promise<AccountResult>;
  /** Apaga a conta e os dados pessoais; a pessoa volta a anônima. */
  deleteAccount(): Promise<AccountResult>;
  /** Cria a cobrança Pix do Plus e devolve o QR Code. */
  startPlusCheckout(input: { cycle: PlusCycle; taxId: string }): Promise<AccountResult<PlusCheckoutResponse>>;
  /**
   * Acompanha o pagamento enquanto o QR Code está na tela; chama `onChange` a cada mudança de
   * estado e atualiza a conta quando é pago. Devolve a função que cancela.
   */
  watchPlusPayment(paymentId: string, onChange: (status: PaymentStatus) => void): () => void;
  cancelPlus(): Promise<AccountResult<Plan>>;
}

/** Estado e ações de conta, compartilhados pela aplicação inteira (um só carregamento). */
export type UseAccount = () => { state: AccountState; actions: AccountActions };
