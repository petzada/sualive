import type { ParticipantView, ReactionEvent, RoomState, VideoView } from "../../lib/room";
import { texts } from "../../texts";
import { Badges } from "../account/Badges";
import { VoiceBars } from "../icons";
import { Avatar, StreamVideo } from "./media";

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

interface VideoTileProps {
  video: VideoView;
  owner: ParticipantView | undefined;
  featured: boolean;
  onFeature: () => void;
}

/**
 * The same element for featured and thumbnail, so switching the highlight never remounts the
 * `<video>` (the sound of a shared screen keeps playing).
 */
function VideoTile({ video, owner, featured, onFeature }: VideoTileProps) {
  const nickname = owner?.nickname ?? texts.stage.unknownPerson;
  const label = texts.stage.videoLabel(nickname, video.kind, video.isLocal);

  return (
    <div
      data-testid="video-tile"
      data-featured={featured || undefined}
      className={
        featured
          ? "relative col-span-3 row-start-1 aspect-video overflow-hidden rounded-card bg-stage lg:col-span-1 lg:col-start-1 lg:row-end-5 lg:aspect-auto lg:min-h-0"
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

      <span
        className={`absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-button bg-stage/70 text-on-stage ${
          featured ? "px-3 py-1.5 text-body-sm" : "px-2 py-1 text-compact"
        }`}
      >
        {owner?.avatarUrl && <Avatar nickname={nickname} avatarUrl={owner.avatarUrl} size="xs" />}
        {owner?.speaking && <VoiceBars />}
        <span className="truncate">{label}</span>
        {featured && owner?.handle && (
          <span className="shrink-0 text-on-stage/80">{texts.handle.display(owner.handle)}</span>
        )}
        {owner && <Badges badges={owner.badges} tone="inherit" />}
      </span>

      {!featured && (
        <button
          type="button"
          aria-label={texts.stage.feature(nickname, video.kind)}
          onClick={onFeature}
          className="absolute inset-0 cursor-pointer rounded-nav -outline-offset-2"
        />
      )}
    </div>
  );
}

function EmptyStage({ participants }: { participants: ParticipantView[] }) {
  return (
    <div className="flex size-full min-h-48 flex-col items-center justify-center gap-6 rounded-card bg-canvas p-6 text-center">
      <ul className="flex flex-wrap items-start justify-center gap-5">
        {participants.map((participant) => (
          <li key={participant.id} className="flex w-24 flex-col items-center gap-2">
            <Avatar
              nickname={participant.nickname}
              avatarUrl={participant.avatarUrl}
              speaking={participant.speaking}
              size="lg"
            />
            <span className="flex w-full items-center justify-center gap-1 text-body-sm">
              <span className="truncate">{participant.nickname}</span>
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
        <p className="font-medium">{texts.stage.empty}</p>
        <p className="text-body-sm text-muted">{texts.stage.emptyHint}</p>
      </div>
    </div>
  );
}

interface StageProps {
  state: RoomState;
  onFeature: (videoId: string) => void;
  className?: string;
}

export function Stage({ state, onFeature, className = "" }: StageProps) {
  const { videos, participants } = state;
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const nameOf: NameOf = (id) => byId.get(id)?.nickname ?? texts.stage.unknownPerson;
  const featured = videos.find((video) => video.id === state.featuredVideoId) ?? videos[0] ?? null;
  const hasThumbnails = videos.length > 1;

  return (
    <section aria-label={texts.stage.label} className={`relative ${className}`}>
      {featured ? (
        <div
          className={`grid size-full grid-cols-3 gap-2 lg:grid-rows-[repeat(3,auto)_minmax(0,1fr)] ${
            hasThumbnails ? "lg:grid-cols-[minmax(0,1fr)_11rem]" : "lg:grid-cols-1"
          }`}
        >
          {videos.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              owner={byId.get(video.ownerId)}
              featured={video === featured}
              onFeature={() => onFeature(video.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyStage participants={participants} />
      )}
      <ReactionsOverlay reactions={state.reactions} nameOf={nameOf} />
    </section>
  );
}
