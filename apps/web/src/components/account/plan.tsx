import { PLUS_ANNUAL_EXPIRY_NOTICE_DAYS } from "@sualive/config";
import type { Plan } from "@sualive/protocol";
import { useState } from "react";
import { texts } from "../../texts";
import { daysUntil, formatDate } from "../format";
import { OUTLINE_PILL } from "./styles";

/** The moment the screen opened. Read once, so rendering stays pure. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
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
