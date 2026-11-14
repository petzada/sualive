import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { RoomActions, RoomState } from "../../lib/room";
import { texts } from "../../texts";
import { Spinner, VoiceBars } from "../icons";
import { ChatPanel } from "./ChatPanel";
import { ControlBar } from "./ControlBar";
import { VoiceOutputs } from "./media";
import { NoticeBanner } from "./NoticeBanner";
import { PeopleList } from "./PeopleList";
import { Stage } from "./Stage";

type PanelTab = "chat" | "people";
const TABS: PanelTab[] = ["chat", "people"];

interface RoomViewProps {
  state: RoomState;
  actions: RoomActions;
  onLeave: () => void;
}

/** The room itself. Also rendered while reconnecting, so the layout never jumps. */
export function RoomView({ state, actions, onLeave }: RoomViewProps) {
  const [tab, setTab] = useState<PanelTab>("chat");
  // Last chat message seen before the person switched to the people tab (small screens).
  const [seenChatId, setSeenChatId] = useState<string | null>(null);
  const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({ chat: null, people: null });

  const reconnecting = state.phase === "reconnecting";
  const lastChatId = state.chat.at(-1)?.id ?? null;
  const unreadChat = tab !== "chat" && lastChatId !== null && lastChatId !== seenChatId;
  const speakers = state.participants.filter((participant) => participant.speaking);

  const selectTab = (next: PanelTab) => {
    if (next !== "chat") setSeenChatId(lastChatId);
    setTab(next);
  };

  const handleTabKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + 1) % TABS.length] ?? "chat";
    selectTab(next);
    tabRefs.current[next]?.focus();
  };

  const tabLabel = { chat: texts.room.tabs.chat, people: texts.room.tabs.people(state.participants.length) };

  return (
    <div className="flex h-dvh flex-col bg-mist">
      <header className="flex min-h-11 shrink-0 items-center gap-3 px-4 pt-1">
        <h1 className="font-display text-title font-semibold">{texts.home.title}</h1>
        <span
          className="rounded-button bg-canvas px-2.5 py-1 text-compact"
          aria-label={texts.room.occupancyLabel(state.occupancy.participants, state.occupancy.capacity)}
        >
          {texts.room.occupancy(state.occupancy.participants, state.occupancy.capacity)}
        </span>
        {speakers.length > 0 && (
          <span className="flex min-w-0 items-center gap-1.5 text-compact text-muted lg:hidden">
            <VoiceBars />
            <span className="truncate">{speakers.map((participant) => participant.nickname).join(", ")}</span>
          </span>
        )}
        <div role="status" aria-live="polite" className="ml-auto min-w-0 text-body-sm">
          {reconnecting && (
            <span className="flex items-center gap-2 rounded-button bg-canvas px-3 py-1.5 shadow-outline">
              <Spinner />
              <span className="truncate">{texts.room.reconnecting}</span>
            </span>
          )}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pt-1 lg:flex-row lg:gap-3 lg:px-4">
        <NoticeBanner
          notice={state.notice}
          onDismiss={actions.dismissNotice}
          className="absolute inset-x-2 top-2 z-30 mx-auto max-w-md"
        />

        <Stage state={state} onFeature={actions.setFeaturedVideo} className="shrink-0 lg:min-h-0 lg:flex-1" />

        <aside className="flex min-h-0 flex-1 flex-col gap-2 lg:w-88 lg:flex-none lg:gap-3">
          <div
            role="tablist"
            aria-label={texts.room.tabs.label}
            className="flex shrink-0 gap-1 rounded-button bg-control p-1 lg:hidden"
            onKeyDown={handleTabKey}
          >
            {TABS.map((name) => (
              <button
                key={name}
                ref={(element) => {
                  tabRefs.current[name] = element;
                }}
                type="button"
                role="tab"
                id={`room-tab-${name}`}
                aria-selected={tab === name}
                aria-controls={`room-panel-${name}`}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => selectTab(name)}
                className={`relative min-h-11 flex-1 cursor-pointer rounded-button text-body-sm ${
                  tab === name ? "bg-canvas font-medium" : "text-muted"
                }`}
              >
                {tabLabel[name]}
                {name === "chat" && unreadChat && (
                  <span className="ml-1.5 inline-block size-2 rounded-button bg-notice align-middle">
                    <span className="sr-only">{texts.room.tabs.unread}</span>
                  </span>
                )}
              </button>
            ))}
          </div>

          <section
            id="room-panel-people"
            role="tabpanel"
            aria-label={tabLabel.people}
            className={`min-h-0 overflow-y-auto rounded-card bg-canvas px-4 py-2 lg:block lg:max-h-[50%] lg:shrink-0 ${
              tab === "people" ? "flex-1" : "hidden"
            }`}
          >
            <PeopleList
              participants={state.participants}
              isOwner={state.isOwner}
              onModerate={actions.moderate}
            />
          </section>

          <section
            id="room-panel-chat"
            role="tabpanel"
            aria-label={tabLabel.chat}
            className={`min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-canvas lg:flex ${
              tab === "chat" ? "flex" : "hidden"
            }`}
          >
            <ChatPanel
              messages={state.chat}
              selfId={state.selfId}
              onSend={actions.sendChat}
              visible={tab === "chat"}
              disabled={reconnecting}
            />
          </section>
        </aside>
      </main>

      <ControlBar state={state} actions={actions} onLeave={onLeave} disabled={reconnecting} />
      <VoiceOutputs participants={state.participants} />
    </div>
  );
}
