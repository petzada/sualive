import { Button } from "@heroui/react";
import { REACTIONS } from "@sualive/config";
import type { Reaction } from "@sualive/config";
import type { VideoKind } from "@sualive/media";
import { useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import type { RoomActions, RoomState } from "../../lib/room";
import { texts } from "../../texts";
import { Hint } from "../Hint";
import {
  CameraIcon,
  CameraOffIcon,
  HandIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  ScreenIcon,
  ScreenOffIcon,
  SmileIcon,
} from "../icons";
import { PlanShortcut, ProfileShortcut } from "./AccountShortcuts";

interface ControlButtonProps {
  /** Accessible name and hint: says what pressing does now. */
  label: string;
  /** Short visible caption on wide screens. */
  caption: string;
  icon: ReactNode;
  /** Ringed while the thing is on (microphone open, camera live, hand up); the icon changes too. */
  active?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
  ref?: Ref<HTMLButtonElement>;
}

function ControlButton({
  label,
  caption,
  icon,
  active,
  pressed,
  expanded,
  disabled,
  onPress,
  ref,
}: ControlButtonProps) {
  return (
    <Hint text={label}>
      <Button
        ref={ref}
        variant="primary"
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        isDisabled={disabled}
        onPress={onPress}
        data-active={active ? "true" : undefined}
        className={`h-12 w-full min-w-0 rounded-button border-2 px-2 text-body-sm font-normal md:h-11 md:w-auto md:min-w-11 md:shrink-0 md:px-3 xl:px-4 ${
          active ? "border-ink" : "border-transparent"
        }`}
      >
        {icon}
        <span className="hidden xl:inline">{caption}</span>
      </Button>
    </Hint>
  );
}

/** Promise-returning actions report failures through `state.notice`; nothing else to do here. */
function run(result: Promise<void>) {
  result.catch(() => {});
}

interface ControlBarProps {
  state: RoomState;
  actions: RoomActions;
  /** While reconnecting, nothing can be sent (leaving stays available in the header). */
  disabled?: boolean;
}

/**
 * The actions of the room. Leaving is not one of them: it lives in the header. From `md`: the
 * actions centered in the row, the plan pill at its left end and the picture of the account at its
 * right end. Phones: the row is only the actions, bigger and sharing the whole width equally (the
 * plan and the picture go up to the header).
 */
export function ControlBar({ state, actions, disabled = false }: ControlBarProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const reactionsButtonRef = useRef<HTMLButtonElement>(null);

  const localVideoOf = (kind: VideoKind) =>
    state.videos.find((video) => video.isLocal && video.kind === kind);
  const camera = localVideoOf("camera");
  const screen = localVideoOf("screen");

  /** The own video of that kind stops; otherwise asks to start (the server enforces the limits). */
  const toggleVideo = (kind: VideoKind, current: { id: string } | undefined) => {
    if (current) actions.stopVideo(current.id);
    else run(actions.startVideo(kind));
  };

  /** One reaction per opening: the picker closes and the focus goes back to its button. */
  const react = (reaction: Reaction) => {
    actions.react(reaction);
    setReactionsOpen(false);
    reactionsButtonRef.current?.focus();
  };

  return (
    <div
      data-testid="control-bar"
      className="grid grid-cols-1 items-center gap-x-2 px-2 py-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-4 lg:py-3"
    >
      <div className="hidden justify-self-start md:flex">
        <PlanShortcut />
      </div>
      <div className="relative flex min-w-0 justify-center">
        {reactionsOpen && (
          <div
            role="group"
            aria-label={texts.controls.reactions}
            className="absolute bottom-full z-20 mb-3 flex gap-1 rounded-pill bg-canvas p-1 shadow-outline lg:mb-4"
          >
            {REACTIONS.map((reaction) => (
              <button
                key={reaction}
                type="button"
                aria-label={texts.controls.react(reaction)}
                disabled={disabled}
                onClick={() => react(reaction)}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-button text-kicker hover:bg-mist"
              >
                {reaction}
              </button>
            ))}
          </div>
        )}

        <div
          role="toolbar"
          aria-label={texts.controls.label}
          className="grid w-full auto-cols-fr grid-flow-col items-center gap-1.5 p-1 md:flex md:w-auto md:max-w-full md:gap-2 md:overflow-x-auto"
          onKeyDown={(event) => {
            if (event.key === "Escape") setReactionsOpen(false);
          }}
        >
          <ControlButton
            label={state.micMuted ? texts.controls.micOn : texts.controls.micOff}
            caption={texts.controls.micShort}
            icon={state.micMuted ? <MicOffIcon /> : <MicIcon />}
            active={!state.micMuted}
            disabled={disabled}
            onPress={() => run(actions.setMicMuted(!state.micMuted))}
          />
          {state.capabilities.canUseCamera && (
            <ControlButton
              label={camera ? texts.controls.cameraOff : texts.controls.cameraOn}
              caption={texts.controls.cameraShort}
              icon={camera ? <CameraIcon /> : <CameraOffIcon />}
              active={Boolean(camera)}
              disabled={disabled}
              onPress={() => toggleVideo("camera", camera)}
            />
          )}
          {state.capabilities.canShareScreen && (
            <ControlButton
              label={screen ? texts.controls.screenOff : texts.controls.screenOn}
              caption={texts.controls.screenShort}
              icon={screen ? <ScreenIcon /> : <ScreenOffIcon />}
              active={Boolean(screen)}
              disabled={disabled}
              onPress={() => toggleVideo("screen", screen)}
            />
          )}
          <ControlButton
            label={state.handRaised ? texts.controls.handLower : texts.controls.handRaise}
            caption={texts.controls.handShort}
            icon={<HandIcon />}
            active={state.handRaised}
            pressed={state.handRaised}
            disabled={disabled}
            onPress={() => actions.setHandRaised(!state.handRaised)}
          />
          <ControlButton
            ref={reactionsButtonRef}
            label={texts.controls.reactions}
            caption={texts.controls.reactionsShort}
            icon={<SmileIcon />}
            expanded={reactionsOpen}
            disabled={disabled}
            onPress={() => setReactionsOpen((open) => !open)}
          />
          <ControlButton
            label={texts.controls.copyLink}
            caption={texts.controls.copyShort}
            icon={<LinkIcon />}
            onPress={() => run(actions.copyLink())}
          />
        </div>
      </div>
      <div className="hidden justify-self-end md:flex">
        <ProfileShortcut />
      </div>
    </div>
  );
}
