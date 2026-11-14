import { Link } from "@heroui/react";
import type { RelayMeter, VideoBlockedReason, VideoView } from "../../lib/room";
import { texts } from "../../texts";
import { PATHS } from "../account/paths";
import { formatAmount } from "../format";

/** Leaving the page ends the call, so the ways out open in another tab. */
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

const LINE = "rounded-nav bg-canvas px-3 py-2 text-body-sm shadow-outline-soft";

/** Where each reason is solved: the Plus page, or the wallet of who is Plus and ran out of gold. */
const WAY_OUT: Record<VideoBlockedReason, { href: string; text: string; testId: string }> = {
  relay_no_plus: { href: PATHS.plus, text: texts.stage.broadcast.plusLink, testId: "relay-plus-link" },
  relay_no_gold: { href: PATHS.wallet, text: texts.stage.broadcast.walletLink, testId: "relay-wallet-link" },
};

function WayOut({ reason }: { reason: VideoBlockedReason }) {
  const way = WAY_OUT[reason];
  return (
    <Link
      href={way.href}
      {...NEW_TAB}
      data-testid={way.testId}
      className="rounded-link font-medium text-link"
    >
      {way.text}
      <span className="sr-only"> {texts.room.newTab}</span>
    </Link>
  );
}

const REASONS: VideoBlockedReason[] = ["relay_no_plus", "relay_no_gold"];

interface BroadcastStatusProps {
  /** Every video of the room; only the own ones matter here. */
  videos: VideoView[];
  relayMeter: RelayMeter | null;
  nameOf: (participantId: string) => string;
}

/**
 * For who transmits, under the videos: who wants to watch and does not receive because the pair is
 * relayed and unpaid (with the way out), and what the paid relay costs. Nothing for who transmits
 * nothing. The price shown is the one the server charges, never one computed from the config.
 */
export function BroadcastStatus({ videos, relayMeter, nameOf }: BroadcastStatusProps) {
  const own = videos.filter((video) => video.isLocal);
  if (own.length === 0) return null;

  const blocked = own.flatMap((video) =>
    REASONS.map((reason) => ({
      video,
      reason,
      names: video.blockedViewers
        .filter((viewer) => viewer.reason === reason)
        .map((viewer) => nameOf(viewer.participantId)),
    })).filter((entry) => entry.names.length > 0),
  );
  const paying = relayMeter?.state === "paying" && relayMeter.pairs > 0 ? relayMeter : null;
  const noGold = relayMeter?.state === "no_gold";
  if (blocked.length === 0 && !paying && !noGold) return null;

  return (
    <div
      role="group"
      aria-label={texts.stage.broadcast.label}
      data-testid="broadcast-status"
      className="flex max-h-40 shrink-0 flex-col gap-1 overflow-y-auto p-px"
    >
      {noGold && (
        <p role="alert" data-testid="relay-meter" data-state="no_gold" className={LINE}>
          <span className="font-medium text-notice">{texts.stage.broadcast.relayNoGold}</span>{" "}
          <WayOut reason="relay_no_gold" />
        </p>
      )}
      {blocked.map(({ video, reason, names }) => (
        <p
          key={`${video.id}:${reason}`}
          role="status"
          data-testid="blocked-viewers"
          data-reason={reason}
          className={LINE}
        >
          {texts.stage.broadcast.blocked[reason](texts.people.names(names), names.length, video.kind)}{" "}
          <WayOut reason={reason} />
        </p>
      ))}
      {paying && (
        <p role="status" data-testid="relay-meter" data-state="paying" className={`${LINE} text-muted`}>
          {texts.stage.broadcast.relayPaying(
            paying.pairs,
            formatAmount(Math.round(paying.goldPerHour / paying.pairs)),
            formatAmount(paying.goldPerHour),
          )}
        </p>
      )}
    </div>
  );
}
