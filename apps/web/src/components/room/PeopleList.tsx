import { Button } from "@heroui/react";
import { useState } from "react";
import type { ParticipantView, RoomActions } from "../../lib/room";
import { texts } from "../../texts";
import { HandIcon, MicIcon, MicOffIcon, MoreIcon, VoiceBars } from "../icons";
import { Avatar } from "./media";

type ModerationAction = Parameters<RoomActions["moderate"]>[0];
type ConfirmableAction = Exclude<ModerationAction, "mute">;

const PILL = "min-h-11 rounded-button px-4 text-body-sm";

interface ModerationProps {
  participant: ParticipantView;
  onModerate: RoomActions["moderate"];
  onDone: () => void;
}

/** Mute applies at once; removing and banning ask for confirmation first. */
function Moderation({ participant, onModerate, onDone }: ModerationProps) {
  const [confirming, setConfirming] = useState<ConfirmableAction | null>(null);

  const apply = (action: ModerationAction) => {
    onModerate(action, participant.id);
    onDone();
  };

  if (confirming) {
    return (
      <div role="group" aria-label={texts.people[confirming]} className="flex flex-col gap-2 pb-2 pl-12">
        <p className="text-body-sm">
          {confirming === "kick"
            ? texts.people.confirmKick(participant.nickname)
            : texts.people.confirmBan(participant.nickname)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className={`${PILL} bg-ink text-canvas`} onPress={() => apply(confirming)}>
            {confirming === "kick" ? texts.people.confirmKickAction : texts.people.confirmBanAction}
          </Button>
          <Button
            variant="outline"
            className={`${PILL} border-outline`}
            autoFocus
            onPress={() => setConfirming(null)}
          >
            {texts.common.cancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pb-2 pl-12">
      {!participant.micMuted && (
        <Button variant="outline" className={`${PILL} border-outline`} onPress={() => apply("mute")}>
          {texts.people.mute}
        </Button>
      )}
      <Button variant="outline" className={`${PILL} border-outline`} onPress={() => setConfirming("kick")}>
        {texts.people.kick}
      </Button>
      <Button variant="outline" className={`${PILL} border-outline`} onPress={() => setConfirming("ban")}>
        {texts.people.ban}
      </Button>
    </div>
  );
}

interface PeopleListProps {
  participants: ParticipantView[];
  /** The viewer owns the room: shows the moderation controls on everyone else. */
  isOwner: boolean;
  onModerate: RoomActions["moderate"];
}

export function PeopleList({ participants, isOwner, onModerate }: PeopleListProps) {
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  return (
    <ul aria-label={texts.people.label} className="flex flex-col">
      {participants.map((participant) => {
        const connection = texts.people.connection[participant.connection];
        const canModerate = isOwner && !participant.isSelf;
        const moderating = moderatingId === participant.id;

        return (
          <li key={participant.id} className="flex flex-col">
            <div className="flex min-h-12 items-center gap-3 py-1.5">
              <Avatar nickname={participant.nickname} speaking={participant.speaking} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-1.5 text-body-sm">
                  <span className="truncate font-medium">{participant.nickname}</span>
                  {participant.isSelf && <span className="shrink-0 text-muted">({texts.common.you})</span>}
                  {participant.isOwner && (
                    <span className="shrink-0 rounded-button bg-mist px-2 py-0.5 text-compact">
                      {texts.people.owner}
                    </span>
                  )}
                </span>
                {(connection || participant.relayed) && (
                  <span className="truncate text-compact text-muted">
                    {[connection, participant.relayed ? texts.people.relayed : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>

              <span className="flex shrink-0 items-center gap-2">
                {participant.speaking && (
                  <span role="img" aria-label={texts.people.speaking} className="inline-flex text-ink">
                    <VoiceBars />
                  </span>
                )}
                {participant.handRaised && (
                  <span role="img" aria-label={texts.people.handRaised} className="inline-flex text-ink">
                    <HandIcon />
                  </span>
                )}
                <span
                  role="img"
                  aria-label={participant.micMuted ? texts.people.micMuted : texts.people.micOn}
                  className={`inline-flex ${participant.micMuted ? "text-muted" : "text-ink"}`}
                >
                  {participant.micMuted ? <MicOffIcon /> : <MicIcon />}
                </span>
              </span>

              {canModerate && (
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={texts.people.moderate(participant.nickname)}
                  aria-expanded={moderating}
                  className="size-11 shrink-0 rounded-button"
                  onPress={() => setModeratingId(moderating ? null : participant.id)}
                >
                  <MoreIcon />
                </Button>
              )}
            </div>
            {canModerate && moderating && (
              <Moderation
                participant={participant}
                onModerate={onModerate}
                onDone={() => setModeratingId(null)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
