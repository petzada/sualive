import { Button } from "@heroui/react";
import { PLUS_ANNUAL_EXPIRY_NOTICE_DAYS } from "@sualive/config";
import type { Plan } from "@sualive/protocol";
import { useId, useState } from "react";
import { Link } from "react-router";
import type { AccountActions, AccountErrorReason } from "../../lib/account";
import { texts } from "../../texts";
import { daysUntil, formatDate } from "../format";
import { Spinner } from "../icons";
import { fixedRoomPath } from "./paths";
import { CARD, FIELD, FIELD_ERROR, OUTLINE_LINK, OUTLINE_PILL } from "./styles";

/** The moment the screen opened. Read once, so rendering stays pure. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}

const MONTHS_PER_YEAR = 12;

/**
 * How much less the annual plan costs than twelve months of the monthly one, as a whole
 * percentage rounded down (never promises more than it gives). Zero when there is no saving.
 */
export function annualDiscountPercent(monthlyCents: number, annualCents: number): number {
  const yearOfMonthly = MONTHS_PER_YEAR * monthlyCents;
  if (yearOfMonthly <= 0) return 0;
  return Math.max(0, Math.floor((1 - annualCents / yearOfMonthly) * 100));
}

/** One sentence for the state of the subscription; `null` for who never subscribed. */
export function planStatusText(plan: Plan): string | null {
  const date = plan.periodEnd === null ? "" : formatDate(plan.periodEnd);
  const cycle = plan.cycle ? texts.plus.status.cycle[plan.cycle] : "";
  switch (plan.status) {
    case "none":
      return null;
    case "active":
      return plan.renews
        ? texts.plus.status.activeRenews(cycle, date)
        : texts.plus.status.activeUntil(cycle, date);
    case "past_due":
      return texts.plus.status.pastDue;
    case "canceled":
      return texts.plus.status.canceled(date);
    case "ended":
      return texts.plus.status.ended;
  }
}

/** The annual plan does not renew: warns when it is about to end. `null` outside that window. */
export function annualExpiryNotice(plan: Plan, now: number): string | null {
  if (plan.status !== "active" || plan.cycle !== "annual" || plan.periodEnd === null) return null;
  const days = daysUntil(plan.periodEnd, now);
  if (days > PLUS_ANNUAL_EXPIRY_NOTICE_DAYS || plan.periodEnd <= now) return null;
  return texts.plus.annualExpiry(days, formatDate(plan.periodEnd));
}

type CopyState = "idle" | "copied" | "failed";

/** How long "copied" stays before the button goes back to "copy". */
const COPIED_MS = 2500;

/** Copies a text and says so, also to screen readers. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [state, setState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), COPIED_MS);
    } catch {
      setState("failed");
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-label={label}
        onClick={() => void copy()}
        className={`cursor-pointer shadow-outline ${OUTLINE_PILL}`}
      >
        {state === "copied" ? texts.common.copied : texts.common.copy}
      </button>
      <span role="status" className="text-body-sm text-notice empty:hidden">
        {state === "failed" && texts.common.copyFailed}
        {state === "copied" && <span className="sr-only">{texts.common.copied}</span>}
      </span>
    </span>
  );
}

/** State, cycle and the date that matters, one fact per row. */
function PlanDetails({ plan }: { plan: Plan }) {
  if (plan.status === "none") return null;
  // A payment that did not pass has no date to promise; an ended plan has none ahead.
  const dated = plan.periodEnd !== null && (plan.status === "active" || plan.status === "canceled");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm" data-testid="plan-details">
      <dt className="text-muted">{texts.plan.details.state}</dt>
      <dd className="font-medium">{texts.plan.details.states[plan.status]}</dd>
      {plan.cycle && (
        <>
          <dt className="text-muted">{texts.plan.details.cycle}</dt>
          <dd>{texts.plus.cycles[plan.cycle].name}</dd>
        </>
      )}
      {dated && plan.periodEnd !== null && (
        <>
          <dt className="text-muted">
            {plan.renews ? texts.plan.details.renewsOn : texts.plan.details.validUntil}
          </dt>
          <dd>{formatDate(plan.periodEnd)}</dd>
        </>
      )}
    </dl>
  );
}

interface PlanStatusProps {
  plan: Plan;
  /**
   * With the actions, this is the management of the own plan: the details and the cancellation.
   * Without them it only says the state (the offer page, for a plan that has ended).
   */
  manage?: { actions: AccountActions; onChange: (plan: Plan) => void };
}

/** State of the subscription, the annual expiry warning and the cancellation. */
export function PlanStatus({ plan, manage }: PlanStatusProps) {
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AccountErrorReason | null>(null);
  const titleId = useId();

  const status = planStatusText(plan);
  if (!status) return null;
  const expiry = annualExpiryNotice(plan, now);
  // Only a recurring subscription has something to cancel: the annual plan never renews.
  const cancelable =
    manage !== undefined &&
    plan.cycle === "monthly" &&
    (plan.status === "active" || plan.status === "past_due");
  const periodEnd = plan.periodEnd === null ? "" : formatDate(plan.periodEnd);

  const cancel = async () => {
    if (!manage) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await manage.actions.cancelPlus();
      if (result.ok) {
        manage.onChange(result.value);
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
      {manage && <PlanDetails plan={plan} />}
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

/** The permanent room of a subscriber: its address, to copy and to open. */
export function FixedLink({ handle }: { handle: string }) {
  const path = fixedRoomPath(handle);
  const address = window.location.origin + path;
  const titleId = useId();
  const inputId = useId();
  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-4 ${CARD}`}>
      <h2 id={titleId} className="font-display text-title font-semibold">
        {texts.plan.fixedLinkTitle}
      </h2>
      <p className="text-body-sm text-muted">{texts.plan.fixedLinkHint}</p>
      <label htmlFor={inputId} className="sr-only">
        {texts.plan.fixedLinkLabel}
      </label>
      <input
        id={inputId}
        type="text"
        readOnly
        value={address}
        onFocus={(event) => event.target.select()}
        className={FIELD}
      />
      <div className="flex flex-wrap items-start gap-3">
        <CopyButton text={address} />
        <Link to={path} className={OUTLINE_LINK}>
          {texts.plan.fixedLinkOpen}
        </Link>
      </div>
    </section>
  );
}
