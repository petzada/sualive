import { Button } from "@heroui/react";
import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { WalletActions, WalletErrorReason, WalletResponse, WalletResult } from "../../lib/wallet";
import { texts } from "../../texts";
import { CARD, FIELD, FIELD_ERROR, FIELD_HINT, OUTLINE_PILL, PRIMARY_PILL } from "../account/styles";
import { formatAmount } from "../format";
import { Spinner } from "../icons";
import { attempt, cleanHandle } from "./shared";

interface Gift {
  /** Already clean: lower case, no "@". */
  handle: string;
  /** Zero when the gift has no amount to choose. */
  amount: number;
}

interface GiftFormProps {
  testId: string;
  title: string;
  intro: string;
  /** Extra line under the introduction (what was already sent today). */
  note?: ReactNode;
  handleLabel: string;
  /** With it, the form also asks how much. */
  amountLabel?: string;
  submitLabel: string;
  confirmLabel: string;
  busyLabel: string;
  confirmText: (gift: Gift) => string;
  doneText: (gift: Gift) => string;
  send: (gift: Gift) => Promise<WalletResult>;
}

/**
 * A gift to another account by its @handle. Nothing is sent before the person confirms what the
 * form understood; the server decides balance, limit and who can receive.
 */
function GiftForm(props: GiftFormProps) {
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<Gift | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<WalletErrorReason | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const handleId = useId();
  const handleErrorId = useId();
  const amountId = useId();
  const amountErrorId = useId();

  const withAmount = props.amountLabel !== undefined;
  const cleaned = cleanHandle(handle);
  const value = Number(amount);
  const handleValid = cleaned !== "";
  const amountValid = !withAmount || (/^\d+$/.test(amount) && value >= 1);
  const locked = pending !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure(null);
    setDone(null);
    if (!handleValid) return handleRef.current?.focus();
    if (!amountValid) return amountRef.current?.focus();
    setPending({ handle: cleaned, amount: withAmount ? value : 0 });
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    const result = await attempt(() => props.send(pending));
    setBusy(false);
    setPending(null);
    if (!result.ok) return setFailure(result.reason);
    setDone(props.doneText(pending));
    setHandle("");
    setAmount("");
    setSubmitted(false);
  };

  return (
    <section aria-labelledby={titleId} className={`flex flex-col gap-4 ${CARD}`} data-testid={props.testId}>
      <h2 id={titleId} className="font-display text-title font-semibold">
        {props.title}
      </h2>
      <p className="text-body-sm text-muted">{props.intro}</p>
      {props.note}

      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={handleId} className="text-body-sm font-medium">
            {props.handleLabel}
          </label>
          <input
            ref={handleRef}
            id={handleId}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={texts.wallet.handlePlaceholder}
            value={handle}
            disabled={locked}
            aria-invalid={submitted && !handleValid ? true : undefined}
            aria-describedby={submitted && !handleValid ? handleErrorId : undefined}
            onChange={(event) => setHandle(event.target.value)}
            className={`max-w-xs ${FIELD}`}
          />
          {submitted && !handleValid && (
            <p id={handleErrorId} role="alert" className={FIELD_ERROR}>
              {texts.wallet.handleInvalid}
            </p>
          )}
        </div>

        {withAmount && (
          <div className="flex flex-col gap-2">
            <label htmlFor={amountId} className="text-body-sm font-medium">
              {props.amountLabel}
            </label>
            <input
              ref={amountRef}
              id={amountId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              disabled={locked}
              aria-invalid={submitted && !amountValid ? true : undefined}
              aria-describedby={submitted && !amountValid ? amountErrorId : undefined}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
              className={`max-w-xs ${FIELD}`}
            />
            {submitted && !amountValid && (
              <p id={amountErrorId} role="alert" className={FIELD_ERROR}>
                {texts.wallet.amountInvalid}
              </p>
            )}
          </div>
        )}

        {!pending && (
          <Button type="submit" variant="primary" className={`self-start ${PRIMARY_PILL}`}>
            {props.submitLabel}
          </Button>
        )}
      </form>

      {pending && (
        <div role="group" aria-label={props.submitLabel} className="flex flex-col gap-3">
          <p data-testid="gift-confirm">{props.confirmText(pending)}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11 rounded-button bg-ink px-5 text-body-sm text-canvas"
              isDisabled={busy}
              onPress={() => void confirm()}
            >
              {busy && <Spinner />}
              {busy ? props.busyLabel : props.confirmLabel}
            </Button>
            <Button
              variant="outline"
              className={OUTLINE_PILL}
              isDisabled={busy}
              autoFocus
              onPress={() => setPending(null)}
            >
              {texts.common.cancel}
            </Button>
          </div>
        </div>
      )}

      {failure && (
        <p role="alert" className={FIELD_ERROR}>
          {texts.wallet.errors[failure]}
        </p>
      )}
      <p role="status" className="text-body-sm font-medium empty:hidden">
        {done}
      </p>
    </section>
  );
}

const goldOf = (amount: number) => texts.wallet.amount(amount, "gold");

/** Gold to another account, up to the daily limit. There is no sending of silver. */
export function SendGold({ wallet, actions }: { wallet: WalletResponse; actions: WalletActions }) {
  const copy = texts.wallet.send;
  return (
    <GiftForm
      testId="send-gold"
      title={copy.title}
      intro={copy.intro}
      note={
        <p className={FIELD_HINT} data-testid="gold-sent-today">
          {copy.sentToday(formatAmount(wallet.goldSentToday), formatAmount(wallet.goldGiftDailyLimit))}
        </p>
      }
      handleLabel={copy.handleLabel}
      amountLabel={copy.amountLabel}
      submitLabel={copy.submit}
      confirmLabel={copy.confirm}
      busyLabel={copy.sending}
      confirmText={({ handle, amount }) => copy.confirmText(goldOf(amount), handle)}
      doneText={({ handle, amount }) => copy.done(goldOf(amount), handle)}
      send={({ handle, amount }) => actions.sendGold({ to: handle, amount })}
    />
  );
}

/** Days of Plus to another account, paid in gold. */
export function GiftPlus({ actions }: { actions: WalletActions }) {
  const copy = texts.wallet.giftPlus;
  return (
    <GiftForm
      testId="gift-plus"
      title={copy.title}
      intro={copy.intro}
      handleLabel={copy.handleLabel}
      submitLabel={copy.submit}
      confirmLabel={copy.confirm}
      busyLabel={copy.sending}
      confirmText={({ handle }) => copy.confirmText(handle)}
      doneText={({ handle }) => copy.done(handle)}
      send={({ handle }) => actions.giftPlus({ to: handle })}
    />
  );
}
