import { Button } from "@heroui/react";
import { CURRENCIES, SHOP_ITEM_KINDS } from "@sualive/config";
import type { Currency } from "@sualive/config";
import type { MeUser } from "@sualive/protocol";
import { useId, useState } from "react";
import { Link } from "react-router";
import { PageShell, useAccountGate } from "../components/account/PageShell";
import { PATHS } from "../components/account/paths";
import { CARD, FIELD_ERROR, OUTLINE_PILL, PRIMARY_PILL, TEXT_LINK } from "../components/account/styles";
import { CosmeticFrame, CosmeticName } from "../components/cosmetics/Cosmetic";
import { formatAmount } from "../components/format";
import { CheckIcon, Spinner } from "../components/icons";
import { Avatar } from "../components/room/media";
import { Balances } from "../components/wallet/Balances";
import { attempt, useLoadOnMount, WalletLoadError, WalletLoading } from "../components/wallet/shared";
import { useWalletClient } from "../components/wallet/WalletClient";
import type { ShopItem, WalletActions, WalletErrorReason } from "../lib/wallet";
import { texts } from "../texts";

/** How the item looks on the person: their own nickname, their own picture, or the reactions. */
function Preview({ item, user }: { item: ShopItem; user: MeUser }) {
  const { data } = item;
  return (
    <div
      role="img"
      aria-label={texts.shop.previewLabel(item.name)}
      data-testid="item-preview"
      className="flex min-h-20 items-center justify-center rounded-nav bg-canvas px-4 py-3"
    >
      {"reactions" in data ? (
        <span className="flex flex-wrap justify-center gap-2 text-title">
          {data.reactions.map((reaction) => (
            <span key={reaction}>{reaction}</span>
          ))}
        </span>
      ) : item.kind === "avatar_frame" ? (
        <CosmeticFrame paint={data}>
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="lg" />
        </CosmeticFrame>
      ) : (
        <CosmeticName paint={data} className="font-display text-title font-semibold break-all">
          {user.nickname}
        </CosmeticName>
      )}
    </div>
  );
}

interface ItemCardProps {
  item: ShopItem;
  user: MeUser;
  actions: WalletActions;
}

function ItemCard({ item, user, actions }: ItemCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<Currency | "equip" | null>(null);
  const [failure, setFailure] = useState<WalletErrorReason | null>(null);
  const price = formatAmount(item.price);

  const buy = async (currency: Currency) => {
    setBusy(currency);
    setFailure(null);
    const result = await attempt(() => actions.buyItem(item.id, currency));
    setBusy(null);
    // Refused: the choice stays open, so the other currency can be tried.
    if (result.ok) setConfirming(false);
    else setFailure(result.reason);
  };

  const equip = async (equipped: boolean) => {
    setBusy("equip");
    setFailure(null);
    const result = await attempt(() => actions.setEquipped(item.id, equipped));
    setBusy(null);
    if (!result.ok) setFailure(result.reason);
  };

  return (
    <li
      data-testid={`shop-item-${item.id}`}
      data-owned={item.owned || undefined}
      data-equipped={item.equipped || undefined}
      className={`flex flex-col gap-3 ${CARD}`}
    >
      <Preview item={item} user={user} />
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-medium">{item.name}</h3>
        <p className="text-body-sm text-muted">{texts.shop.price(price)}</p>
      </div>

      {item.owned ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className={OUTLINE_PILL}
            aria-label={item.equipped ? texts.shop.unequipLabel(item.name) : texts.shop.equipLabel(item.name)}
            isDisabled={busy !== null}
            onPress={() => void equip(!item.equipped)}
          >
            {busy === "equip" && <Spinner />}
            {item.equipped ? texts.shop.unequip : texts.shop.equip}
          </Button>
          <span
            className="inline-flex items-center gap-1.5 text-body-sm font-medium"
            data-testid="item-state"
          >
            {item.equipped && <CheckIcon />}
            {item.equipped ? texts.shop.equipped : texts.shop.owned}
          </span>
        </div>
      ) : confirming ? (
        <div role="group" aria-label={texts.shop.buyLabel(item.name)} className="flex flex-col gap-3">
          <p className="text-body-sm">{texts.shop.confirmText(item.name, price)}</p>
          <div className="flex flex-wrap gap-3">
            {CURRENCIES.map((currency) => (
              <Button
                key={currency}
                variant="primary"
                className="min-h-11 rounded-button px-5 text-body-sm font-medium"
                isDisabled={busy !== null}
                onPress={() => void buy(currency)}
              >
                {busy === currency && <Spinner />}
                {busy === currency ? texts.shop.buying : texts.shop.payWith[currency]}
              </Button>
            ))}
            <Button
              variant="outline"
              className={OUTLINE_PILL}
              isDisabled={busy !== null}
              onPress={() => {
                setConfirming(false);
                setFailure(null);
              }}
            >
              {texts.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="primary"
          className={`self-start ${PRIMARY_PILL}`}
          aria-label={texts.shop.buyLabel(item.name)}
          onPress={() => {
            setConfirming(true);
            setFailure(null);
          }}
        >
          {texts.shop.buy}
        </Button>
      )}

      {failure && (
        <p role="alert" className={FIELD_ERROR}>
          {texts.wallet.errors[failure]}{" "}
          {failure === "insufficientFunds" && (
            <Link to={PATHS.wallet} className={TEXT_LINK}>
              {texts.shop.insufficientLink}
            </Link>
          )}
        </p>
      )}
    </li>
  );
}

function Group({
  kind,
  items,
  user,
  actions,
}: Omit<ItemCardProps, "item"> & { kind: ShopItem["kind"]; items: ShopItem[] }) {
  const titleId = useId();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4" data-testid={`shop-group-${kind}`}>
      <h2 id={titleId} className="font-display text-kicker font-semibold">
        {texts.shop.groups[kind]}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} user={user} actions={actions} />
        ))}
      </ul>
    </section>
  );
}

function ShopContent({ user }: { user: MeUser }) {
  const { state, actions } = useWalletClient().useWallet();
  const { shop, wallet } = state;

  useLoadOnMount(() => {
    void actions.load();
    void actions.loadShop();
  });

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-heading font-semibold">{texts.shop.title}</h1>
        <p className="max-w-xl">{texts.shop.lead}</p>
        <div
          role="group"
          aria-label={texts.shop.balancesLabel}
          className="flex flex-wrap items-center gap-x-5 gap-y-1"
        >
          {wallet && <Balances wallet={wallet} compact />}
          <Link to={PATHS.wallet} className={`inline-flex min-h-11 items-center text-body-sm ${TEXT_LINK}`}>
            {texts.shop.walletLink}
          </Link>
        </div>
      </header>

      {(shop.status === "idle" || shop.status === "loading") && <WalletLoading />}
      {shop.status === "error" && (
        <WalletLoadError message={texts.shop.loadFailed} onRetry={() => void actions.loadShop()} />
      )}
      {shop.status === "ready" && shop.items.length === 0 && (
        <p className="text-body-sm text-muted">{texts.shop.empty}</p>
      )}
      {shop.status === "ready" &&
        SHOP_ITEM_KINDS.map((kind) => (
          <Group
            key={kind}
            kind={kind}
            items={shop.items.filter((item) => item.kind === kind)}
            user={user}
            actions={actions}
          />
        ))}
    </>
  );
}

/**
 * The shop: the catalog in its four groups, each item previewed on the person, bought with silver
 * or with gold and then equipped. Price, balance and ownership are what the server says.
 */
export function ShopPage() {
  const { user, fallback } = useAccountGate();

  return (
    <PageShell width="wide" top="back">
      {user ? <ShopContent user={user} /> : fallback}
    </PageShell>
  );
}
