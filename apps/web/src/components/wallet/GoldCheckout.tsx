import { Button } from "@heroui/react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  GoldCheckoutResponse,
  GoldPack,
  PaymentStatus,
  WalletActions,
  WalletErrorReason,
} from "../../lib/wallet";
import { texts } from "../../texts";
import { CopyButton } from "../account/plan";
import { CARD, FIELD, FIELD_ERROR, FIELD_HINT, OUTLINE_PILL, PRIMARY_PILL } from "../account/styles";
import { CPF_LENGTH, cpfDigits, formatCents, formatDateTime, isValidCpf, maskCpf } from "../format";
import { CoinIcon, Spinner } from "../icons";
import { attempt } from "./shared";

type Step =
  | { kind: "choose" }
  | { kind: "taxId"; pack: GoldPack }
  | { kind: "pay"; pack: GoldPack; taxId: string; checkout: GoldCheckoutResponse };

const goldOf = (amount: number) => texts.wallet.amount(amount, "gold");

interface TaxIdFormProps {
  pack: GoldPack;
  actions: WalletActions;
  onBack: () => void;
  onCheckout: (taxId: string, checkout: GoldCheckoutResponse) => void;
  /** The sale of gold is switched off here: nothing to retry. */
  onUnavailable: () => void;
}

/** The CPF goes only in the request that creates the charge; it is kept nowhere else. */
function TaxIdForm({ pack, actions, onBack, onCheckout, onUnavailable }: TaxIdFormProps) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<WalletErrorReason | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const result = await attempt(() => actions.startGoldCheckout({ packId: pack.id, taxId }));
    setBusy(false);
    if (result.ok) onCheckout(taxId, result.value);
    else if (result.reason === "billingUnavailable") onUnavailable();
    else setFailure(result.reason);
  };

  return (
    <div className={`flex flex-col gap-4 ${CARD}`} data-testid="gold-tax-id">
      <h3 className="font-display text-title font-semibold">
        {texts.wallet.buy.checkoutTitle(goldOf(pack.gold))}
      </h3>
      <p className="font-display text-heading font-semibold" data-testid="checkout-amount">
        {formatCents(pack.priceCents)}
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
            {texts.wallet.errors[failure]}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" className={PRIMARY_PILL} isDisabled={busy}>
            {busy && <Spinner />}
            {busy ? texts.plus.checkout.submitting : texts.plus.checkout.submit}
          </Button>
          <Button variant="outline" className={OUTLINE_PILL} isDisabled={busy} onPress={onBack}>
            {texts.wallet.buy.back}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface PaymentProps {
  checkout: GoldCheckoutResponse;
  actions: WalletActions;
  /** Asks for a new charge with the same pack and CPF; resolves to the reason when it fails. */
  onRetry: () => Promise<WalletErrorReason | null>;
  onDone: () => void;
}

/**
 * The QR Code on screen, followed until it is paid, expires or fails. The gold only shows up in the
 * balance after the server confirms: this panel never adds anything by itself.
 */
function Payment({ checkout, actions, onRetry, onDone }: PaymentProps) {
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [retrying, setRetrying] = useState(false);
  const [failure, setFailure] = useState<WalletErrorReason | null>(null);
  const watchRef = useRef(actions.watchGoldPayment);
  const codeId = useId();

  useEffect(() => {
    watchRef.current = actions.watchGoldPayment;
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
    <div className={`flex flex-col gap-4 ${CARD}`} data-testid="gold-payment" data-status={status}>
      <h3 className="font-display text-title font-semibold">
        {status === "paid" ? texts.wallet.buy.paidTitle : texts.plus.checkout.qrTitle}
      </h3>

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
            <p className="text-body-sm">{texts.wallet.buy.qrHow}</p>
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
        {status === "paid" && <p>{texts.wallet.buy.paid(goldOf(checkout.gold))}</p>}
        {(status === "expired" || status === "failed") && (
          <p className="font-medium text-notice">{texts.plus.checkout[status]}</p>
        )}
      </div>

      {status === "paid" && (
        <Button variant="primary" className={`self-start ${PRIMARY_PILL}`} onPress={onDone}>
          {texts.wallet.buy.paidAction}
        </Button>
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
          {texts.wallet.errors[failure]}
        </p>
      )}
    </div>
  );
}

interface GoldCheckoutProps {
  packs: readonly GoldPack[];
  actions: WalletActions;
  /** `false`: the sale by Pix is switched off in this environment. */
  available: boolean;
}

/** Buying gold: the packs, the CPF, the Pix and the payment followed until it settles. */
export function GoldCheckout({ packs, actions, available }: GoldCheckoutProps) {
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [refused, setRefused] = useState(false);
  const titleId = useId();
  const unavailable = !available || refused;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4" data-testid="gold-checkout">
      <h2 id={titleId} className="font-display text-kicker font-semibold">
        {texts.wallet.buy.title}
      </h2>

      {step.kind === "choose" && (
        <>
          <p className="text-body-sm text-muted">{texts.wallet.buy.intro}</p>
          {unavailable && (
            <p role="status" className="font-medium text-notice" data-testid="gold-unavailable">
              {texts.wallet.buy.unavailable}
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-3">
            {packs.map((pack) => (
              <li
                key={pack.id}
                data-testid={`gold-pack-${pack.id}`}
                className={`flex flex-col gap-2 ${CARD}`}
              >
                <p className="flex items-center gap-2 font-display text-title font-semibold">
                  <CoinIcon filled />
                  {goldOf(pack.gold)}
                </p>
                <p className="flex-1 text-muted">{formatCents(pack.priceCents)}</p>
                {!unavailable && (
                  <Button
                    variant="primary"
                    className={`self-start ${PRIMARY_PILL}`}
                    aria-label={texts.wallet.buy.chooseLabel(goldOf(pack.gold), formatCents(pack.priceCents))}
                    onPress={() => setStep({ kind: "taxId", pack })}
                  >
                    {texts.wallet.buy.choose}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {step.kind === "taxId" && (
        <TaxIdForm
          pack={step.pack}
          actions={actions}
          onBack={() => setStep({ kind: "choose" })}
          onCheckout={(taxId, checkout) => setStep({ kind: "pay", pack: step.pack, taxId, checkout })}
          onUnavailable={() => {
            setRefused(true);
            setStep({ kind: "choose" });
          }}
        />
      )}

      {step.kind === "pay" && (
        <Payment
          key={step.checkout.paymentId}
          checkout={step.checkout}
          actions={actions}
          onDone={() => setStep({ kind: "choose" })}
          onRetry={async () => {
            const result = await attempt(() =>
              actions.startGoldCheckout({ packId: step.pack.id, taxId: step.taxId }),
            );
            if (!result.ok) return result.reason;
            setStep({ ...step, checkout: result.value });
            return null;
          }}
        />
      )}
    </section>
  );
}
