import { CURRENCIES } from "@sualive/config";
import type { WalletResponse } from "../../lib/wallet";
import { texts } from "../../texts";
import { CARD } from "../account/styles";
import { formatAmount } from "../format";
import { CoinIcon } from "../icons";

interface BalancesProps {
  wallet: WalletResponse;
  /** One line, without what each currency is (the top of the shop). */
  compact?: boolean;
}

/**
 * The two balances, exactly as the server gave them. The currencies are text and a glyph in the
 * colors of the text: gold is the filled coin, silver the outlined one.
 */
export function Balances({ wallet, compact = false }: BalancesProps) {
  if (compact) {
    return (
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1" data-testid="balances">
        {CURRENCIES.map((currency) => (
          <div key={currency} className="flex items-center gap-2" data-testid={`balance-${currency}`}>
            <dt className="flex items-center gap-1.5 text-body-sm text-muted">
              <CoinIcon filled={currency === "gold"} />
              {texts.wallet.balances.names[currency]}
            </dt>
            <dd className="font-semibold">{formatAmount(wallet[currency])}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2" data-testid="balances">
      {CURRENCIES.map((currency) => (
        <div key={currency} className={`flex flex-col gap-2 ${CARD}`} data-testid={`balance-${currency}`}>
          <dt className="flex items-center gap-2 text-body-sm text-muted">
            <CoinIcon filled={currency === "gold"} />
            {texts.wallet.balances.names[currency]}
          </dt>
          <dd className="font-display text-heading font-semibold">{formatAmount(wallet[currency])}</dd>
          <dd className="text-body-sm text-muted">{texts.wallet.balances.about[currency]}</dd>
        </div>
      ))}
    </dl>
  );
}
