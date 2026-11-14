import { useId } from "react";
import { Link } from "react-router";
import { PageShell, useAccountGate } from "../components/account/PageShell";
import { PATHS } from "../components/account/paths";
import { TEXT_LINK } from "../components/account/styles";
import { Balances } from "../components/wallet/Balances";
import { GiftPlus, SendGold } from "../components/wallet/GiftForms";
import { GoldCheckout } from "../components/wallet/GoldCheckout";
import { Ledger } from "../components/wallet/Ledger";
import { useLoadOnMount, WalletLoadError, WalletLoading } from "../components/wallet/shared";
import { useWalletClient } from "../components/wallet/WalletClient";
import { texts } from "../texts";

function WalletContent({ billingEnabled }: { billingEnabled: boolean }) {
  const { state, actions } = useWalletClient().useWallet();
  const balancesId = useId();

  useLoadOnMount(() => {
    void actions.load();
    void actions.loadLedger();
  });

  const { wallet } = state;

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-heading font-semibold">{texts.wallet.title}</h1>
      </header>

      {!wallet &&
        (state.status === "error" ? (
          <WalletLoadError message={texts.wallet.loadFailed} onRetry={() => void actions.load()} />
        ) : (
          <WalletLoading />
        ))}

      {wallet && (
        <>
          <section aria-labelledby={balancesId} className="flex flex-col gap-4">
            <h2 id={balancesId} className="sr-only">
              {texts.wallet.balances.title}
            </h2>
            <Balances wallet={wallet} />
            <Link to={PATHS.shop} className={`inline-flex min-h-11 items-center self-start ${TEXT_LINK}`}>
              {texts.wallet.balances.shopLink}
            </Link>
          </section>

          <GoldCheckout packs={state.goldPacks} actions={actions} available={billingEnabled} />
          <SendGold wallet={wallet} actions={actions} />
          <GiftPlus actions={actions} />
          <Ledger ledger={state.ledger} actions={actions} />
        </>
      )}

      {/* Always there, whatever loaded: the currencies never become money. */}
      <p className="text-center text-body-sm text-muted" data-testid="wallet-notice">
        {texts.wallet.notice}
      </p>
    </>
  );
}

/**
 * The wallet of the own account: the two balances, the statement, buying gold by Pix, sending gold
 * and giving Plus. Everything shown comes from the server; the page never adds to a balance itself.
 */
export function WalletPage() {
  const { user, fallback, state } = useAccountGate();

  return (
    <PageShell top="back">
      {user ? <WalletContent billingEnabled={state.billingEnabled} /> : fallback}
    </PageShell>
  );
}
