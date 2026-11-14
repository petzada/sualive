/**
 * Dev-only demo (`/demo`). Two things live here:
 *  - room scenes driven by the query string (`?fase=…`), with fake room and account clients;
 *  - the chooser of a demo session, which makes the whole app run on the fake account (see
 *    `DemoShell`), to walk through login, first access, profile, plan and the fixed-link room.
 * Never part of a production build (see `App.tsx`), which is why its few labels live here and not
 * in `texts.ts`.
 */
import { ROOM_THEMES } from "@sualive/config";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AccountClientProvider } from "../components/account/AccountClient";
import { RoomClientProvider } from "../components/room/RoomClient";
import type { PaymentStatus } from "../lib/account";
import type { RoomNotice, RoomPhase } from "../lib/room";
import { RoomScreen } from "../pages/RoomPage";
import { DEFAULT_DEMO_SESSION, readDemoSession, startDemoSession } from "./DemoShell";
import type { DemoSession } from "./DemoShell";
import { createDemoAccountClient, DEMO_ACCOUNT_LABELS, DEMO_ACCOUNTS, demoAvatar } from "./fakeAccount";
import { createDemoClient } from "./fakeRoom";

const PHASES: RoomPhase[] = [
  "loading",
  "lobby",
  "joining",
  "connected",
  "reconnecting",
  "ended",
  "full",
  "banned",
  "kicked",
  "error",
];

const SCENES = [
  { label: "Sala: dono, 3 vídeos", query: "fase=connected&dono=1&pessoas=5&videos=3" },
  { label: "Sala: convidado, 4 vídeos", query: "fase=connected&pessoas=6&videos=4" },
  { label: "Sala: sem vídeo", query: "fase=connected&pessoas=4&videos=0" },
  { label: "Sala: celular (sem tela)", query: "fase=connected&pessoas=4&videos=2&celular=1" },
  { label: "Sala: aviso", query: "fase=connected&pessoas=3&videos=1&aviso=videoPersonLimit" },
  { label: "Lobby: logado", query: "fase=lobby&conta=1" },
  {
    label: "Sala fixa: dono Plus, tema Oceano, 2 vídeos",
    query: "fase=connected&dono=1&pessoas=5&videos=2&fixa=marina&tema=ocean&conta=1&plus=1",
  },
  ...ROOM_THEMES.map((theme) => ({
    label: `Sala fixa sem vídeo: tema ${theme}`,
    query: `fase=connected&dono=1&pessoas=5&videos=0&fixa=marina&tema=${theme}&conta=1&plus=1`,
  })),
  { label: "Sala fixa: convidado", query: "fase=connected&pessoas=4&videos=1&fixa=marina&tema=sunset" },
];

const PAGES = [
  { label: "início", path: "/" },
  { label: "entrar", path: "/entrar" },
  { label: "primeiro acesso", path: "/boas-vindas" },
  { label: "perfil", path: "/perfil" },
  { label: "depois do primeiro acesso", path: "/bem-vindo" },
  { label: "plus (oferta)", path: "/plus" },
  { label: "plano da conta", path: "/plano" },
  { label: "termos", path: "/termos" },
  { label: "privacidade", path: "/privacidade" },
  { label: "sala fixa", path: "/@marina" },
  { label: "sala comum", path: "/s/demo234567" },
];

const PAYMENTS: PaymentStatus[] = ["paid", "pending", "expired", "failed"];

function SessionChooser() {
  const [session, setSession] = useState<DemoSession>(() => readDemoSession() ?? DEFAULT_DEMO_SESSION);
  const active = readDemoSession() !== null;
  const field = "rounded-link bg-canvas px-2 py-1 shadow-outline";

  return (
    <section className="flex flex-col gap-3 rounded-nav bg-mist p-4">
      <h2 className="font-semibold">Sessão de demonstração (conta falsa em todas as telas)</h2>
      <div className="flex flex-wrap items-center gap-3 text-body-sm">
        <label className="flex items-center gap-2">
          Conta
          <select
            className={field}
            value={session.account}
            onChange={(event) =>
              setSession({ ...session, account: event.target.value as DemoSession["account"] })
            }
          >
            {DEMO_ACCOUNTS.map((name) => (
              <option key={name} value={name}>
                {DEMO_ACCOUNT_LABELS[name]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Pagamento termina em
          <select
            className={field}
            value={session.payment}
            onChange={(event) => setSession({ ...session, payment: event.target.value as PaymentStatus })}
          >
            {PAYMENTS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Tema da sala fixa
          <select
            className={field}
            value={session.theme}
            onChange={(event) =>
              setSession({ ...session, theme: event.target.value as DemoSession["theme"] })
            }
          >
            {ROOM_THEMES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {(
          [
            ["billing", "cobrança ligada"],
            ["providers", "logins disponíveis"],
            ["owner", "dono das salas"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={session[key]}
              onChange={(event) => setSession({ ...session, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-body-sm">
        {PAGES.map((page) => (
          <button
            key={page.path}
            type="button"
            className="cursor-pointer rounded-button bg-canvas px-3 py-1.5 shadow-outline"
            onClick={() => startDemoSession(session, page.path)}
          >
            Abrir: {page.label}
          </button>
        ))}
        {active && (
          <button
            type="button"
            className="cursor-pointer rounded-button px-3 py-1.5 text-link underline"
            onClick={() => startDemoSession(null, "/demo")}
          >
            Encerrar a sessão
          </button>
        )}
      </div>
    </section>
  );
}

export default function DemoPage() {
  const [params] = useSearchParams();
  const phase = PHASES.find((name) => name === params.get("fase"));
  const query = params.toString();

  const clients = useMemo(() => {
    const read = new URLSearchParams(query);
    const noticeKind = read.get("aviso");
    const logged = read.get("conta") === "1";
    const plus = read.get("plus") === "1";
    const avatarUrl = demoAvatar(265);
    return {
      account: createDemoAccountClient({
        account: logged ? (plus ? "mensal" : "gratis") : "anon",
        billing: true,
        payment: "paid",
        providers: true,
      }),
      room: createDemoClient({
        phase: PHASES.find((name) => name === read.get("fase")) ?? "lobby",
        isOwner: read.get("dono") === "1",
        people: Number(read.get("pessoas") ?? 4),
        videos: Number(read.get("videos") ?? 2),
        mobile: read.get("celular") === "1",
        // Shows one notice from the start, to check its text and the dismiss button.
        notice: noticeKind ? ({ kind: noticeKind } as RoomNotice) : null,
        fixedHandle: read.get("fixa"),
        theme: ROOM_THEMES.find((name) => name === read.get("tema")),
        account: logged ? { nickname: "Marina", handle: "marina", avatarUrl, plus } : null,
      }),
    };
  }, [query]);

  if (!phase) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <h1 className="font-display text-title font-semibold">Demonstração (só em desenvolvimento)</h1>
        <SessionChooser />
        <ul className="flex flex-col gap-2">
          {PHASES.map((name) => (
            <li key={name}>
              <a className="text-link underline" href={`/demo?fase=${name}`}>
                Fase: {name}
              </a>
            </li>
          ))}
          {SCENES.map((scene) => (
            <li key={scene.query}>
              <a className="text-link underline" href={`/demo?${scene.query}`}>
                {scene.label}
              </a>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <AccountClientProvider client={clients.account}>
      <RoomClientProvider client={clients.room}>
        <RoomScreen key={query} code="demo234567" />
      </RoomClientProvider>
    </AccountClientProvider>
  );
}
