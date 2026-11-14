import { Button } from "@heroui/react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
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
  /** Only the owner promotes and demotes; a moderator never sees it. */
  onSetModerator?: RoomActions["setModerator"];
  onDone: () => void;
}

/** Mute applies at once; removing and banning ask for confirmation first. */
function Moderation({ participant, onModerate, onSetModerator, onDone }: ModerationProps) {
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
    <div
      role="group"
      aria-label={texts.people.moderate(participant.nickname)}
      data-testid="moderation-menu"
      className="flex flex-wrap gap-2 pb-2 pl-12"
    >
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
      {onSetModerator && (
        <Button
          variant="outline"
          data-testid="set-moderator"
          className={`${PILL} border-outline`}
          onPress={() => {
            onSetModerator(participant.id, !participant.isModerator);
            onDone();
          }}
        >
          {participant.isModerator ? texts.people.demote : texts.people.promote}
        </Button>
      )}
    </div>
  );
}

/** What the room can ask of the list from outside it. */
export interface PeopleListHandle {
  /** Opens the form to send gold to this person (if the viewer can) and moves the focus into it. */
  openGold(participantId: string): void;
}

interface PeopleListProps {
  participants: ParticipantView[];
  /** The viewer owns the room: moderates everyone else, promotes and demotes moderators. */
  isOwner: boolean;
  /** The viewer was promoted by the owner: moderates common participants only. */
  isModerator?: boolean;
  onModerate: RoomActions["moderate"];
  onSetModerator?: RoomActions["setModerator"];
  /** The viewer has an account: may send gold to whoever can receive it. */
  canSendGold?: boolean;
  onSendGold?: RoomActions["sendGold"];
  /**
   * Person whose "send gold" button stands out: the owner of a protected room whose balance is
   * running out. `null` for none.
   */
  highlightGoldFor?: string | null;
  ref?: Ref<PeopleListHandle>;
}

/** One panel at a time under a person: moderation (owner or moderator) or sending gold. */
interface OpenPanel {
  id: string;
  kind: "moderation" | "gold";
}

export function PeopleList({
  participants,
  isOwner,
  isModerator = false,
  onModerate,
  onSetModerator,
  canSendGold = false,
  onSendGold,
  highlightGoldFor = null,
  ref,
}: PeopleListProps) {
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null);
  const goldButtons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(null), SENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  useImperativeHandle(
    ref,
    () => ({
      openGold: (participantId) => {
        setSent(null);
        setOpen({ id: participantId, kind: "gold" });
      },
    }),
    [],
  );

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
        // The owner acts on everyone else; a moderator never on the owner nor on another moderator.
        // The server checks again.
        const canModerate =
          !participant.isSelf &&
          (isOwner || (isModerator && !participant.isOwner && !participant.isModerator));
        const moderating = open?.id === participant.id && open.kind === "moderation";
        const canGift = canSendGold && participant.canReceiveGold && !participant.isSelf;
        const gifting = canGift && open?.id === participant.id && open.kind === "gold";
        const highlighted = canGift && highlightGoldFor === participant.id;

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
                  {participant.isModerator && !participant.isOwner && (
                    <span
                      data-testid="moderator-badge"
                      className="shrink-0 rounded-button bg-mist px-2 py-0.5 text-compact"
                    >
                      {texts.people.moderator}
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
                  variant={highlighted ? "primary" : "ghost"}
                  aria-label={texts.gifts.send(participant.nickname)}
                  aria-expanded={gifting}
                  data-highlighted={highlighted || undefined}
                  className={`size-11 shrink-0 rounded-button ${highlighted ? "bg-accent text-on-accent" : ""}`}
                  onPress={() => toggle({ id: participant.id, kind: "gold" })}
                >
                  <CoinIcon filled />
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
              <Moderation
                participant={participant}
                onModerate={onModerate}
                onSetModerator={isOwner ? onSetModerator : undefined}
                onDone={() => setOpen(null)}
              />
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
