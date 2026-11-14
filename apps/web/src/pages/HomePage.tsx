import { Button } from "@heroui/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { useState } from "react";
import { useNavigate } from "react-router";
import { IpNotice } from "../components/IpNotice";
import { useRoomClient } from "../components/room/RoomClient";
import { TurnstileField } from "../components/TurnstileField";
import { useTurnstileAction } from "../components/useTurnstileAction";
import type { CreateRoomResult } from "../lib/room";
import { Spinner } from "../components/icons";
import { texts } from "../texts";

type CreateFailure = Extract<CreateRoomResult, { ok: false }>["reason"];

export function HomePage() {
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-gap px-5 py-16 text-center">
      <h1 className="font-display text-heading font-semibold sm:text-display-sm lg:text-display">
        {texts.home.title}
      </h1>
      <p className="max-w-xl">{texts.home.tagline}</p>

      <Button
        variant="primary"
        className="mt-2 min-h-12 rounded-button px-7 text-body font-medium"
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
      <p className="text-body-sm text-muted">{texts.home.hint}</p>

      {failure && (
        <p role="alert" className="max-w-md text-body-sm font-medium text-notice">
          {texts.home.errors[failure]}
        </p>
      )}

      <TurnstileField {...turnstile} />
      <div className="max-w-xl">
        <IpNotice />
      </div>
    </main>
  );
}
