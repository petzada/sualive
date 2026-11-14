import { Button } from "@heroui/react";
import { useId } from "react";
import type { ParticipantView, VideoView } from "../../lib/room";
import { texts } from "../../texts";
import { Badges } from "../account/Badges";
import { CosmeticFrame, CosmeticName } from "../cosmetics/Cosmetic";
import { CameraIcon, ScreenIcon, Spinner } from "../icons";
import { Avatar } from "./media";

const PILL = "min-h-11 rounded-button px-4 text-body-sm font-medium";

interface WatchCardProps {
  video: VideoView;
  owner: ParticipantView | undefined;
  /** The person already watches as many videos as allowed. */
  atLimit: boolean;
  /** Id of the text that explains the limit, for the disabled button. */
  limitId: string;
  disabled: boolean;
  onWatch: () => void;
  onUnwatch: () => void;
}

/**
 * A video the person is not seeing: who transmits, what it is, and the one thing that can be done
 * about it now. Waiting to open, it only says so; blocked by an unpaid relay, it says why and
 * offers to give up (a blocked video still counts as watched). Never a button that does nothing.
 */
function WatchCard({ video, owner, atLimit, limitId, disabled, onWatch, onUnwatch }: WatchCardProps) {
  const nickname = owner?.nickname ?? texts.stage.unknownPerson;

  return (
    <li
      data-testid="watch-card"
      data-watch={video.watch}
      data-video-id={video.id}
      className="flex w-60 shrink-0 snap-start flex-col justify-between gap-3 rounded-nav bg-canvas p-3 shadow-outline-soft"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CosmeticFrame paint={owner?.cosmetics?.frame} className="shrink-0">
          <Avatar nickname={nickname} avatarUrl={owner?.avatarUrl} speaking={owner?.speaking} />
        </CosmeticFrame>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-1.5 text-body-sm">
            <CosmeticName paint={owner?.cosmetics?.name} className="truncate font-medium">
              {nickname}
            </CosmeticName>
            {owner && <Badges badges={owner.badges} />}
          </span>
          <span className="flex items-center gap-1.5 text-compact text-muted" data-testid="watch-card-kind">
            {video.kind === "screen" ? <ScreenIcon /> : <CameraIcon />}
            {texts.stage.watch.kind[video.kind]}
          </span>
        </div>
      </div>

      {video.watch === "idle" && (
        <Button
          variant="primary"
          aria-label={texts.stage.watch.actionLabel(nickname, video.kind)}
          aria-describedby={atLimit ? limitId : undefined}
          data-testid="watch-video"
          isDisabled={atLimit || disabled}
          className={PILL}
          onPress={onWatch}
        >
          {texts.stage.watch.action}
        </Button>
      )}
      {video.watch === "requesting" && (
        <p role="status" className="flex min-h-11 items-center gap-2 text-body-sm text-muted">
          <Spinner />
          {texts.stage.watch.requesting}
        </p>
      )}
      {video.watch === "blocked" && video.blockedReason && (
        <>
          <p
            role="status"
            data-testid="watch-blocked"
            data-reason={video.blockedReason}
            className="text-compact"
          >
            {texts.stage.watch.blocked[video.blockedReason]}
          </p>
          <Button
            variant="outline"
            aria-label={texts.stage.watch.stopLabel(nickname, video.kind)}
            data-testid="unwatch-video"
            isDisabled={disabled}
            className={`${PILL} border-outline`}
            onPress={onUnwatch}
          >
            {texts.stage.watch.stop}
          </Button>
        </>
      )}
    </li>
  );
}

interface WatchCardsProps {
  /** The videos that are not on the stage as a tile: `idle`, `requesting` and `blocked`. */
  videos: VideoView[];
  ownerOf: (video: VideoView) => ParticipantView | undefined;
  watchedCount: number;
  maxWatchedVideos: number;
  /** Nothing above it in the stage: on a phone its first line leaves the corner to the occupancy. */
  leading?: boolean;
  disabled?: boolean;
  onWatch: (videoId: string) => void;
  onUnwatch: (videoId: string) => void;
}

/**
 * The videos of the room the person can pick, in one row that scrolls sideways: with twelve people
 * it takes the same height as with two. Says how many videos the person watches of the maximum
 * and, at the limit, why "watch" is off. Renders nothing when there is no card.
 */
export function WatchCards({
  videos,
  ownerOf,
  watchedCount,
  maxWatchedVideos,
  leading = false,
  disabled = false,
  onWatch,
  onUnwatch,
}: WatchCardsProps) {
  const titleId = useId();
  const limitId = useId();
  if (videos.length === 0) return null;

  const atLimit = watchedCount >= maxWatchedVideos;

  return (
    <div data-testid="watch-cards" className="flex shrink-0 flex-col gap-1.5">
      <div className={`flex flex-wrap items-baseline gap-x-3 pl-1 ${leading ? "pr-16 md:pr-1" : "pr-1"}`}>
        <h2 id={titleId} className="text-body-sm font-medium">
          {texts.stage.watch.listLabel}
        </h2>
        <p data-testid="watch-count" className="text-compact text-muted">
          {texts.stage.watch.count(watchedCount, maxWatchedVideos)}
        </p>
      </div>
      {atLimit && (
        <p id={limitId} data-testid="watch-limit" className="px-1 text-compact font-medium text-notice">
          {texts.stage.watch.limit(maxWatchedVideos)}
        </p>
      )}
      <ul aria-labelledby={titleId} className="flex snap-x gap-2 overflow-x-auto p-px pb-1">
        {videos.map((video) => (
          <WatchCard
            key={video.id}
            video={video}
            owner={ownerOf(video)}
            atLimit={atLimit}
            limitId={limitId}
            disabled={disabled}
            onWatch={() => onWatch(video.id)}
            onUnwatch={() => onUnwatch(video.id)}
          />
        ))}
      </ul>
    </div>
  );
}
