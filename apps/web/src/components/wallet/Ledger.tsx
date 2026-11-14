import { Button } from "@heroui/react";
import { useId } from "react";
import type { LedgerEntry, LedgerState, WalletActions } from "../../lib/wallet";
import { texts } from "../../texts";
import { OUTLINE_PILL } from "../account/styles";
import { formatDate, formatSignedAmount } from "../format";
import { Spinner } from "../icons";
import { WalletLoadError, WalletLoading } from "./shared";

/** What a movement was, with the other account of a gift or the item of a purchase. */
function describe(entry: LedgerEntry): string {
  const { reasons } = texts.wallet.ledger;
  const who =
    entry.counterpartHandle === null
      ? texts.wallet.ledger.deletedAccount
      : texts.handle.display(entry.counterpartHandle);
  switch (entry.reason) {
    case "welcome":
    case "plus_gold":
    case "gold_purchase":
    case "relay_video":
    case "protected_room":
      return reasons[entry.reason];
    case "shop_purchase":
      return reasons.shop_purchase(entry.itemName);
    case "gift_sent":
    case "gift_received":
    case "plus_gift":
      return reasons[entry.reason](who);
  }
}

interface LedgerProps {
  ledger: LedgerState;
  actions: WalletActions;
}

/** The statement: every movement of the two balances, newest first, a page at a time. */
export function Ledger({ ledger, actions }: LedgerProps) {
  const titleId = useId();
  const waiting = ledger.status === "idle" || ledger.status === "loading";

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4" data-testid="ledger">
      <h2 id={titleId} className="font-display text-kicker font-semibold">
        {texts.wallet.ledger.title}
      </h2>

      {waiting && <WalletLoading text={texts.wallet.ledger.loading} />}
      {ledger.status === "error" && (
        <WalletLoadError message={texts.wallet.ledger.failed} onRetry={() => void actions.loadLedger()} />
      )}
      {ledger.status === "ready" && ledger.entries.length === 0 && (
        <p className="text-body-sm text-muted">{texts.wallet.ledger.empty}</p>
      )}

      {ledger.status === "ready" && ledger.entries.length > 0 && (
        <ul className="flex flex-col">
          {ledger.entries.map((entry) => (
            <li
              key={entry.id}
              data-testid="ledger-entry"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline py-3 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{describe(entry)}</span>
                <time dateTime={new Date(entry.createdAt).toISOString()} className="text-body-sm text-muted">
                  {formatDate(entry.createdAt)}
                </time>
              </span>
              <span className="font-semibold whitespace-nowrap">
                {texts.wallet.ledger.amount(formatSignedAmount(entry.amount), entry.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ledger.status === "ready" && ledger.hasMore && (
        <Button
          variant="outline"
          className={`self-start ${OUTLINE_PILL}`}
          isDisabled={ledger.loadingMore}
          onPress={() => void actions.loadMoreLedger()}
        >
          {ledger.loadingMore && <Spinner />}
          {ledger.loadingMore ? texts.wallet.ledger.loadingMore : texts.wallet.ledger.more}
        </Button>
      )}
    </section>
  );
}
