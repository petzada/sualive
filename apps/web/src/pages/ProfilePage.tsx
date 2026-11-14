import { Button } from "@heroui/react";
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from "@sualive/config";
import type { MeUser } from "@sualive/protocol";
import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Badges } from "../components/account/Badges";
import { blocksSubmit, HandleField, useHandleCheck } from "../components/account/HandleField";
import { PageShell, useAccountGate } from "../components/account/PageShell";
import { PATHS } from "../components/account/paths";
import { useNow } from "../components/account/plan";
import {
  CARD,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  OUTLINE_PILL,
  PRIMARY_PILL,
  TEXT_LINK,
} from "../components/account/styles";
import { formatDate } from "../components/format";
import { Spinner } from "../components/icons";
import { Avatar } from "../components/room/media";
import type { AccountActions, AccountErrorReason } from "../lib/account";
import { texts } from "../texts";

interface SectionProps {
  user: MeUser;
  actions: AccountActions;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-4 ${CARD}`}>
      <h2 id={id} className="font-display text-title font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Runs an account action and gives back the reason it failed (`null` when it worked). */
async function reasonOf(action: () => Promise<{ ok: boolean; reason?: AccountErrorReason }>) {
  try {
    const result = await action();
    return result.ok ? null : (result.reason ?? "error");
  } catch {
    return "error" as const;
  }
}

function NicknameForm({ user, actions }: SectionProps) {
  const [nickname, setNickname] = useState(user.nickname);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ nickname: string; reason: AccountErrorReason | null } | null>(
    null,
  );
  const inputId = useId();
  const hintId = useId();
  const messageId = useId();

  const trimmed = nickname.trim();
  const valid = trimmed.length >= NICKNAME_MIN_LENGTH && trimmed.length <= NICKNAME_MAX_LENGTH;
  // What happened to the last save only describes the nickname that was sent.
  const last = outcome?.nickname === trimmed ? outcome : null;
  const error = !valid
    ? texts.profile.nicknameInvalid
    : last?.reason
      ? texts.account.errors[last.reason]
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    const reason = await reasonOf(() => actions.updateProfile({ nickname: trimmed }));
    setBusy(false);
    setOutcome({ nickname: trimmed, reason });
  };

  return (
    <Section title={texts.profile.nicknameTitle}>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="sr-only">
          {texts.profile.nicknameLabel}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={inputId}
            type="text"
            name="nickname"
            autoComplete="nickname"
            maxLength={NICKNAME_MAX_LENGTH}
            value={nickname}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${hintId} ${messageId}`}
            onChange={(event) => setNickname(event.target.value)}
            className={`min-w-48 flex-1 ${FIELD}`}
          />
          <Button
            type="submit"
            variant="primary"
            className={PRIMARY_PILL}
            isDisabled={busy || !valid || trimmed === user.nickname}
          >
            {busy && <Spinner />}
            {busy ? texts.common.saving : texts.common.save}
          </Button>
        </div>
        <p id={hintId} className={FIELD_HINT}>
          {texts.profile.nicknameHint}
        </p>
        <p id={messageId} role={error ? "alert" : "status"} className={error ? FIELD_ERROR : FIELD_HINT}>
          {error ?? (last ? texts.common.saved : "")}
        </p>
      </form>
    </Section>
  );
}

function HandleForm({ user, actions }: SectionProps) {
  const now = useNow();
  const [handle, setHandle] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ handle: string; reason: AccountErrorReason } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = useHandleCheck(handle, actions.checkHandle, user.handle);

  const lockedUntil =
    user.handleChangeAvailableAt !== null && user.handleChangeAvailableAt > now
      ? user.handleChangeAvailableAt
      : null;

  const refusal = refused?.handle === handle ? refused.reason : null;
  const error = refusal
    ? texts.account.errors[refusal]
    : status === "same"
      ? texts.profile.handleSame
      : submitted && status === "empty"
        ? texts.onboarding.handleRequired
        : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (blocksSubmit(status)) return inputRef.current?.focus();
    setBusy(true);
    const reason = await reasonOf(() => actions.updateProfile({ handle }));
    setBusy(false);
    if (reason) return setRefused({ handle, reason });
    setHandle("");
    setSubmitted(false);
  };

  return (
    <Section title={texts.profile.handleTitle}>
      {lockedUntil !== null ? (
        <p data-testid="handle-locked">{texts.profile.handleLocked(formatDate(lockedUntil))}</p>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <HandleField
            ref={inputRef}
            label={texts.profile.handleLabel}
            value={handle}
            onChange={setHandle}
            status={status}
            error={error}
            hint={texts.profile.handleChangeHint}
            disabled={busy}
          />
          <Button type="submit" variant="outline" className={`self-start ${OUTLINE_PILL}`} isDisabled={busy}>
            {busy && <Spinner />}
            {texts.profile.handleSubmit}
          </Button>
        </form>
      )}
    </Section>
  );
}

/** Its own zone at the end of the page. Nothing is deleted before the person types their @handle. */
function DeleteAccount({ user, actions }: SectionProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AccountErrorReason | null>(null);
  const inputId = useId();
  const explainId = useId();

  const handle = user.handle ?? "";
  // With or without the "@" in front.
  const matches = handle !== "" && typed.trim().toLowerCase().replace(/^@/, "") === handle;

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setFailure(null);
    const reason = await reasonOf(() => actions.deleteAccount());
    if (reason) {
      setBusy(false);
      setFailure(reason);
      return;
    }
    await navigate(PATHS.home, { replace: true });
  };

  return (
    <section
      aria-labelledby={explainId}
      className="flex flex-col gap-4 rounded-card p-card shadow-outline"
      data-testid="delete-zone"
    >
      <h2 id={explainId} className="font-display text-title font-semibold">
        {texts.profile.deleteTitle}
      </h2>
      <p className="text-body-sm">{texts.profile.deleteExplain}</p>
      {user.plan.plus && (
        <p className="text-body-sm font-medium text-notice">{texts.profile.deletePlusWarning}</p>
      )}

      {!open ? (
        <Button variant="outline" className={`self-start ${OUTLINE_PILL}`} onPress={() => setOpen(true)}>
          {texts.profile.deleteStart}
        </Button>
      ) : (
        <form noValidate onSubmit={(event) => void confirm(event)} className="flex flex-col gap-3">
          <label htmlFor={inputId} className="text-body-sm font-medium">
            {texts.profile.deleteConfirmLabel(handle)}
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={typed}
            disabled={busy}
            onChange={(event) => setTyped(event.target.value)}
            className={FIELD}
          />
          {failure && (
            <p role="alert" className={FIELD_ERROR}>
              {texts.account.errors[failure]}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              className="min-h-11 rounded-button bg-ink px-5 text-body-sm text-canvas"
              isDisabled={!matches || busy}
            >
              {busy && <Spinner />}
              {busy ? texts.profile.deleting : texts.profile.deleteConfirm}
            </Button>
            <Button
              variant="outline"
              className={OUTLINE_PILL}
              isDisabled={busy}
              onPress={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              {texts.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function Logout({ actions }: { actions: AccountActions }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await actions.logout();
    } finally {
      await navigate(PATHS.home, { replace: true });
    }
  };

  return (
    <Button
      variant="outline"
      className={`self-start ${OUTLINE_PILL}`}
      isDisabled={busy}
      onPress={() => void logout()}
    >
      {busy && <Spinner />}
      {busy ? texts.profile.loggingOut : texts.profile.logout}
    </Button>
  );
}

export function ProfilePage() {
  const { user, fallback, actions } = useAccountGate();
  if (!user) return <PageShell>{fallback}</PageShell>;

  return (
    <PageShell>
      <header className="flex flex-wrap items-center gap-5">
        <span title={texts.profile.avatarHint}>
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="lg" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="sr-only">{texts.profile.title}</h1>
          <p className="truncate font-display text-heading font-semibold" data-testid="profile-nickname">
            {user.nickname}
          </p>
          {user.handle && <p className="truncate text-muted">{texts.handle.display(user.handle)}</p>}
          {user.badges.length > 0 && (
            <div role="group" aria-label={texts.profile.badgesLabel}>
              <Badges badges={user.badges} withNames />
            </div>
          )}
          {/* The plan has its own page; who has none is shown the offer. */}
          <Link
            to={user.plan.plus ? PATHS.plan : PATHS.plus}
            data-testid="profile-plan-link"
            className={`self-start text-body-sm ${TEXT_LINK}`}
          >
            {user.plan.plus ? texts.profile.planLink : texts.profile.plusLink}
          </Link>
        </div>
      </header>

      <NicknameForm user={user} actions={actions} />
      <HandleForm user={user} actions={actions} />

      <Section title={texts.profile.sessionTitle}>
        <Logout actions={actions} />
      </Section>

      <DeleteAccount user={user} actions={actions} />
    </PageShell>
  );
}
