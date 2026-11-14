import { useEffect, useRef } from "react";
import type { ParticipantView } from "../../lib/room";

interface StreamVideoProps {
  stream: MediaStream;
  /** Local videos are muted; remote ones keep their sound (a shared screen carries its audio). */
  muted: boolean;
  /** Only the own camera is mirrored. */
  mirrored: boolean;
  label: string;
  className?: string;
}

export function StreamVideo({ stream, muted, mirrored, label, className = "" }: StreamVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element && element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      aria-label={label}
      className={`${className} ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element && element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay />;
}

/** Plays everyone's voice through invisible audio elements. */
export function VoiceOutputs({ participants }: { participants: ParticipantView[] }) {
  return (
    <div hidden data-testid="voice-outputs">
      {participants.map(
        (participant) =>
          participant.audioStream &&
          !participant.isSelf && <StreamAudio key={participant.id} stream={participant.audioStream} />,
      )}
    </div>
  );
}

interface AvatarProps {
  nickname: string;
  speaking?: boolean;
  size?: "sm" | "lg";
}

/** Initial of the nickname. A dark ring marks who is speaking. */
export function Avatar({ nickname, speaking = false, size = "sm" }: AvatarProps) {
  const initial = Array.from(nickname.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?";
  const sizeClass = size === "lg" ? "size-16 text-kicker" : "size-9 text-body-sm";
  return (
    <span
      aria-hidden="true"
      data-speaking={speaking || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-button bg-control font-semibold text-ink outline-2 outline-offset-2 ${sizeClass} ${
        speaking ? "outline-ink" : "outline-transparent"
      }`}
    >
      {initial}
    </span>
  );
}
