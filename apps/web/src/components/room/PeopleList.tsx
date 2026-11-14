import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import type { ParticipantView, RoomActions } from "../../lib/room";
import { texts } from "../../texts";
import { Badges } from "../account/Badges";
import { CosmeticFrame, CosmeticName } from "../cosmetics/Cosmetic";
import { CoinIcon, HandIcon, MicIcon, MicOffIcon, MoreIcon, VoiceBars } from "../icons";
import { formatGold, SendGoldForm } from "./GoldGift";
import { Avatar } from "./media";

type ModerationAction = Parameters<RoomActions["moderate"]>[0];
type ConfirmableAction = Exclude<ModerationAction, "mute">;

const PILL = "min-h-11 rounded-button px-4 text-body-sm";

/** How long the "you sent" confirmation stays under the person. */
const SENT_NOTICE_MS = 6000;

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
  /** The viewer has an account: may send gold to whoever can receive it. */
  canSendGold?: boolean;
  onSendGold?: RoomActions["sendGold"];
}

/** One panel at a time under a person: moderation (owner) or sending gold. */
interface OpenPanel {
  id: string;
  kind: "moderation" | "gold";
}

export function PeopleList({
  participants,
  isOwner,
  onModerate,
  canSendGold = false,
  onSendGold,
}: PeopleListProps) {
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null);
  const goldButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const toggle = (panel: OpenPanel) => {
    setSent(null);
    setOpen((current) => (current?.id === panel.id && current.kind === panel.kind ? null : panel));
  };

  /** The form goes away: the focus returns to the button that opened it. */
  const closeGold = (participantId: string) => {
    setOpen(null);
    goldButtons.current.get(participantId)?.focus();
  };

  return (
    <ul aria-label={texts.people.label} className="flex flex-col">
      {participants.map((participant) => {
        const connection = texts.people.connection[participant.connection];
        const canModerate = isOwner && !participant.isSelf;
        const moderating = open?.id === participant.id && open.kind === "moderation";
        const canGift = canSendGold && participant.canReceiveGold && !participant.isSelf;
        const gifting = canGift && open?.id === participant.id && open.kind === "gold";

        return (
          <li key={participant.id} className="flex flex-col">
            <div className="flex min-h-12 items-center gap-3 py-1.5">
              <CosmeticFrame paint={participant.cosmetics?.frame} className="shrink-0">
                <Avatar
                  nickname={participant.nickname}
                  avatarUrl={participant.avatarUrl}
                  speaking={participant.speaking}
                />
              </CosmeticFrame>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-1.5 text-body-sm">
                  <CosmeticName paint={participant.cosmetics?.name} className="truncate font-medium">
                    {participant.nickname}
                  </CosmeticName>
                  <Badges badges={participant.badges} />
                  {participant.isSelf && <span className="shrink-0 text-muted">({texts.common.you})</span>}
                  {participant.isOwner && (
                    <span className="shrink-0 rounded-button bg-mist px-2 py-0.5 text-compact">
                      {texts.people.owner}
                    </span>
                  )}
                </span>
                {(participant.handle || connection || participant.relayed) && (
                  <span className="truncate text-compact text-muted">
                    {[
                      participant.handle ? texts.handle.display(participant.handle) : "",
                      connection,
                      participant.relayed ? texts.people.relayed : "",
                    ]
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

              {canGift && (
                <Button
                  ref={(element: HTMLButtonElement | null) => {
                    if (element) goldButtons.current.set(participant.id, element);
                    else goldButtons.current.delete(participant.id);
                  }}
                  isIconOnly
                  variant="ghost"
                  aria-label={texts.gifts.send(participant.nickname)}
                  aria-expanded={gifting}
                  className="size-11 shrink-0 rounded-button"
                  onPress={() => toggle({ id: participant.id, kind: "gold" })}
                >
                  <CoinIcon />
                </Button>
              )}
              {canModerate && (
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={texts.people.moderate(participant.nickname)}
                  aria-expanded={moderating}
                  className="size-11 shrink-0 rounded-button"
                  onPress={() => toggle({ id: participant.id, kind: "moderation" })}
                >
                  <MoreIcon />
                </Button>
              )}
            </div>
            {canModerate && moderating && (
              <Moderation participant={participant} onModerate={onModerate} onDone={() => setOpen(null)} />
            )}
            {gifting && onSendGold && (
              <SendGoldForm
                participant={participant}
                onSendGold={onSendGold}
                onCancel={() => closeGold(participant.id)}
                onSent={(amount) => {
                  closeGold(participant.id);
                  setSent({
                    id: participant.id,
                    text: texts.gifts.sent(formatGold(amount), participant.nickname),
                  });
                }}
              />
            )}
            {/* Always mounted for who can receive, so screen readers announce the confirmation. */}
            {canGift && (
              <p
                role="status"
                className={sent?.id === participant.id ? "pb-2 pl-12 text-body-sm" : "sr-only"}
              >
                {sent?.id === participant.id ? sent.text : ""}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
