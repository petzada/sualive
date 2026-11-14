import { Button } from "@heroui/react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { RoomActions, RoomState } from "../../lib/room";
import { useRoomTheme } from "../../lib/theme";
import { texts } from "../../texts";
import { Hint } from "../Hint";
import { LeaveIcon, MoonIcon, Spinner, SunIcon, VoiceBars } from "../icons";
import { ChatPanel } from "./ChatPanel";
import { ControlBar } from "./ControlBar";
import { VoiceOutputs } from "./media";
import { NoticeBanner } from "./NoticeBanner";
import { PeopleList } from "./PeopleList";
import { Stage } from "./Stage";

type PanelTab = "chat" | "people";
const TABS: PanelTab[] = ["chat", "people"];

/** Header buttons (theme, leave): neutral, unlike the filled actions of the bar below. */
const NEUTRAL_PILL = "shrink-0 rounded-button bg-canvas text-ink shadow-outline-soft";

interface RoomViewProps {
  state: RoomState;
  actions: RoomActions;
  onLeave: () => void;
}

/**
 * The room itself. Also rendered while reconnecting, so the layout never jumps. The only screen
 * with a dark theme: it is applied while this is mounted and undone when the person leaves.
 */
export function RoomView({ state, actions, onLeave }: RoomViewProps) {
  const { theme, toggleTheme } = useRoomTheme();
  const themeLabel = theme === "dark" ? texts.room.themeToLight : texts.room.themeToDark;
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
      {/*
        Small screens: who is speaking and the reconnecting message take a second row (always
        reserved, so the stage does not jump when someone starts to speak).
      */}
      <header className="grid min-h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 px-4 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-compact font-medium sm:text-body-sm" data-testid="room-code">
            <span className="sr-only">{texts.room.codeLabel} </span>
            {state.code}
          </p>
          <span
            className="shrink-0 rounded-button bg-accent px-2.5 py-1 text-compact font-medium text-on-accent"
            aria-label={texts.room.occupancyLabel(state.occupancy.participants, state.occupancy.capacity)}
          >
            {texts.room.occupancy(state.occupancy.participants, state.occupancy.capacity)}
          </span>
        </div>
        <h1 className="text-center font-display text-title font-semibold">{texts.home.title}</h1>
        {/* Wide screens: one cell at the right. Small screens: the buttons stay in the first row. */}
        <div className="contents lg:flex lg:min-w-0 lg:items-center lg:justify-end lg:gap-2">
          <div className="col-span-3 row-start-2 flex min-h-5 min-w-0 items-center justify-center gap-3 lg:min-h-0">
            {speakers.length > 0 && (
              <span className="flex min-w-0 items-center gap-1.5 text-compact text-muted lg:hidden">
                <VoiceBars />
                <span className="truncate">
                  {speakers.map((participant) => participant.nickname).join(", ")}
                </span>
              </span>
            )}
            <div role="status" aria-live="polite" className="min-w-0 text-body-sm">
              {reconnecting && (
                <span className="mb-1 flex items-center gap-2 rounded-button bg-canvas px-3 py-1.5 shadow-outline lg:mb-0">
                  <Spinner />
                  <span className="truncate">{texts.room.reconnecting}</span>
                </span>
              )}
            </div>
          </div>
          <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-end gap-1.5">
            <Hint text={themeLabel} placement="bottom">
              <Button
                isIconOnly
                aria-label={themeLabel}
                className={`size-11 ${NEUTRAL_PILL}`}
                onPress={toggleTheme}
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </Button>
            </Hint>
            <Hint text={texts.controls.leave} placement="bottom">
              <Button
                aria-label={texts.controls.leave}
                className={`h-11 min-w-11 px-3 text-body-sm font-normal ${NEUTRAL_PILL}`}
                onPress={onLeave}
              >
                <LeaveIcon />
                <span className="hidden sm:inline">{texts.controls.leaveShort}</span>
              </Button>
            </Hint>
          </div>
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

      <ControlBar state={state} actions={actions} disabled={reconnecting} />
      <VoiceOutputs participants={state.participants} />
    </div>
  );
}
