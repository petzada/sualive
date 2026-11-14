import { CHAT_MAX_LENGTH } from "@sualive/config";
import type { ChatMessage } from "@sualive/protocol";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { ParticipantView } from "../../lib/room";
import { texts } from "../../texts";
import { Badges } from "../account/Badges";
import { CosmeticFrame, CosmeticName } from "../cosmetics/Cosmetic";
import { ArrowDownIcon, SendIcon } from "../icons";
import { Avatar } from "./media";

/** Distance from the end (px) still counted as "following the conversation". */
const STICK_THRESHOLD_PX = 48;
/** The counter appears when the draft gets close to the limit. */
const COUNTER_FROM = CHAT_MAX_LENGTH * 0.8;

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface ChatPanelProps {
  messages: ChatMessage[];
  selfId: string | null;
  /** People in the room now: the picture, the @handle, the badges and the cosmetics of who wrote. */
  participants?: ParticipantView[];
  onSend: (text: string) => void;
  /** `false` while the panel is hidden behind another tab. */
  visible?: boolean;
  disabled?: boolean;
}

/** Text only: messages are rendered as plain text, never as markup, links or media. */
export function ChatPanel({
  messages,
  selfId,
  participants = [],
  onSend,
  visible = true,
  disabled = false,
}: ChatPanelProps) {
  const authors = new Map(participants.map((participant) => [participant.id, participant]));
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [atEnd, setAtEnd] = useState(true);
  const [seenId, setSeenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const lastId = messages.at(-1)?.id ?? null;
  const hasNew = !atEnd && lastId !== null && lastId !== seenId;

  // Follows new messages only while the person is at the end; reading history is never interrupted.
  useEffect(() => {
    const list = listRef.current;
    if (list && visible && stickRef.current) list.scrollTop = list.scrollHeight;
  }, [lastId, visible]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_THRESHOLD_PX;
    // Leaving the end: everything up to here was seen. Back at the end: all seen again.
    if (near || stickRef.current) setSeenId(lastId);
    stickRef.current = near;
    setAtEnd(near);
  };

  const jumpToEnd = () => {
    const list = listRef.current;
    stickRef.current = true;
    setAtEnd(true);
    if (list) list.scrollTop = list.scrollHeight;
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text.slice(0, CHAT_MAX_LENGTH));
    setDraft("");
    jumpToEnd();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter breaks the line. Ignored while composing (IME).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label={texts.chat.label}
          tabIndex={0}
          onScroll={handleScroll}
          className="flex size-full flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 -outline-offset-2"
        >
          {messages.length === 0 ? (
            <p className="m-auto text-center text-body-sm text-muted">{texts.chat.empty}</p>
          ) : (
            messages.map((message) => {
              const own = message.from === selfId;
              // Who already left has no account data here: the message keeps only the nickname.
              const author = authors.get(message.from);
              return (
                <article
                  key={message.id}
                  data-own={own ? "true" : undefined}
                  className={`flex max-w-full flex-col text-body-sm ${own ? "items-end self-end text-right" : "items-start self-start"}`}
                >
                  <header className="flex max-w-full items-baseline gap-2">
                    {author?.avatarUrl && (
                      <span className="shrink-0 self-center">
                        <CosmeticFrame paint={author.cosmetics?.frame}>
                          <Avatar nickname={message.nickname} avatarUrl={author.avatarUrl} size="xs" />
                        </CosmeticFrame>
                      </span>
                    )}
                    <CosmeticName paint={author?.cosmetics?.name} className="truncate font-semibold">
                      {message.nickname}
                    </CosmeticName>
                    {author && <Badges badges={author.badges} />}
                    {author?.handle && (
                      <span className="min-w-0 shrink truncate text-compact text-muted">
                        {texts.handle.display(author.handle)}
                      </span>
                    )}
                    {own && <span className="shrink-0 text-muted">({texts.common.you})</span>}
                    <time
                      dateTime={new Date(message.sentAt).toISOString()}
                      className="shrink-0 text-compact text-muted"
                    >
                      {timeFormat.format(message.sentAt)}
                    </time>
                  </header>
                  <p className="wrap-anywhere whitespace-pre-wrap">{message.text}</p>
                </article>
              );
            })
          )}
        </div>
        {hasNew && (
          <button
            type="button"
            onClick={jumpToEnd}
            className="absolute bottom-2 left-1/2 inline-flex min-h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-button bg-ink px-4 text-body-sm text-canvas"
          >
            <ArrowDownIcon />
            {texts.chat.newMessages}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-1 border-t border-hairline p-3">
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            {texts.chat.inputLabel}
          </label>
          <textarea
            id={inputId}
            rows={1}
            value={draft}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={texts.chat.placeholder}
            disabled={disabled}
            enterKeyHint="send"
            onChange={(event) => setDraft(event.target.value.slice(0, CHAT_MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            className="field-sizing-content max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-nav bg-canvas px-4 py-2 text-body shadow-outline outline-offset-2 placeholder:text-muted disabled:bg-mist"
          />
          <button
            type="submit"
            aria-label={texts.chat.send}
            disabled={disabled || draft.trim().length === 0}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-button bg-accent text-on-accent disabled:cursor-default disabled:bg-control disabled:text-muted"
          >
            <SendIcon />
          </button>
        </div>
        {draft.length >= COUNTER_FROM && (
          <p aria-live="polite" className="px-1 text-right text-compact text-muted">
            {draft.length >= CHAT_MAX_LENGTH
              ? texts.chat.limitReached(CHAT_MAX_LENGTH)
              : texts.chat.counter(draft.length, CHAT_MAX_LENGTH)}
          </p>
        )}
      </form>
    </div>
  );
}
