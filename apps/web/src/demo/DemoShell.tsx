/**
 * Dev-only: while a demo session is chosen (see `DemoPage`), the whole app runs on the fake account
 * and room clients, so the real routes (`/entrar`, `/perfil`, `/plus`, `/@nome`…) can be walked
 * through without a server. Never part of a production build (see `App.tsx`), which is why its few
 * labels live here and not in `texts.ts`.
 */
import { ROOM_THEMES } from "@sualive/config";
import type { RoomTheme } from "@sualive/config";
import { useState } from "react";
import type { ReactNode } from "react";
import { AccountClientProvider } from "../components/account/AccountClient";
import { RoomClientProvider } from "../components/room/RoomClient";
import { WalletClientProvider } from "../components/wallet/WalletClient";
import { createDemoAccountClient, DEMO_ACCOUNT_LABELS, DEMO_ACCOUNTS } from "./fakeAccount";
import type { DemoAccountOptions } from "./fakeAccount";
import { createDemoClient } from "./fakeRoom";
import { createDemoWalletClient } from "./fakeWallet";

/** Same key that `App.tsx` looks for before loading this file. */
export const DEMO_SESSION_KEY = "sualive:demo";

export interface DemoSession extends DemoAccountOptions {
  /** Theme of the fixed-link room. */
  theme: RoomTheme;
  /** The viewer owns the rooms opened in the session. */
  owner: boolean;
}

export const DEFAULT_DEMO_SESSION: DemoSession = {
  account: "anon",
  billing: true,
  payment: "paid",
  providers: true,
  theme: "default",
  owner: true,
};

export function readDemoSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    return {
      ...DEFAULT_DEMO_SESSION,
      ...parsed,
      account: DEMO_ACCOUNTS.find((name) => name === parsed.account) ?? "anon",
      theme: ROOM_THEMES.find((name) => name === parsed.theme) ?? "default",
    };
  } catch {
    return null;
  }
}

/** Starts (or ends, with `null`) the session and reloads, since the shell is chosen at load. */
export function startDemoSession(session: DemoSession | null, path: string) {
  if (session) sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(DEMO_SESSION_KEY);
  window.location.assign(path);
}

/** The clients of a session: the room follows the account that was chosen. */
export function createDemoClients(session: DemoSession) {
  const logged = session.account !== "anon" && session.account !== "novo";
  const plus = ["mensal", "anual", "vencendo", "atraso", "cancelado"].includes(session.account);
  return {
    account: createDemoAccountClient(session),
    wallet: createDemoWalletClient({ logged, payment: session.payment }),
    room: createDemoClient({
      phase: "lobby",
      isOwner: session.owner,
      people: 5,
      videos: 2,
      mobile: false,
      notice: null,
      theme: session.theme,
      account: logged ? { nickname: "Marina", handle: "marina", avatarUrl: null, plus } : null,
    }),
  };
}

export default function DemoShell({ children }: { children: ReactNode }) {
  const [session] = useState(readDemoSession);
  const [clients] = useState(() => (session ? createDemoClients(session) : null));
  if (!session || !clients) return children;

  return (
    <AccountClientProvider client={clients.account}>
      <WalletClientProvider client={clients.wallet}>
        <RoomClientProvider client={clients.room}>
          {children}
          <a
            href="/demo"
            className="fixed bottom-2 left-2 z-50 rounded-button bg-ink px-3 py-1.5 text-compact text-canvas opacity-80"
          >
            demo · {DEMO_ACCOUNT_LABELS[session.account]} · trocar
          </a>
        </RoomClientProvider>
      </WalletClientProvider>
    </AccountClientProvider>
  );
}
