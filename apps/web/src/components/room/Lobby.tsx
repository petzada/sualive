import { Button } from "@heroui/react";
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from "@sualive/config";
import type { DevicePreview } from "@sualive/media";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router";
import type { RoomActions, RoomState } from "../../lib/room";
import { useAccountClient } from "../account/AccountClient";
import { loginPath } from "../account/paths";
import { Spinner } from "../icons";
import { texts } from "../../texts";
import { TurnstileField } from "../TurnstileField";
import { useTurnstileAction } from "../useTurnstileAction";
import { Avatar, StreamVideo } from "./media";
import { NoticeBanner } from "./NoticeBanner";

/** Convenience only: the last nickname typed in this browser. */
export const NICKNAME_STORAGE_KEY = "sualive:nickname";

function readStoredNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY)?.slice(0, NICKNAME_MAX_LENGTH) ?? "";
  } catch {
    return ""; // storage blocked: the field just starts empty
  }
}

function storeNickname(nickname: string) {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // storage blocked: nothing to remember
  }
}

function isNicknameValid(nickname: string): boolean {
  return nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH;
}

function MicrophoneMeter({ preview }: { preview: DevicePreview }) {
  const [level, setLevel] = useState(0);

  useEffect(() => preview.onMicrophoneLevel(setLevel), [preview]);

  const clamped = Math.min(1, Math.max(0, level));
  return (
    <div
      role="meter"
      aria-label={texts.lobby.micLevelLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className="h-2 w-full overflow-hidden rounded-button bg-control"
    >
      <div
        className="h-full origin-left rounded-button bg-ink transition-transform duration-100 motion-reduce:transition-none"
        style={{ transform: `scaleX(${clamped})` }}
      />
    </div>
  );
}

type PreviewRequest = "idle" | "starting" | "done";

function DevicePreviewCard({ state, actions }: LobbyProps) {
  const [request, setRequest] = useState<PreviewRequest>("idle");
  const { preview } = state;

  const start = async () => {
    setRequest("starting");
    try {
      await actions.startPreview();
    } catch {
      // A denied permission is not an error here: the card says what is unavailable.
    }
    setRequest("done");
  };

  return (
    <section aria-label={texts.lobby.previewTitle} className="flex w-full flex-col gap-3">
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-card bg-mist">
        {preview?.cameraStream ? (
          <StreamVideo
            stream={preview.cameraStream}
            muted
            mirrored
            label={texts.lobby.previewCameraLabel}
            className="size-full object-cover"
          />
        ) : preview ? (
          <p className="px-6 text-center text-body-sm text-muted">{texts.lobby.previewNoCamera}</p>
        ) : request === "done" ? (
          <p className="px-6 text-center text-body-sm text-muted">{texts.lobby.previewUnavailable}</p>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="max-w-xs text-body-sm text-muted">{texts.lobby.previewIntro}</p>
            <Button
              variant="outline"
              className="min-h-11 rounded-button border-outline bg-canvas px-5 text-body-sm"
              isDisabled={request === "starting"}
              onPress={() => void start()}
            >
              {request === "starting" && <Spinner />}
              {request === "starting" ? texts.lobby.previewStarting : texts.lobby.previewStart}
            </Button>
          </div>
        )}
      </div>
      {preview &&
        (preview.hasMicrophone ? (
          <div className="flex items-center gap-3 px-1 text-body-sm text-muted">
            <span className="shrink-0">{texts.lobby.micLevelLabel}</span>
            <MicrophoneMeter preview={preview} />
          </div>
        ) : (
          <p className="px-1 text-body-sm text-muted">{texts.lobby.previewNoMicrophone}</p>
        ))}
    </section>
  );
}

interface LobbyProps {
  state: RoomState;
  actions: RoomActions;
}

/** Shown for `lobby` and `joining`, so the form keeps its place while the person enters. */
export function Lobby({ state, actions }: LobbyProps) {
  const [nickname, setNickname] = useState(readStoredNickname);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();
  const { state: account } = useAccountClient().useAccount();
  const location = useLocation();

  // Logged in: the person enters with the nickname of the profile, so there is nothing to type.
  const { accountNickname } = state;
  const trimmed = accountNickname ?? nickname.trim();
  const valid = accountNickname !== null || isNicknameValid(trimmed);
  // The rule only shows while what was typed breaks it (or after trying to enter with nothing typed).
  const showError = !valid && (submitted || nickname.length > 0);

  const turnstile = useTurnstileAction((turnstileToken) =>
    actions.join({ nickname: trimmed, turnstileToken }),
  );
  const joining = state.phase === "joining" || turnstile.status !== "idle";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setSubmitted(true);
      inputRef.current?.focus();
      return;
    }
    if (accountNickname === null) storeNickname(trimmed);
    turnstile.trigger();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-5 py-10">
      <NoticeBanner notice={state.notice} onDismiss={actions.dismissNotice} />
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <DevicePreviewCard state={state} actions={actions} />

        <form noValidate onSubmit={submit} className="flex flex-col items-center gap-gap">
          <h1 className="text-center font-display text-heading font-semibold">{texts.lobby.title}</h1>

          {accountNickname !== null ? (
            <p
              data-testid="joining-as"
              className="flex max-w-full items-center gap-3 rounded-button bg-mist py-1.5 pr-5 pl-1.5"
            >
              <Avatar nickname={accountNickname} avatarUrl={account.user?.avatarUrl ?? null} />
              <span className="flex min-w-0 flex-col text-left">
                <span className="text-compact text-muted">{texts.lobby.joiningAs}</span>
                <span className="truncate font-medium">{accountNickname}</span>
              </span>
            </p>
          ) : (
            /* Narrower than the column and centered under the title; the label follows the field's left edge. */
            <div className="flex w-full max-w-xs flex-col gap-2">
              <label htmlFor={inputId} className="text-body-sm font-medium">
                {texts.lobby.nicknameLabel}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                name="nickname"
                autoComplete="nickname"
                maxLength={NICKNAME_MAX_LENGTH}
                value={nickname}
                placeholder={texts.lobby.nicknamePlaceholder}
                disabled={joining}
                aria-invalid={showError ? true : undefined}
                aria-describedby={showError ? errorId : undefined}
                onChange={(event) => setNickname(event.target.value)}
                className="min-h-12 w-full rounded-field bg-canvas px-5 text-body shadow-outline outline-offset-2 placeholder:text-muted disabled:bg-mist"
              />
              {showError && (
                <p id={errorId} role="alert" className="px-1 text-body-sm font-medium text-notice">
                  {texts.lobby.nicknameInvalid}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            {/* Same pill as "create room" on the home page: as wide as its text, whatever it says. */}
            <Button
              type="submit"
              variant="primary"
              className="min-h-12 rounded-button px-7 text-body font-medium"
              isDisabled={joining}
            >
              {joining && <Spinner />}
              {turnstile.status === "waiting"
                ? texts.turnstile.checking
                : joining
                  ? texts.lobby.joining
                  : texts.lobby.join}
            </Button>
            <p className="text-center text-body-sm text-muted">{texts.lobby.mutedHint}</p>
            {accountNickname === null && (
              <Link
                to={loginPath(location.pathname + location.search)}
                className="inline-flex min-h-11 items-center rounded-link text-body-sm text-link underline-offset-2 hover:underline"
              >
                {texts.lobby.loginLink}
              </Link>
            )}
          </div>

          <TurnstileField {...turnstile} />
        </form>
      </div>
    </main>
  );
}
