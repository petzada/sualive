import { Button } from "@heroui/react";
import { PLUS_ANNUAL_PRICE_CENTS, PLUS_MONTHLY_PRICE_CENTS } from "@sualive/config";
import type { MeUser, Plan, PlusCheckoutResponse, PlusCycle } from "@sualive/protocol";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { PageShell, useAccountGate } from "../components/account/PageShell";
import { loginPath, PATHS } from "../components/account/paths";
import { annualExpiryNotice, CopyButton, planStatusText, useNow } from "../components/account/plan";
import {
  CARD,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  OUTLINE_PILL,
  PRIMARY_LINK,
  PRIMARY_PILL,
} from "../components/account/styles";
import {
  CPF_LENGTH,
  cpfDigits,
  formatCents,
  formatDate,
  formatDateTime,
  isValidCpf,
  maskCpf,
} from "../components/format";
import { CheckIcon, Spinner } from "../components/icons";
import type { AccountActions, AccountErrorReason, AccountState, PaymentStatus } from "../lib/account";
import { texts } from "../texts";

const CYCLES: PlusCycle[] = ["monthly", "annual"];
const PRICES: Record<PlusCycle, number> = {
  monthly: PLUS_MONTHLY_PRICE_CENTS,
  annual: PLUS_ANNUAL_PRICE_CENTS,
};

/** `?ciclo=mensal|anual`: comes back from the login with the cycle already chosen. */
const CYCLE_PARAM = "ciclo";
const CYCLE_SLUGS: Record<PlusCycle, string> = { monthly: "mensal", annual: "anual" };
const cycleFromSlug = (slug: string | null) => CYCLES.find((cycle) => CYCLE_SLUGS[cycle] === slug) ?? null;

type Step =
  | { kind: "choose" }
  | { kind: "taxId"; cycle: PlusCycle }
  | { kind: "pay"; cycle: PlusCycle; taxId: string; checkout: PlusCheckoutResponse };

function Benefits() {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2 id={id} className="font-display text-kicker font-semibold">
        {texts.plus.benefitsTitle}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {texts.plus.benefits.map((benefit) => (
          <li key={benefit.title} className="flex gap-3 rounded-nav bg-mist p-5">
            <span className="mt-0.5 shrink-0 text-accent">
              <CheckIcon />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-medium">{benefit.title}</span>
              <span className="text-body-sm text-muted">{benefit.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-muted">{texts.plus.earlySupporter}</p>
    </section>
  );
}

interface PlanStatusProps {
  plan: Plan;
  actions: AccountActions;
  onChange: (plan: Plan) => void;
}

/** State of the subscription, the annual expiry warning and the cancellation. */
function PlanStatus({ plan, actions, onChange }: PlanStatusProps) {
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AccountErrorReason | null>(null);
  const titleId = useId();

  const status = planStatusText(plan);
  if (!status) return null;
  const expiry = annualExpiryNotice(plan, now);
  // Only a recurring subscription has something to cancel: the annual plan never renews.
  const cancelable = plan.cycle === "monthly" && (plan.status === "active" || plan.status === "past_due");
  const periodEnd = plan.periodEnd === null ? "" : formatDate(plan.periodEnd);

  const cancel = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await actions.cancelPlus();
      if (result.ok) {
        onChange(result.value);
        setConfirming(false);
      } else setFailure(result.reason);
    } catch {
      setFailure("error");
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-3 ${CARD}`} data-testid="plan-status">
      <h2 id={titleId} className="font-display text-title font-semibold">
        {texts.plus.status.title}
      </h2>
      <p data-status={plan.status} role={plan.status === "past_due" ? "alert" : undefined}>
        {status}
      </p>
      {expiry && (
        <p data-testid="annual-expiry" className="font-medium text-notice">
          {expiry}
        </p>
      )}
      {plan.status === "canceled" && (
        <p className="text-body-sm text-muted">{texts.plus.status.resubscribeLater}</p>
      )}

      {cancelable &&
        (confirming ? (
          <div role="group" aria-label={texts.plus.cancel.start} className="flex flex-col gap-3">
            <p className="text-body-sm">{texts.plus.cancel.explain(periodEnd)}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-11 rounded-button bg-ink px-5 text-body-sm text-canvas"
                isDisabled={busy}
                onPress={() => void cancel()}
              >
                {busy && <Spinner />}
                {busy ? texts.plus.cancel.canceling : texts.plus.cancel.confirm}
              </Button>
              <Button
                variant="outline"
                className={OUTLINE_PILL}
                isDisabled={busy}
                autoFocus
                onPress={() => setConfirming(false)}
              >
                {texts.plus.cancel.keep}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className={`self-start ${OUTLINE_PILL}`}
            onPress={() => setConfirming(true)}
          >
            {texts.plus.cancel.start}
          </Button>
        ))}
      {failure && (
        <p role="alert" className={FIELD_ERROR}>
          {texts.account.errors[failure]}
        </p>
      )}
    </section>
  );
}

interface CyclesProps {
  /** `null`: the cards only inform (billing off, or the person already has the Plus). */
  onChoose: ((cycle: PlusCycle) => void) | null;
}

function Cycles({ onChoose }: CyclesProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2 id={id} className="font-display text-kicker font-semibold">
        {texts.plus.cyclesTitle}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {CYCLES.map((cycle) => {
          const copy = texts.plus.cycles[cycle];
          return (
            <li key={cycle} data-testid={`cycle-${cycle}`} className={`flex flex-col gap-3 ${CARD}`}>
              <h3 className="font-display text-title font-semibold">{copy.name}</h3>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-heading font-semibold">{formatCents(PRICES[cycle])}</span>
                <span className="text-body-sm text-muted">{copy.per}</span>
              </p>
              <p className="flex-1 text-body-sm">{copy.how}</p>
              {onChoose && (
                <Button
                  variant="primary"
                  className={`self-start ${PRIMARY_PILL}`}
                  onPress={() => onChoose(cycle)}
                >
                  {copy.choose}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface TaxIdFormProps {
  cycle: PlusCycle;
  actions: AccountActions;
  onBack: () => void;
  onCheckout: (taxId: string, checkout: PlusCheckoutResponse) => void;
}

/** Runs the checkout and gives the charge, or the reason it could not be created. */
async function startCheckout(actions: AccountActions, cycle: PlusCycle, taxId: string) {
  try {
    return await actions.startPlusCheckout({ cycle, taxId });
  } catch {
    return { ok: false as const, reason: "error" as const };
  }
}

function TaxIdForm({ cycle, actions, onBack, onCheckout }: TaxIdFormProps) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AccountErrorReason | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();
  const whyId = useId();
  const errorId = useId();

  const valid = isValidCpf(value);
  // The rule shows after a try, or once all the digits are in and they do not add up.
  const showInvalid = !valid && (submitted || cpfDigits(value).length === CPF_LENGTH);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return inputRef.current?.focus();
    setBusy(true);
    setFailure(null);
    const taxId = cpfDigits(value);
    const result = await startCheckout(actions, cycle, taxId);
    setBusy(false);
    if (result.ok) onCheckout(taxId, result.value);
    else setFailure(result.reason);
  };

  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-4 ${CARD}`}>
      <h2 id={titleId} className="font-display text-kicker font-semibold">
        {texts.plus.checkout.title(texts.plus.status.cycle[cycle])}
      </h2>
      <p>
        <span className="font-semibold">{formatCents(PRICES[cycle])}</span> {texts.plus.cycles[cycle].per}.{" "}
        <span className="text-body-sm text-muted">{texts.plus.cycles[cycle].how}</span>
      </p>

      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-body-sm font-medium">
          {texts.plus.checkout.cpfLabel}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          name="cpf"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder={texts.plus.checkout.cpfPlaceholder}
          value={value}
          disabled={busy}
          aria-invalid={showInvalid ? true : undefined}
          aria-describedby={showInvalid ? `${errorId} ${whyId}` : whyId}
          onChange={(event) => setValue(maskCpf(event.target.value))}
          className={`max-w-xs ${FIELD}`}
        />
        {showInvalid && (
          <p id={errorId} role="alert" className={FIELD_ERROR}>
            {texts.plus.checkout.cpfInvalid}
          </p>
        )}
        <p id={whyId} className={FIELD_HINT}>
          {texts.plus.checkout.cpfWhy}
        </p>
        {failure && (
          <p role="alert" className={FIELD_ERROR}>
            {texts.account.errors[failure]}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" className={PRIMARY_PILL} isDisabled={busy}>
            {busy && <Spinner />}
            {busy ? texts.plus.checkout.submitting : texts.plus.checkout.submit}
          </Button>
          <Button variant="outline" className={OUTLINE_PILL} isDisabled={busy} onPress={onBack}>
            {texts.plus.checkout.back}
          </Button>
        </div>
      </form>
    </section>
  );
}

interface PaymentProps {
  cycle: PlusCycle;
  checkout: PlusCheckoutResponse;
  actions: AccountActions;
  /** Asks for a new charge with the same cycle and CPF; resolves to the reason when it fails. */
  onRetry: () => Promise<AccountErrorReason | null>;
}

/** The QR Code on screen, followed until it is paid, expires or fails. */
function Payment({ cycle, checkout, actions, onRetry }: PaymentProps) {
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [retrying, setRetrying] = useState(false);
  const [failure, setFailure] = useState<AccountErrorReason | null>(null);
  const watchRef = useRef(actions.watchPlusPayment);
  const titleId = useId();
  const codeId = useId();

  useEffect(() => {
    watchRef.current = actions.watchPlusPayment;
  });

  useEffect(() => watchRef.current(checkout.paymentId, setStatus), [checkout.paymentId]);

  const retry = async () => {
    setRetrying(true);
    setFailure(null);
    const reason = await onRetry();
    // On success the parent swaps this panel for the one of the new charge.
    if (reason) {
      setFailure(reason);
      setRetrying(false);
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className={`flex flex-col gap-4 ${CARD}`}
      data-testid="payment"
      data-status={status}
    >
      <h2 id={titleId} className="font-display text-kicker font-semibold">
        {status === "paid" ? texts.plus.checkout.paidTitle : texts.plus.checkout.qrTitle}
      </h2>

      {status === "pending" && (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* The code is dark on white whatever the theme, or a bank app may not read it. */}
          <img
            src={checkout.qrCodeImageUrl}
            alt={texts.plus.checkout.qrAlt}
            referrerPolicy="no-referrer"
            className="size-56 shrink-0 self-center rounded-nav bg-on-stage p-2 sm:self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-body-sm">{texts.plus.checkout.qrHow[cycle]}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-muted">{texts.plus.checkout.amount}</dt>
              <dd className="font-semibold">{formatCents(checkout.amountCents)}</dd>
              <dt className="text-muted">{texts.plus.checkout.expiresAt}</dt>
              <dd>{formatDateTime(checkout.expiresAt)}</dd>
            </dl>
            <label htmlFor={codeId} className="text-body-sm font-medium">
              {texts.plus.checkout.brCodeLabel}
            </label>
            <textarea
              id={codeId}
              readOnly
              rows={3}
              value={checkout.brCode}
              onFocus={(event) => event.target.select()}
              className="w-full resize-none rounded-nav bg-canvas px-4 py-3 text-body break-all text-ink shadow-outline outline-offset-2"
            />
            <CopyButton text={checkout.brCode} />
          </div>
        </div>
      )}

      {/* One live region for every state of the payment. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {status === "pending" && (
          <p className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner />
            {texts.plus.checkout.pending}
          </p>
        )}
        {status === "paid" && <p>{texts.plus.checkout.paid}</p>}
        {(status === "expired" || status === "failed") && (
          <p className="font-medium text-notice">{texts.plus.checkout[status]}</p>
        )}
      </div>

      {status === "paid" && (
        <Link to={PATHS.profile} className={`self-start ${PRIMARY_LINK}`}>
          {texts.plus.checkout.paidAction}
        </Link>
      )}
      {(status === "expired" || status === "failed") && (
        <Button
          variant="primary"
          className={`self-start ${PRIMARY_PILL}`}
          isDisabled={retrying}
          onPress={() => void retry()}
        >
          {retrying && <Spinner />}
          {retrying ? texts.plus.checkout.submitting : texts.plus.checkout.retry}
        </Button>
      )}
      {failure && (
        <p role="alert" className={FIELD_ERROR}>
          {texts.account.errors[failure]}
        </p>
      )}
    </section>
  );
}

interface PlusContentProps {
  user: MeUser | null;
  state: AccountState;
  actions: AccountActions;
}

function PlusContent({ user, state, actions }: PlusContentProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // After a cancellation the answer of the server is shown at once, whatever the account refresh does.
  const [canceledPlan, setCanceledPlan] = useState<Plan | null>(null);
  const plan = canceledPlan ?? user?.plan ?? null;
  const canSubscribe = state.billingEnabled && !plan?.plus;

  const [step, setStep] = useState<Step>(() => {
    const cycle = cycleFromSlug(params.get(CYCLE_PARAM));
    return cycle && user && canSubscribe ? { kind: "taxId", cycle } : { kind: "choose" };
  });

  const choose = (cycle: PlusCycle) => {
    if (user) setStep({ kind: "taxId", cycle });
    else void navigate(loginPath(`${PATHS.plus}?${CYCLE_PARAM}=${CYCLE_SLUGS[cycle]}`));
  };

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-heading font-semibold">{texts.plus.title}</h1>
        <p className="max-w-xl">{texts.plus.lead}</p>
      </header>

      {plan && step.kind !== "pay" && <PlanStatus plan={plan} actions={actions} onChange={setCanceledPlan} />}

      <Benefits />

      {step.kind === "pay" && (
        <Payment
          key={step.checkout.paymentId}
          cycle={step.cycle}
          checkout={step.checkout}
          actions={actions}
          onRetry={async () => {
            const result = await startCheckout(actions, step.cycle, step.taxId);
            if (!result.ok) return result.reason;
            setStep({ ...step, checkout: result.value });
            return null;
          }}
        />
      )}
      {step.kind === "taxId" && (
        <TaxIdForm
          cycle={step.cycle}
          actions={actions}
          onBack={() => setStep({ kind: "choose" })}
          onCheckout={(taxId, checkout) => setStep({ kind: "pay", cycle: step.cycle, taxId, checkout })}
        />
      )}

      {step.kind === "choose" && (
        <>
          <Cycles onChoose={canSubscribe ? choose : null} />
          {!state.billingEnabled ? (
            <p role="status" data-testid="billing-disabled" className="rounded-nav bg-mist p-5 font-medium">
              {texts.plus.billingDisabled}
            </p>
          ) : (
            !user && <p className="text-body-sm text-muted">{texts.plus.loginToSubscribe}</p>
          )}
        </>
      )}
    </>
  );
}

/** The plan: benefits, the two cycles, the Pix checkout and the state of the subscription. */
export function PlusPage() {
  const { user, fallback, state, actions } = useAccountGate({ anonymous: "allow" });

  return (
    <PageShell width="wide">
      {fallback ?? <PlusContent user={user} state={state} actions={actions} />}
    </PageShell>
  );
}
