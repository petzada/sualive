import { Button, Popover } from "@heroui/react";
import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { RoomActions, RoomState } from "../../lib/room";
import { useRoomTheme } from "../../lib/theme";
import { texts } from "../../texts";
import { Hint } from "../Hint";
import { LeaveIcon, MoonIcon, Spinner, SunIcon, VoiceBars } from "../icons";
import { AccountShortcuts } from "./AccountShortcuts";
import { ChatPanel } from "./ChatPanel";
import { ControlBar } from "./ControlBar";
import { GiftNotices } from "./GoldGift";
import { VoiceOutputs } from "./media";
import { NoticeBanner } from "./NoticeBanner";
import { PeopleList } from "./PeopleList";
import { RoomThemePicker, useAppliedRoomTheme } from "./RoomThemePicker";
import { Stage } from "./Stage";

type PanelTab = "chat" | "people";
const TABS: PanelTab[] = ["chat", "people"];

/** Header buttons (theme, leave): neutral, unlike the filled actions of the bar below. */
const NEUTRAL_PILL = "shrink-0 rounded-button bg-canvas text-ink shadow-outline-soft";

/** Answers of the leave confirmation: same pills as the ones that confirm removing or banning. */
const ANSWER_PILL = "min-h-11 rounded-button px-4 text-body-sm";

/**
 * Leaving ends the call for the person, so the button only asks: a small dialog under it, with the
 * focus on "cancel". Escape, a click outside or "cancel" close it and give the focus back to the
 * button; only "leave" leaves.
 */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Hint text={texts.controls.leave} placement="bottom">
        <Button isIconOnly aria-label={texts.controls.leave} className={`size-11 ${NEUTRAL_PILL}`}>
          <LeaveIcon />
        </Button>
      </Hint>
      <Popover.Content
        placement="bottom end"
        offset={8}
        className="w-72 max-w-[calc(100vw-1rem)] rounded-nav bg-canvas text-ink shadow-outline"
      >
        <Popover.Dialog className="flex flex-col gap-4 p-4" data-testid="leave-confirm">
          <Popover.Heading className="text-body-sm font-medium">
            {texts.controls.leaveConfirm.question}
          </Popover.Heading>
          <div className="flex flex-wrap gap-2">
            <Button className={`${ANSWER_PILL} bg-ink text-canvas`} onPress={onLeave}>
              {texts.controls.leaveConfirm.confirm}
            </Button>
            <Button
              variant="outline"
              className={`${ANSWER_PILL} border-outline`}
              autoFocus
              onPress={() => setOpen(false)}
            >
              {texts.common.cancel}
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

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
  // The room theme is of the room (everyone sees it); light or dark stays each person's choice.
  useAppliedRoomTheme(state.theme);
  const canPickRoomTheme = state.isOwner && state.fixed;
  const fixedHandle = state.fixed ? state.ownerHandle : null;
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
    // The window, less the notice about the Termos de Uso when it is at the top (`TermsBanner`).
    <div className="flex h-[calc(100dvh_-_var(--terms-banner-height,0px))] flex-col bg-mist">
      {/*
        At the left, starting at the left edge of the stage below (same side padding as `main`): the
        name of the product and, right beside it, the room in gray, as a breadcrumb. At the right,
        the buttons (on a phone also the plan and the picture; then the theme and leaving). Who is
        speaking and the reconnecting message take a row of their own below `lg` (always reserved,
        so the stage does not jump when someone starts to speak) and the free middle from `lg`.
      */}
      <header className="grid min-h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 pt-1 pr-4 pl-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-4 lg:pl-4">
        {/*
          Where the room does not fit beside the name (a phone with all the buttons) it wraps to the
          line below and loses the separator: each piece carries its separator in its own left
          padding, and the padding of whatever starts a line falls outside this clipped box.
        */}
        <div className="col-start-1 row-start-1 min-w-0 overflow-hidden" data-testid="room-breadcrumb">
          <div className="-ml-5 flex flex-wrap items-baseline">
            <h1 className="pl-5 font-display text-title font-semibold">{texts.home.title}</h1>
            <div className="relative flex max-w-full min-w-0 pl-5 text-compact text-muted md:text-body-sm">
              <span aria-hidden="true" className="absolute left-0 w-5 text-center">
                {texts.room.breadcrumbSeparator}
              </span>
              <p className="min-w-0 truncate" data-testid="room-code">
                {/* Fixed-link room: the @handle of its owner takes the place of the code. */}
                <span className="sr-only">{fixedHandle ? texts.room.fixedLabel : texts.room.codeLabel} </span>
                {fixedHandle ? texts.handle.display(fixedHandle) : state.code}
              </p>
            </div>
          </div>
        </div>
        <div
          data-testid="room-header-buttons"
          className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-1.5 lg:col-start-3"
        >
          {/* Phones only: from `md` the plan and the picture are in the row of the actions. */}
          <AccountShortcuts className="md:hidden" />
          {canPickRoomTheme && <RoomThemePicker theme={state.theme} onChange={actions.setRoomTheme} />}
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
          <LeaveButton onLeave={onLeave} />
        </div>
        <div className="col-span-2 row-start-2 flex min-h-5 min-w-0 items-center justify-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:justify-start">
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
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pt-1 lg:flex-row lg:gap-3 lg:px-4">
        <NoticeBanner
          notice={state.notice}
          onDismiss={actions.dismissNotice}
          maxOwnVideos={state.maxOwnVideos}
          className="absolute inset-x-2 top-2 z-30 mx-auto max-w-md"
        />

        <Stage state={state} onFeature={actions.setFeaturedVideo} className="shrink-0 lg:min-h-0 lg:flex-1" />

        <aside className="flex min-h-0 flex-1 flex-col gap-2 lg:w-88 lg:flex-none lg:gap-3">
          <GiftNotices gifts={state.gifts} />
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
              canSendGold={state.canSendGold && !reconnecting}
              onSendGold={actions.sendGold}
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
              participants={state.participants}
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
