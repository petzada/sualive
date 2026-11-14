import { Button, Link, Popover } from "@heroui/react";
import { PROTECTED_ROOM_MAX_VIDEOS } from "@sualive/config";
import { useEffect, useState } from "react";
import type { ProtectedMeter, RoomState } from "../../lib/room";
import { texts } from "../../texts";
import { PATHS } from "../account/paths";
import { formatCountdown, splitDuration } from "../format";
import { CoinIcon, ShieldIcon } from "../icons";

/** Leaving the page ends the call, so the wallet opens in another tab. */
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

const BADGE = "inline-flex shrink-0 items-center gap-1.5 rounded-button text-compact font-medium";

/** What the protected room means, with the limits of this room as the server sent them. */
function explanationOf(state: Pick<RoomState, "occupancy" | "maxVideos">): string {
  // The ceiling of videos only arrives on entering; before that (lobby) the parameter says it.
  return texts.protectedRoom.explanation(
    state.occupancy.capacity,
    state.maxVideos ?? PROTECTED_ROOM_MAX_VIDEOS,
  );
}

/** "cerca de 42 min": the time is what the room shows, never the gold going down. */
function durationText(ms: number): string {
  const { hours, minutes } = splitDuration(ms);
  return texts.protectedRoom.duration(hours, minutes);
}

/**
 * The badge at the top of a protected room. It is a button: the line that says what the badge
 * means opens under it, so the header of a phone keeps its two rows.
 */
export function ProtectedBadge({ state }: { state: Pick<RoomState, "occupancy" | "maxVideos"> }) {
  return (
    <Popover>
      <Button
        aria-label={texts.protectedRoom.about}
        data-testid="protected-badge"
        className={`${BADGE} min-h-9 bg-canvas px-3 text-ink shadow-outline-soft`}
      >
        <ShieldIcon />
        {texts.protectedRoom.badge}
      </Button>
      <Popover.Content
        placement="bottom start"
        offset={8}
        className="w-80 max-w-[calc(100vw-1rem)] rounded-nav bg-canvas text-ink shadow-outline"
      >
        <Popover.Dialog className="flex flex-col gap-2 p-4" data-testid="protected-explanation">
          <Popover.Heading className="text-body-sm font-medium">{texts.protectedRoom.badge}</Popover.Heading>
          <p className="text-body-sm text-muted">{explanationOf(state)}</p>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/** Before entering (lobby): the badge and, right under it, what it means. */
export function ProtectedNotice({
  state,
  className = "",
}: {
  state: Pick<RoomState, "occupancy" | "maxVideos">;
  className?: string;
}) {
  return (
    <div
      data-testid="protected-notice"
      className={`flex max-w-sm flex-col items-center gap-2 text-center ${className}`}
    >
      <p data-testid="protected-badge" className={`${BADGE} min-h-8 bg-mist px-3 text-ink`}>
        <ShieldIcon />
        {texts.protectedRoom.badge}
      </p>
      <p className="text-body-sm text-muted">{explanationOf(state)}</p>
    </div>
  );
}

/**
 * While the balance is comfortable: one quiet line with the time it still covers. On a phone only
 * the time shows (the row is shared with who is speaking); the whole sentence stays for a screen reader.
 */
export function ProtectedRemaining({ meter }: { meter: ProtectedMeter | null }) {
  if (meter?.state !== "ok") return null;
  return (
    <p
      data-testid="protected-meter"
      data-state="ok"
      className="shrink-0 text-compact whitespace-nowrap text-muted"
    >
      <span className="sr-only sm:not-sr-only">{texts.protectedRoom.remainingLead} </span>
      {durationText(meter.remainingMs)}
    </p>
  );
}

/** Mounted only during the tolerance, so its clock starts at the moment it shows. */
function GraceCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    // A timer is not read aloud at every second; the alert around it was already announced.
    <span
      role="timer"
      aria-live="off"
      aria-label={texts.protectedRoom.graceTimerLabel}
      data-testid="protected-grace-countdown"
      className="font-semibold tabular-nums"
    >
      {formatCountdown(endsAt - now)}
    </span>
  );
}

interface ProtectedAlertProps {
  meter: ProtectedMeter | null;
  /** The viewer owns the room: the way out is the own wallet. */
  isOwner: boolean;
  /** The viewer can send gold to the owner now: the way out is the button of the people list. */
  onSendGoldToOwner: (() => void) | null;
  className?: string;
}

/**
 * The balance of the owner is running out (`warning`) or ran out (`grace`, with the countdown to
 * the end of the room). For everyone, with the way out of each: the owner recharges in the wallet,
 * who has an account sends gold to the owner, and a guest is told who can.
 */
export function ProtectedAlert({ meter, isOwner, onSendGoldToOwner, className = "" }: ProtectedAlertProps) {
  if (!meter || meter.state === "ok") return null;
  const grace = meter.state === "grace";

  return (
    <div
      role={grace ? "alert" : "status"}
      data-testid="protected-meter"
      data-state={meter.state}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-canvas px-4 py-2 text-body-sm shadow-outline ${className}`}
    >
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 font-medium text-notice">
        <span className="mt-0.5 inline-flex shrink-0">
          <ShieldIcon />
        </span>
        <span>
          {grace ? (
            <>
              {texts.protectedRoom.grace}{" "}
              {meter.graceEndsAt !== null && <GraceCountdown endsAt={meter.graceEndsAt} />}
            </>
          ) : (
            texts.protectedRoom.warning(durationText(meter.remainingMs))
          )}
        </span>
      </p>
      {isOwner ? (
        <Link
          href={PATHS.wallet}
          {...NEW_TAB}
          data-testid="protected-wallet-link"
          className="inline-flex min-h-11 shrink-0 items-center rounded-button bg-accent px-4 font-medium text-on-accent no-underline hover:no-underline"
        >
          {texts.protectedRoom.ownerWallet}
          <span className="sr-only"> {texts.room.newTab}</span>
        </Link>
      ) : onSendGoldToOwner ? (
        <Button
          variant="primary"
          data-testid="protected-send-gold"
          className="min-h-11 shrink-0 gap-1.5 rounded-button px-4 text-body-sm font-medium"
          onPress={onSendGoldToOwner}
        >
          <CoinIcon filled />
          {texts.protectedRoom.sendToOwner}
        </Button>
      ) : (
        <p data-testid="protected-gift-hint" className="basis-full text-compact text-muted">
          {texts.protectedRoom.giftHint}
        </p>
      )}
    </div>
  );
}
