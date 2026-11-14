import { Button } from "@heroui/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { SiteFooter } from "../components/account/PageShell";
import { PATHS } from "../components/account/paths";
import { TEXT_LINK } from "../components/account/styles";
import { Avatar } from "../components/room/media";
import { ManifestoCard } from "../components/ManifestoCard";
import { useRoomClient } from "../components/room/RoomClient";
import { TurnstileField } from "../components/TurnstileField";
import { useTurnstileAction } from "../components/useTurnstileAction";
import type { CreateRoomResult } from "../lib/room";
import { Spinner } from "../components/icons";
import { texts } from "../texts";

type CreateFailure = Extract<CreateRoomResult, { ok: false }>["reason"];

/**
 * The way into the account: a plain line of text right under the create button, never a button.
 * A visitor gets "Já tem conta? Entrar"; who is logged gets the nickname, leading to the profile.
 */
function HomeAccount() {
  const { state } = useAccountClient().useAccount();
  if (state.status === "loading") return null;
  const { user } = state;

  return (
    <p className="flex min-h-11 items-center gap-1.5 text-body-sm text-muted" data-testid="home-account">
      {user ? (
        <Link
          to={PATHS.profile}
          aria-label={texts.nav.profile(user.nickname)}
          className={`inline-flex min-h-11 max-w-56 items-center gap-2 ${TEXT_LINK}`}
        >
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="xs" />
          <span className="truncate">{user.nickname}</span>
        </Link>
      ) : (
        <>
          {texts.home.account.question}
          <Link to={PATHS.login} className={`inline-flex min-h-11 items-center ${TEXT_LINK}`}>
            {texts.home.account.login}
          </Link>
        </>
      )}
    </p>
  );
}

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
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-8">
        <div className="grid items-center gap-10 perspective-[1000px] md:grid-cols-2 md:gap-12">
          <div className="flex flex-col items-center gap-gap text-center">
            <h1 className="font-display text-heading font-semibold sm:text-display-sm lg:text-display">
              {texts.home.title}
            </h1>
            <p className="max-w-xl">
              {texts.home.tagline.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>

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
            <HomeAccount />
            <p className="text-body-sm text-muted">{texts.home.hint}</p>

            {failure && (
              <p role="alert" className="max-w-md text-body-sm font-medium text-notice">
                {texts.home.errors[failure]}
              </p>
            )}

            <TurnstileField {...turnstile} />
          </div>

          <ManifestoCard />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
