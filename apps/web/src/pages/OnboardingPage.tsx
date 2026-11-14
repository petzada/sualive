import { Button } from "@heroui/react";
import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { blocksSubmit, HandleField, useHandleCheck } from "../components/account/HandleField";
import { CenteredPage, PageLoading } from "../components/account/PageShell";
import { loginPath, PATHS, RETURN_TO_PARAM, safeReturnTo } from "../components/account/paths";
import { FIELD_ERROR, OUTLINE_PILL, PRIMARY_PILL, TEXT_LINK } from "../components/account/styles";
import { Spinner } from "../components/icons";
import type { AccountActions, AccountErrorReason } from "../lib/account";
import { texts } from "../texts";

interface ConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown, and tied to the box, after a submit without it. */
  error: string | null;
  disabled: boolean;
  children: ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

function Consent({ checked, onChange, error, disabled, children, ref }: ConsentProps) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-start gap-3">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-3 size-5 shrink-0 cursor-pointer accent-accent"
        />
        <label htmlFor={id} className="flex-1 cursor-pointer py-2.5 text-left">
          {children}
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className={`pl-8 ${FIELD_ERROR}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Reasons that are about the handle itself: shown on the field, for the handle that was refused. */
const HANDLE_REASONS: Partial<Record<AccountErrorReason, string>> = {
  handleTaken: texts.handle.taken,
  handleReserved: texts.handle.reserved,
  invalid: texts.handle.invalid,
};

interface OnboardingFormProps {
  actions: AccountActions;
  /** Where the person goes once the first access is done. */
  doneTo: string;
  /** Told right before asking the server to finish, and again (`false`) if it refuses. */
  onFinishing: (finishing: boolean) => void;
}

function OnboardingForm({ actions, doneTo, onFinishing }: OnboardingFormProps) {
  const navigate = useNavigate();
  // One box for both: being of age and accepting the terms and the privacy policy.
  const [consented, setConsented] = useState(false);
  const [handle, setHandle] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ handle: string; reason: AccountErrorReason } | null>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);

  const status = useHandleCheck(handle, actions.checkHandle);
  const refusal = refused?.handle === handle ? refused.reason : null;
  const handleError =
    (refusal && HANDLE_REASONS[refusal]) ??
    (submitted && status === "empty" ? texts.onboarding.handleRequired : null);
  const generalError = refusal && !HANDLE_REASONS[refusal] ? texts.account.errors[refusal] : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!consented) return consentRef.current?.focus();
    if (blocksSubmit(status)) return handleRef.current?.focus();

    setBusy(true);
    onFinishing(true);
    setRefused(null);
    let reason: AccountErrorReason | null = null;
    try {
      const result = await actions.completeOnboarding({ handle, adult: true, acceptTerms: true });
      if (!result.ok) reason = result.reason;
    } catch {
      reason = "error";
    }
    if (reason) {
      setBusy(false);
      onFinishing(false);
      setRefused({ handle, reason });
      return;
    }
    await navigate(doneTo, { replace: true });
  };

  const legalLink = (path: string, label: string) => (
    // New tab: reading the document must not throw away what was filled in here.
    <a href={path} target="_blank" rel="noreferrer" className={TEXT_LINK}>
      {label}
    </a>
  );

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-heading font-semibold">{texts.onboarding.title}</h1>
        <p>{texts.onboarding.intro}</p>
      </div>

      <HandleField
        ref={handleRef}
        label={texts.handle.label}
        value={handle}
        onChange={setHandle}
        status={status}
        error={handleError}
        hint={texts.onboarding.handleHint}
        statusPlacement="label"
        disabled={busy}
      />

      <Consent
        ref={consentRef}
        checked={consented}
        onChange={setConsented}
        disabled={busy}
        error={submitted && !consented ? texts.onboarding.consentRequired : null}
      >
        {texts.onboarding.consent.before}
        {legalLink(PATHS.terms, texts.onboarding.consent.terms)}
        {texts.onboarding.consent.and}
        {legalLink(PATHS.privacy, texts.onboarding.consent.privacy)}
        {texts.onboarding.consent.after}
      </Consent>

      {generalError && (
        <p role="alert" className="text-center text-body-sm font-medium text-notice">
          {generalError}
        </p>
      )}

      <Button type="submit" variant="primary" className={`self-center ${PRIMARY_PILL}`} isDisabled={busy}>
        {busy && <Spinner />}
        {busy ? texts.onboarding.submitting : texts.onboarding.submit}
      </Button>
    </form>
  );
}

/**
 * First access: the @handle and one checkbox (of age, terms and privacy policy). The single box
 * sends both fields of the contract, `adult` and `acceptTerms`. Nothing else on the page: no name,
 * no account and no Plus at the top.
 */
export function OnboardingPage() {
  const { state, actions } = useAccountClient().useAccount();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM));
  // The account turns "onboarded" before the form gets its answer: this tells that case (just
  // finished here, so on to the welcome) from opening this page with the first access long done.
  const [finishing, setFinishing] = useState(false);
  const doneTo = returnTo ?? PATHS.welcome;

  if (state.status === "anonymous") {
    return <Navigate to={loginPath(returnTo ?? PATHS.onboarding)} replace />;
  }
  if (state.user?.onboarded) {
    return <Navigate to={finishing ? doneTo : (returnTo ?? PATHS.profile)} replace />;
  }

  return (
    <CenteredPage>
      {state.user ? (
        <OnboardingForm actions={actions} doneTo={doneTo} onFinishing={setFinishing} />
      ) : state.status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-gap text-center">
          <p role="alert">{texts.account.loadFailed}</p>
          <button
            type="button"
            onClick={() => void actions.refresh()}
            className={`cursor-pointer shadow-outline ${OUTLINE_PILL}`}
          >
            {texts.common.tryAgain}
          </button>
        </div>
      ) : (
        <PageLoading />
      )}
    </CenteredPage>
  );
}
