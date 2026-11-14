import { Button } from "@heroui/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import type { CreateRoomResult } from "../lib/room";
import { texts } from "../texts";
import { Spinner } from "./icons";
import { useRoomClient } from "./room/RoomClient";
import { TurnstileField } from "./TurnstileField";
import { useTurnstileAction } from "./useTurnstileAction";

type CreateFailure = Extract<CreateRoomResult, { ok: false }>["reason"];

interface CreateRoomProps {
  /** Short line under the button. */
  hint?: string;
  /** Extra classes for the button, e.g. spacing. */
  className?: string;
  /** Rendered right under the button, before the hint (the account line of the home page). */
  afterButton?: ReactNode;
}

/**
 * The "create room" button: passes the Turnstile check, creates the room and goes to its link.
 * Renders its pieces side by side with the caller's own, so the parent decides the spacing.
 */
export function CreateRoom({ hint, className = "", afterButton }: CreateRoomProps) {
  const { createRoom } = useRoomClient();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<CreateFailure | null>(null);

  const turnstile = useTurnstileAction(async (token) => {
    let result: CreateRoomResult;
    try {
      result = await createRoom(token);
    } catch {
      result = { ok: false, reason: "error" };
    }
    if (result.ok) {
      await navigate(ROOM_PATH_PREFIX + result.code);
    } else {
      setFailure(result.reason);
    }
  });

  const busy = turnstile.status !== "idle";

  return (
    <>
      <Button
        variant="primary"
        className={`min-h-12 rounded-button px-7 text-body font-medium ${className}`}
        isDisabled={busy}
        onPress={() => {
          setFailure(null);
          turnstile.trigger();
        }}
      >
        {busy && <Spinner />}
        {turnstile.status === "running"
          ? texts.home.creating
          : turnstile.status === "waiting"
            ? texts.turnstile.checking
            : texts.home.create}
      </Button>
      {afterButton}
      {hint && <p className="text-body-sm text-muted">{hint}</p>}

      {failure && (
        <p role="alert" className="max-w-md text-body-sm font-medium text-notice">
          {texts.home.errors[failure]}
        </p>
      )}

      <TurnstileField {...turnstile} />
    </>
  );
}
