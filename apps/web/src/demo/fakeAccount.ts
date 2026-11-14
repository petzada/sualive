/**
 * Fake account client for the dev-only demo. Nothing here talks to a server: the account lives in
 * memory, every action just edits it, and a reload goes back to the chosen scenario.
 */
import {
  HANDLE_CHANGE_INTERVAL_DAYS,
  PLUS_ANNUAL_PERIOD_DAYS,
  PLUS_ANNUAL_PRICE_CENTS,
  PLUS_MONTHLY_PERIOD_DAYS,
  PLUS_MONTHLY_PRICE_CENTS,
  RESERVED_HANDLES,
  TERMS_VERSION,
} from "@sualive/config";
import type { MeUser, Plan } from "@sualive/protocol";
import { useSyncExternalStore } from "react";
import type { AccountClient } from "../components/account/AccountClient";
import type { AccountActions, AccountState, PaymentStatus } from "../lib/account";

export const DEMO_ACCOUNTS = [
  "anon",
  "novo",
  "gratis",
  "aviso",
  "mensal",
  "anual",
  "vencendo",
  "atraso",
  "cancelado",
  "encerrado",
] as const;
export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export const DEMO_ACCOUNT_LABELS: Record<DemoAccount, string> = {
  anon: "Sem login",
  novo: "Logado, sem primeiro acesso",
  gratis: "Conta gratuita",
  aviso: "Conta gratuita com aviso de mudança dos termos",
  mensal: "Plus mensal ativo",
  anual: "Plus anual ativo",
  vencendo: "Plus anual a 5 dias de vencer",
  atraso: "Plus mensal em atraso",
  cancelado: "Plus cancelado (vale até o fim)",
  encerrado: "Plus encerrado",
};

export interface DemoAccountOptions {
  account: DemoAccount;
  /** `false`: billing is off in this environment. */
  billing: boolean;
  /** How the fake payment ends, a few seconds after the QR Code shows. */
  payment: PaymentStatus;
  /** `false`: no login provider configured. */
  providers: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_DELAY_MS = 6000;

/** Drawn here, so the demo asks nothing from the network. */
export function demoAvatar(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 55% 62%)"/><circle cx="32" cy="26" r="12" fill="hsl(${hue} 60% 88%)"/><path d="M8 64a24 24 0 0 1 48 0z" fill="hsl(${hue} 60% 88%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** QR-like square, enough to see the layout of the payment. */
function demoQrCode(): string {
  let cells = "";
  for (let row = 0; row < 21; row += 1) {
    for (let column = 0; column < 21; column += 1) {
      if ((row * 7 + column * 13 + ((row * column) % 5)) % 3 === 0) {
        cells += `<rect x="${column}" y="${row}" width="1" height="1"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 23 23"><rect x="-1" y="-1" width="23" height="23" fill="white"/>${cells}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function planOf(account: DemoAccount): Plan {
  const now = Date.now();
  switch (account) {
    case "mensal":
      return { status: "active", plus: true, cycle: "monthly", periodEnd: now + 18 * DAY_MS, renews: true };
    case "anual":
      return { status: "active", plus: true, cycle: "annual", periodEnd: now + 200 * DAY_MS, renews: false };
    case "vencendo":
      return { status: "active", plus: true, cycle: "annual", periodEnd: now + 5 * DAY_MS, renews: false };
    case "atraso":
      return { status: "past_due", plus: true, cycle: "monthly", periodEnd: now - DAY_MS, renews: false };
    case "cancelado":
      return { status: "canceled", plus: true, cycle: "monthly", periodEnd: now + 9 * DAY_MS, renews: false };
    case "encerrado":
      return { status: "ended", plus: false, cycle: "monthly", periodEnd: now - 3 * DAY_MS, renews: false };
    default:
      return { status: "none", plus: false, cycle: null, periodEnd: null, renews: false };
  }
}

function userOf(account: DemoAccount): MeUser | null {
  if (account === "anon") return null;
  const plan = planOf(account);
  const onboarded = account !== "novo";
  return {
    id: "demo-user",
    handle: onboarded ? "marina" : null,
    nickname: "Marina",
    avatarUrl: demoAvatar(265),
    onboarded,
    badges: plan.plus ? ["plus", "early_supporter"] : account === "encerrado" ? ["early_supporter"] : [],
    plan,
    roomTheme: "default",
    handleChangeAvailableAt: account === "cancelado" ? Date.now() + 12 * DAY_MS : null,
    fixedRoomProtected: false,
    termsUpdate: account === "aviso" ? TERMS_VERSION : null,
  };
}

const TAKEN_HANDLES = ["caio", "bia", "teste"];

export function createDemoAccountClient(options: DemoAccountOptions): AccountClient {
  const user = userOf(options.account);
  let state: AccountState = {
    status: user ? "authenticated" : "anonymous",
    user,
    providers: options.providers ? ["google", "discord"] : [],
    billingEnabled: options.billing,
  };
  const listeners = new Set<() => void>();

  const setState = (next: AccountState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const patchUser = (change: Partial<MeUser>) => {
    if (state.user) setState({ ...state, user: { ...state.user, ...change } });
  };
  const wait = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
  const refusal = (handle: string) =>
    TAKEN_HANDLES.includes(handle)
      ? ("handleTaken" as const)
      : (RESERVED_HANDLES as readonly string[]).includes(handle)
        ? ("handleReserved" as const)
        : null;

  const actions: AccountActions = {
    // The demo has no provider to go to: "logging in" just comes back to the demo index.
    loginUrl: () => "/demo",
    async logout() {
      await wait();
      setState({ ...state, status: "anonymous", user: null });
    },
    async refresh() {
      await wait();
    },
    async completeOnboarding({ handle }) {
      await wait();
      const reason = refusal(handle);
      if (reason) return { ok: false, reason };
      patchUser({ handle, onboarded: true });
      return { ok: true, value: undefined };
    },
    async updateProfile({ nickname, handle }) {
      await wait();
      if (handle !== undefined) {
        const reason = refusal(handle);
        if (reason) return { ok: false, reason };
        patchUser({
          handle,
          handleChangeAvailableAt: Date.now() + HANDLE_CHANGE_INTERVAL_DAYS * DAY_MS,
        });
      }
      if (nickname !== undefined) patchUser({ nickname });
      return { ok: true, value: undefined };
    },
    async checkHandle(handle) {
      await wait(300);
      const reason = refusal(handle);
      return {
        ok: true,
        value: reason
          ? { available: false, reason: reason === "handleTaken" ? "taken" : "reserved" }
          : { available: true },
      };
    },
    async deleteAccount() {
      await wait();
      setState({ ...state, status: "anonymous", user: null });
      return { ok: true, value: undefined };
    },
    async startPlusCheckout({ cycle }) {
      await wait(700);
      if (!state.billingEnabled) return { ok: false, reason: "billingUnavailable" };
      if (state.user?.plan.plus) return { ok: false, reason: "alreadySubscribed" };
      return {
        ok: true,
        value: {
          paymentId: `demo-${Date.now()}-${cycle}`,
          cycle,
          amountCents: cycle === "monthly" ? PLUS_MONTHLY_PRICE_CENTS : PLUS_ANNUAL_PRICE_CENTS,
          brCode:
            "00020126580014br.gov.bcb.pix0136demo-0000-0000-0000-sualive5204000053039865802BR5907SUALIVE6009SAO PAULO62070503***6304DEMO",
          qrCodeImageUrl: demoQrCode(),
          expiresAt: Date.now() + 15 * 60 * 1000,
        },
      };
    },
    watchPlusPayment(paymentId, onChange) {
      const timer = setTimeout(() => {
        if (options.payment === "paid") {
          const annual = paymentId.endsWith("annual");
          const days = annual ? PLUS_ANNUAL_PERIOD_DAYS : PLUS_MONTHLY_PERIOD_DAYS;
          patchUser({
            badges: ["plus", "early_supporter"],
            plan: {
              status: "active",
              plus: true,
              cycle: annual ? "annual" : "monthly",
              periodEnd: Date.now() + days * DAY_MS,
              renews: !annual,
            },
          });
        }
        if (options.payment !== "pending") onChange(options.payment);
      }, PAYMENT_DELAY_MS);
      return () => clearTimeout(timer);
    },
    async markTermsSeen() {
      await wait();
      if (!state.user) return { ok: false, reason: "unauthorized" };
      patchUser({ termsUpdate: null });
      return { ok: true, value: undefined };
    },
    async cancelPlus() {
      await wait();
      const current = state.user?.plan;
      if (!current) return { ok: false, reason: "unauthorized" };
      const plan: Plan = { ...current, status: "canceled", renews: false };
      patchUser({ plan });
      return { ok: true, value: plan };
    },
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    useAccount() {
      const current = useSyncExternalStore(subscribe, () => state);
      return { state: current, actions };
    },
  };
}
