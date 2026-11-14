import { Button } from "@heroui/react";
import type { CSSProperties } from "react";
import type { ParticipantView, ReactionEvent, RoomState, VideoView } from "../../lib/room";
import { texts } from "../../texts";
import { Badges } from "../account/Badges";
import { CosmeticFrame, CosmeticName } from "../cosmetics/Cosmetic";
import { Hint } from "../Hint";
import { EyeIcon, EyeOffIcon, VoiceBars } from "../icons";
import { BroadcastStatus } from "./BroadcastStatus";
import { Avatar, StreamVideo } from "./media";
import { WatchCards } from "./WatchCards";

/** Stable horizontal position (10% to 85%) for a reaction, derived from its id. */
function reactionOffset(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 10 + (hash % 76);
}

function ReactionsOverlay({ reactions, nameOf }: { reactions: ReactionEvent[]; nameOf: NameOf }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {reactions.map((event) => (
        <div
          key={event.id}
          data-testid="reaction"
          className="absolute bottom-[14%] flex animate-reaction-float flex-col items-center gap-1 motion-reduce:animate-reaction-fade"
          style={{ left: `${reactionOffset(event.id)}%` }}
        >
          <span className="text-heading">{event.reaction}</span>
          <span className="rounded-button bg-stage/70 px-2 py-0.5 text-compact text-on-stage">
            {nameOf(event.from)}
          </span>
        </div>
      ))}
    </div>
  );
}

type NameOf = (participantId: string) => string;

/** Over the video, in the corner the label leaves free: bottom right when featured, top right in a thumbnail. */
const CORNER = { featured: "absolute right-2 bottom-2 z-[1]", thumbnail: "absolute top-1 right-1 z-[1]" };
const ON_VIDEO = "rounded-button bg-stage/70 text-on-stage";

interface VideoTileProps {
  video: VideoView;
  owner: ParticipantView | undefined;
  featured: boolean;
  disabled: boolean;
  onFeature: () => void;
  onUnwatch: () => void;
}

/**
 * The same element for featured and thumbnail, so switching the highlight never remounts the
 * `<video>` (the sound of a shared screen keeps playing).
 */
function VideoTile({ video, owner, featured, disabled, onFeature, onUnwatch }: VideoTileProps) {
  const nickname = owner?.nickname ?? texts.stage.unknownPerson;
  const label = texts.stage.videoLabel(nickname, video.kind, video.isLocal);
  const namePaint = owner?.cosmetics?.name ?? null;
  // The label starts with the nickname: only that part takes the color of the name.
  const painted = namePaint !== null && label.startsWith(nickname);
  const corner = featured ? CORNER.featured : CORNER.thumbnail;
  const stopLabel = texts.stage.watch.stopLabel(nickname, video.kind);

  return (
    <div
      data-testid="video-tile"
      data-featured={featured || undefined}
      className={
        featured
          ? "relative col-span-3 row-start-1 aspect-video overflow-hidden rounded-card bg-stage lg:col-span-1 lg:col-start-1 lg:row-end-[-1] lg:aspect-auto lg:min-h-0"
          : "relative aspect-video overflow-hidden rounded-nav bg-stage lg:col-start-2"
      }
    >
      {video.stream ? (
        <StreamVideo
          stream={video.stream}
          muted={video.isLocal}
          mirrored={video.isLocal && video.kind === "camera"}
          label={label}
          className="size-full object-contain"
        />
      ) : (
        <p className="flex size-full items-center justify-center px-3 text-center text-body-sm text-on-stage">
          {texts.stage.waiting}
        </p>
      )}

      {/*
        The colors of a name are checked against the surfaces of the theme, never against the dark
        stage: a label with a painted name sits on `canvas` instead (DESIGN.md, "Cosméticos da loja").
        When featured, it leaves the bottom right corner to the control beside it.
      */}
      <span
        data-testid="video-label"
        data-surface={painted ? "canvas" : "stage"}
        className={`absolute bottom-2 left-2 flex items-center gap-1.5 rounded-button ${
          painted ? "bg-canvas text-ink" : "bg-stage/70 text-on-stage"
        } ${
          featured
            ? "max-w-[calc(100%-4.5rem)] px-3 py-1.5 text-body-sm sm:max-w-[calc(100%-12rem)]"
            : "max-w-[calc(100%-1rem)] px-2 py-1 text-compact"
        }`}
      >
        {owner?.avatarUrl && (
          <CosmeticFrame paint={owner.cosmetics?.frame} className="shrink-0">
            <Avatar nickname={nickname} avatarUrl={owner.avatarUrl} size="xs" />
          </CosmeticFrame>
        )}
        {owner?.speaking && <VoiceBars />}
        <span className="truncate">
          {painted ? (
            <>
              <CosmeticName paint={namePaint}>{nickname}</CosmeticName>
              {label.slice(nickname.length)}
            </>
          ) : (
            label
          )}
        </span>
        {featured && owner?.handle && (
          <span className={`shrink-0 ${painted ? "text-muted" : "text-on-stage/80"}`}>
            {texts.handle.display(owner.handle)}
          </span>
        )}
        {owner && <Badges badges={owner.badges} tone={painted ? "color" : "inherit"} />}
      </span>

      {!featured && (
        <button
          type="button"
          aria-label={texts.stage.feature(nickname, video.kind)}
          onClick={onFeature}
          className="absolute inset-0 cursor-pointer rounded-nav -outline-offset-2"
        />
      )}

      {video.isLocal ? (
        // Who transmits sees how many people receive each video. Only informs: it lets a click through.
        <span
          role="img"
          data-testid="video-viewers"
          aria-label={texts.stage.broadcast.viewersLabel(video.viewers.length, video.kind)}
          className={`pointer-events-none inline-flex min-h-8 items-center gap-1.5 px-2.5 text-compact font-medium ${ON_VIDEO} ${corner}`}
        >
          <EyeIcon />
          {video.viewers.length}
        </span>
      ) : (
        // After the button that features the tile, so it stays above it and comes next in the tab order.
        <Hint text={texts.stage.watch.stop}>
          <Button
            isIconOnly={!featured}
            aria-label={stopLabel}
            data-testid="unwatch-video"
            isDisabled={disabled}
            className={`${ON_VIDEO} ${corner} ${
              featured ? "min-h-11 gap-1.5 px-3 text-compact font-medium" : "size-9"
            }`}
            onPress={onUnwatch}
          >
            <EyeOffIcon />
            {featured && <span className="hidden sm:inline">{texts.stage.watch.stop}</span>}
          </Button>
        </Hint>
      )}
    </div>
  );
}

interface EmptyStageProps {
  participants: ParticipantView[];
  title: string;
  hint: string;
  className?: string;
}

function EmptyStage({ participants, title, hint, className = "" }: EmptyStageProps) {
  return (
    <div
      className={`min-h-48 w-full flex-auto flex-col items-center justify-center gap-6 rounded-card bg-canvas p-6 text-center ${className}`}
    >
      <ul className="flex flex-wrap items-start justify-center gap-5">
        {participants.map((participant) => (
          <li key={participant.id} className="flex w-24 flex-col items-center gap-2">
            <CosmeticFrame paint={participant.cosmetics?.frame}>
              <Avatar
                nickname={participant.nickname}
                avatarUrl={participant.avatarUrl}
                speaking={participant.speaking}
                size="lg"
              />
            </CosmeticFrame>
            <span className="flex w-full items-center justify-center gap-1 text-body-sm">
              <CosmeticName paint={participant.cosmetics?.name} className="truncate">
                {participant.nickname}
              </CosmeticName>
              <Badges badges={participant.badges} />
            </span>
            {participant.handle && (
              <span className="-mt-1.5 w-full truncate text-compact text-muted">
                {texts.handle.display(participant.handle)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-body-sm text-muted">{hint}</p>
      </div>
    </div>
  );
}

interface StageProps {
  state: RoomState;
  onFeature: (videoId: string) => void;
  onWatch: (videoId: string) => void;
  onUnwatch: (videoId: string) => void;
  /** Reconnecting: nothing can be asked of the server. */
  disabled?: boolean;
  className?: string;
}

/**
 * Video on demand: the own videos and the watched ones are tiles (one featured, the rest as
 * thumbnails); every other video of the room is a card in the strip below, which scrolls sideways
 * so that a full room never pushes the controls out of a phone.
 */
export function Stage({
  state,
  onFeature,
  onWatch,
  onUnwatch,
  disabled = false,
  className = "",
}: StageProps) {
  const { videos, participants } = state;
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const nameOf: NameOf = (id) => byId.get(id)?.nickname ?? texts.stage.unknownPerson;
  const tiles = videos.filter((video) => video.watch === "local" || video.watch === "watching");
  const cards = videos.filter((video) => video.watch !== "local" && video.watch !== "watching");
  const featured = tiles.find((video) => video.id === state.featuredVideoId) ?? tiles[0] ?? null;
  const hasThumbnails = tiles.length > 1;

  return (
    <section aria-label={texts.stage.label} className={`relative flex min-w-0 flex-col gap-2 ${className}`}>
      {featured ? (
        // From `lg`: one row per thumbnail and a last one that takes what is left; the featured video spans all.
        <div
          style={{ "--stage-rows": Math.max(1, tiles.length - 1) } as CSSProperties}
          className={`grid min-h-0 w-full flex-auto grid-cols-3 gap-2 overflow-y-auto lg:grid-rows-[repeat(var(--stage-rows),auto)_minmax(0,1fr)] ${
            hasThumbnails ? "lg:grid-cols-[minmax(0,1fr)_11rem]" : "lg:grid-cols-1"
          }`}
        >
          {tiles.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              owner={byId.get(video.ownerId)}
              featured={video === featured}
              disabled={disabled}
              onFeature={() => onFeature(video.id)}
              onUnwatch={() => onUnwatch(video.id)}
            />
          ))}
        </div>
      ) : cards.length > 0 ? (
        // Videos to pick, none watched: on a phone the cards alone say it, and the height is left to the chat.
        <EmptyStage
          participants={participants}
          title={texts.stage.watch.none}
          hint={texts.stage.watch.noneHint}
          className="hidden md:flex"
        />
      ) : (
        <EmptyStage
          participants={participants}
          title={texts.stage.empty}
          hint={texts.stage.emptyHint}
          className="flex"
        />
      )}
      <BroadcastStatus videos={videos} relayMeter={state.relayMeter} nameOf={nameOf} />
      <WatchCards
        videos={cards}
        ownerOf={(video) => byId.get(video.ownerId)}
        watchedCount={state.watchedCount}
        maxWatchedVideos={state.maxWatchedVideos}
        leading={!featured}
        disabled={disabled}
        onWatch={onWatch}
        onUnwatch={onUnwatch}
      />
      <ReactionsOverlay reactions={state.reactions} nameOf={nameOf} />
      {/*
        How full the room is, always over whatever the stage shows (video, empty state, reactions):
        top right corner on a phone, top left from `md`. Its own filled pair keeps it readable.
      */}
      <span
        data-testid="occupancy"
        className="absolute top-3 right-3 z-20 rounded-button bg-accent px-2.5 py-1 text-compact font-medium text-on-accent md:right-auto md:left-3"
        aria-label={texts.room.occupancyLabel(state.occupancy.participants, state.occupancy.capacity)}
      >
        {texts.room.occupancy(state.occupancy.participants, state.occupancy.capacity)}
      </span>
    </section>
  );
}
