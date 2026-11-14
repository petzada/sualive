/**
 * Dev-only demo of the room screens (`/demo`), driven by the query string. Never part of a
 * production build (see `App.tsx`), which is why its few labels live here and not in `texts.ts`.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { RoomClientProvider } from "../components/room/RoomClient";
import type { RoomNotice, RoomPhase } from "../lib/room";
import { RoomScreen } from "../pages/RoomPage";
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
];

export default function DemoPage() {
  const [params] = useSearchParams();
  const phase = PHASES.find((name) => name === params.get("fase"));
  const query = params.toString();

  const client = useMemo(() => {
    const read = new URLSearchParams(query);
    const noticeKind = read.get("aviso");
    return createDemoClient({
      phase: PHASES.find((name) => name === read.get("fase")) ?? "lobby",
      isOwner: read.get("dono") === "1",
      people: Number(read.get("pessoas") ?? 4),
      videos: Number(read.get("videos") ?? 2),
      mobile: read.get("celular") === "1",
      // Shows one notice from the start, to check its text and the dismiss button.
      notice: noticeKind ? ({ kind: noticeKind } as RoomNotice) : null,
    });
  }, [query]);

  if (!phase) {
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h1 className="font-display text-title font-semibold">Demonstração (só em desenvolvimento)</h1>
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
    <RoomClientProvider client={client}>
      <RoomScreen key={query} code="demo234567" />
    </RoomClientProvider>
  );
}
