import { Button } from "@heroui/react";
import { GOLD_GIFT_DAILY_LIMIT } from "@sualive/config";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import type { GiftEvent, ParticipantView, RoomActions, SendGoldResult } from "../../lib/room";
import { texts } from "../../texts";
import { CoinIcon } from "../icons";
import { useWalletClient } from "../wallet/WalletClient";

const goldFormat = new Intl.NumberFormat("pt-BR");

/** 1000 → "1.000". */
export function formatGold(amount: number): string {
  return goldFormat.format(amount);
}

const PILL = "min-h-11 rounded-button px-4 text-body-sm";

interface SendGoldFormProps {
  participant: ParticipantView;
  onSendGold: RoomActions["sendGold"];
  onCancel: () => void;
  /** The server confirmed the gift. */
  onSent: (amount: number) => void;
}

/**
 * Sends gold to someone in the room: the amount, then a confirmation. The balance and what is left
 * of the daily limit come from the wallet, loaded when this opens; they only inform. The server
 * decides whether the gift goes through, and each refusal has its own text.
 */
export function SendGoldForm({ participant, onSendGold, onCancel, onSent }: SendGoldFormProps) {
  const { state: walletState, actions: walletActions } = useWalletClient().useWallet();
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState<"amount" | "confirm">("amount");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const infoId = useId();
  const errorId = useId();

  const { load, refresh } = walletActions;
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const wallet = walletState.wallet;
  const limit = wallet?.goldGiftDailyLimit ?? GOLD_GIFT_DAILY_LIMIT;
  const amount = Number(draft);
  const label = texts.gifts.send(participant.nickname);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Only the range the room accepts at all; balance and what was sent today are up to the server.
    if (!Number.isInteger(amount) || amount < 1 || amount > limit) {
      setError(texts.gifts.invalidAmount(formatGold(limit)));
      return;
    }
    setError(null);
    setStep("confirm");
  };

  const send = async () => {
    setSending(true);
    let result: SendGoldResult;
    try {
      result = await onSendGold(participant.id, amount);
    } catch {
      result = { ok: false, reason: "error" };
    }
    if (result.ok) {
      refresh().catch(() => {});
      onSent(amount);
      return;
    }
    // Without an answer the gold may have left: the balance on screen is refreshed too.
    if (result.reason === "lost") refresh().catch(() => {});
    setSending(false);
    setStep("amount");
    setError(texts.gifts.errors[result.reason]);
  };

  if (step === "confirm") {
    return (
      <div role="group" aria-label={label} className="flex flex-col gap-2 pb-2 pl-12">
        <p className="text-body-sm">
          {texts.gifts.confirmQuestion(formatGold(amount), participant.nickname)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className={`${PILL} bg-ink text-canvas`} isDisabled={sending} onPress={() => void send()}>
            {sending ? texts.gifts.sending : texts.gifts.confirm}
          </Button>
          <Button
            variant="outline"
            className={`${PILL} border-outline`}
            autoFocus
            isDisabled={sending}
            onPress={() => setStep("amount")}
          >
            {texts.common.back}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form aria-label={label} noValidate onSubmit={handleSubmit} className="flex flex-col gap-2 pb-2 pl-12">
      <label htmlFor={inputId} className="text-body-sm font-medium">
        {texts.gifts.amountLabel}
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${infoId} ${errorId}` : infoId}
        onChange={(event) => {
          setDraft(event.target.value.replace(/\D/g, "").slice(0, String(limit).length));
          setError(null);
        }}
        className="min-h-11 w-full max-w-40 rounded-nav bg-canvas px-4 text-body shadow-outline outline-offset-2"
      />
      <p id={infoId} className="flex flex-col text-compact text-muted">
        {wallet ? (
          <>
            <span>{texts.gifts.balance(formatGold(wallet.gold))}</span>
            <span>{texts.gifts.remainingToday(formatGold(Math.max(0, limit - wallet.goldSentToday)))}</span>
          </>
        ) : walletState.status === "error" ? (
          texts.gifts.walletError
        ) : (
          texts.gifts.walletLoading
        )}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-notice">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className={`${PILL} bg-ink text-canvas`}>
          {texts.gifts.next}
        </Button>
        <Button variant="outline" className={`${PILL} border-outline`} onPress={onCancel}>
          {texts.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * Gold sent in the room, told to everyone. Sits in the flow of the side panel, so it never covers
 * the stage or the controls; each line leaves when the room drops it from `gifts`. The live region
 * is always mounted so screen readers announce each new line.
 */
export function GiftNotices({ gifts }: { gifts: GiftEvent[] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="gift-notices"
      className={
        gifts.length === 0 ? "sr-only" : "flex max-h-28 shrink-0 flex-col gap-1 overflow-y-auto p-px"
      }
    >
      {gifts.map((gift) => (
        <p
          key={gift.id}
          className="flex items-center gap-2 rounded-nav bg-canvas px-3 py-1.5 text-body-sm shadow-outline-soft"
        >
          <span className="inline-flex shrink-0 text-muted">
            <CoinIcon />
          </span>
          <span className="min-w-0 wrap-anywhere">
            {texts.gifts.notice(gift.fromNickname, formatGold(gift.amount), gift.toNickname)}
          </span>
        </p>
      ))}
    </div>
  );
}
