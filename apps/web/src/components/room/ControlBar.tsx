import { Button } from "@heroui/react";
import { REACTIONS } from "@sualive/config";
import type { VideoKind } from "@sualive/media";
import { useState } from "react";
import type { ReactNode } from "react";
import type { RoomActions, RoomState } from "../../lib/room";
import { texts } from "../../texts";
import {
  CameraIcon,
  CameraOffIcon,
  HandIcon,
  LeaveIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  ScreenIcon,
  ScreenOffIcon,
  SmileIcon,
} from "../icons";

interface ControlButtonProps {
  /** Accessible name: says what pressing does now. */
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
}: ControlButtonProps) {
  return (
    <Button
      variant="primary"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      isDisabled={disabled}
      onPress={onPress}
      data-active={active ? "true" : undefined}
      className={`h-11 min-w-11 shrink-0 rounded-button border-2 px-3 text-body-sm font-normal xl:px-4 ${
        active ? "border-ink" : "border-transparent"
      }`}
    >
      {icon}
      <span className="hidden xl:inline">{caption}</span>
    </Button>
  );
}

/** Promise-returning actions report failures through `state.notice`; nothing else to do here. */
function run(result: Promise<void>) {
  result.catch(() => {});
}

interface ControlBarProps {
  state: RoomState;
  actions: RoomActions;
  onLeave: () => void;
  /** While reconnecting, nothing can be sent: only leaving stays available. */
  disabled?: boolean;
}

export function ControlBar({ state, actions, onLeave, disabled = false }: ControlBarProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);

  const localVideoOf = (kind: VideoKind) =>
    state.videos.find((video) => video.isLocal && video.kind === kind);
  const camera = localVideoOf("camera");
  const screen = localVideoOf("screen");

  /** The own video of that kind stops; otherwise asks to start (the server enforces the limits). */
  const toggleVideo = (kind: VideoKind, current: { id: string } | undefined) => {
    if (current) actions.stopVideo(current.id);
    else run(actions.startVideo(kind));
  };

  return (
    <div className="relative flex justify-center px-2 py-2 lg:py-3">
      {reactionsOpen && (
        <div
          role="group"
          aria-label={texts.controls.reactions}
          className="absolute bottom-full z-20 mb-1 flex gap-1 rounded-pill bg-canvas p-1 shadow-outline"
        >
          {REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="button"
              aria-label={texts.controls.react(reaction)}
              disabled={disabled}
              onClick={() => actions.react(reaction)}
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
        className="flex max-w-full items-center gap-1.5 overflow-x-auto p-1 sm:gap-2"
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
        <ControlButton
          label={texts.controls.leave}
          caption={texts.controls.leaveShort}
          icon={<LeaveIcon />}
          onPress={onLeave}
        />
      </div>
    </div>
  );
}
