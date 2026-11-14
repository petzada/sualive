import { useEffect, useRef, useState } from "react";
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
  /** Picture of the account (Google or Discord). Without it, or if it fails to load: the initial. */
  avatarUrl?: string | null;
  speaking?: boolean;
  size?: "xs" | "sm" | "lg";
}

const AVATAR_SIZES = {
  xs: "size-6 text-compact",
  sm: "size-9 text-body-sm",
  lg: "size-16 text-kicker",
};

/** Picture of the account, or the initial of the nickname. A dark ring marks who is speaking. */
export function Avatar({ nickname, avatarUrl = null, speaking = false, size = "sm" }: AvatarProps) {
  // Remembers which address failed, so a new address gets its own chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = Array.from(nickname.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?";
  const showPicture = avatarUrl !== null && avatarUrl !== failedUrl;

  return (
    <span
      aria-hidden="true"
      data-speaking={speaking || undefined}
      data-testid="avatar"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-button bg-control font-semibold text-ink outline-2 outline-offset-2 ${AVATAR_SIZES[size]} ${
        speaking ? "outline-ink" : "outline-transparent"
      }`}
    >
      {showPicture ? (
        <img
          src={avatarUrl}
          alt=""
          // The picture lives on another site: it does not need to know which room asked for it.
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(avatarUrl)}
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
