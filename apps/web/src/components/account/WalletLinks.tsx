import { Link } from "react-router";
import { texts } from "../../texts";
import { PATHS } from "./paths";
import { TEXT_LINK } from "./styles";

const LINK = `inline-flex min-h-11 items-center ${TEXT_LINK}`;

/**
 * The ways into the wallet and the shop, as plain text links. Only for who is logged: the caller
 * renders it beside the other shortcuts of the account. A labelled group, not a navigation landmark:
 * the pages of the account have no navigation of the site, and these two links sit in their content.
 */
export function WalletLinks({ className = "" }: { className?: string }) {
  return (
    <div
      role="group"
      aria-label={texts.nav.walletLabel}
      data-testid="wallet-links"
      className={`flex flex-wrap items-center gap-x-5 text-body-sm ${className}`}
    >
      <Link to={PATHS.wallet} className={LINK}>
        {texts.nav.wallet}
      </Link>
      <Link to={PATHS.shop} className={LINK}>
        {texts.nav.shop}
      </Link>
    </div>
  );
}
