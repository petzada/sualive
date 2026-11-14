import { HANDLE_MAX_LENGTH, HANDLE_PATTERN } from "@sualive/config";
import { useEffect, useId, useRef, useState } from "react";
import type { Ref } from "react";
import type { AccountActions } from "../../lib/account";
import { texts } from "../../texts";
import { CheckIcon } from "../icons";
import { FIELD_ERROR, FIELD_HINT } from "./styles";

const HANDLE_REGEX = new RegExp(HANDLE_PATTERN);

/** Wait after the last key before asking the server whether the handle is free. */
export const HANDLE_CHECK_DELAY_MS = 400;

export function isHandleValid(handle: string): boolean {
  return HANDLE_REGEX.test(handle);
}

/** What the person typed, without the "@", spaces or capitals. Other characters stay, to be explained. */
export function normalizeHandle(value: string): string {
  return value.replace(/^@+/, "").replace(/\s/g, "").toLowerCase().slice(0, HANDLE_MAX_LENGTH);
}

export type HandleStatus =
  | "empty"
  | "invalid" // breaks the rules (here or on the server)
  | "same" // the handle the person already has
  | "checking"
  | "available"
  | "taken"
  | "reserved"
  | "unknown"; // the check failed; the server decides on submit

/** Statuses that stop a submit. `checking` and `unknown` do not: the server has the last word. */
export function blocksSubmit(status: HandleStatus): boolean {
  return (
    status === "empty" ||
    status === "invalid" ||
    status === "same" ||
    status === "taken" ||
    status === "reserved"
  );
}

type Checked = { handle: string; status: HandleStatus };

/** Availability of a handle, asked a moment after the person stops typing. */
export function useHandleCheck(
  handle: string,
  checkHandle: AccountActions["checkHandle"],
  current: string | null = null,
): HandleStatus {
  const [checked, setChecked] = useState<Checked | null>(null);
  const checkRef = useRef(checkHandle);
  const needsCheck = isHandleValid(handle) && handle !== current;

  useEffect(() => {
    checkRef.current = checkHandle;
  });

  useEffect(() => {
    if (!needsCheck) return;
    let active = true;
    const finish = (status: HandleStatus) => {
      if (active) setChecked({ handle, status });
    };
    const timer = setTimeout(() => {
      checkRef.current(handle).then(
        (result) => {
          if (!result.ok) finish("unknown");
          else if (result.value.available) finish("available");
          else finish(result.value.reason ?? "taken");
        },
        () => finish("unknown"),
      );
    }, HANDLE_CHECK_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [handle, needsCheck]);

  if (handle === "") return "empty";
  if (!isHandleValid(handle)) return "invalid";
  if (handle === current) return "same";
  return checked?.handle === handle ? checked.status : "checking";
}

const STATUS_TEXT: Partial<Record<HandleStatus, string>> = {
  invalid: texts.handle.invalid,
  checking: texts.handle.checking,
  available: texts.handle.available,
  taken: texts.handle.taken,
  reserved: texts.handle.reserved,
  unknown: texts.handle.checkFailed,
};

interface HandleFieldProps {
  label: string;
  value: string;
  onChange: (handle: string) => void;
  status: HandleStatus;
  /** Replaces the status line (refusal from the server, or "choose a handle" after a submit). */
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/** The @handle field: fixed "@" in front, rules below, and the availability as the person types. */
export function HandleField({
  label,
  value,
  onChange,
  status,
  error,
  hint,
  disabled,
  ref,
}: HandleFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();

  const failing = status === "invalid" || status === "taken" || status === "reserved";
  const message = error ?? STATUS_TEXT[status] ?? null;
  const invalid = Boolean(error) || failing;

  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={inputId} className="text-body-sm font-medium">
        {label}
      </label>
      <div
        className={`flex min-h-12 w-full items-center rounded-field px-5 shadow-outline outline-offset-2 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
          disabled ? "bg-mist" : "bg-canvas"
        }`}
      >
        <span aria-hidden="true" className="text-body text-muted">
          {texts.handle.prefix}
        </span>
        <input
          ref={ref}
          id={inputId}
          type="text"
          name="handle"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={HANDLE_MAX_LENGTH + 1}
          value={value}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${hintId} ${statusId}`}
          onChange={(event) => onChange(normalizeHandle(event.target.value))}
          className="min-h-12 min-w-0 flex-1 bg-transparent text-body text-ink outline-none"
        />
      </div>
      <p id={hintId} className={FIELD_HINT}>
        {hint ? `${hint} ${texts.handle.rule}` : texts.handle.rule}
      </p>
      {/* Always mounted, so a screen reader hears each change of the availability. */}
      <p
        id={statusId}
        role={invalid ? "alert" : "status"}
        data-status={status}
        className={`flex min-h-5 items-center gap-1.5 ${invalid ? FIELD_ERROR : status === "available" ? "px-1 text-body-sm text-ink" : FIELD_HINT}`}
      >
        {!error && status === "available" && <CheckIcon />}
        {message}
      </p>
    </div>
  );
}
