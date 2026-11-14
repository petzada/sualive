import { Link } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { PATHS } from "../components/account/paths";
import { TEXT_LINK } from "../components/account/styles";
import { WalletLinks } from "../components/account/WalletLinks";
import { CreateRoom } from "../components/CreateRoom";
import { ManifestoCard } from "../components/ManifestoCard";
import { Avatar } from "../components/room/media";
import { SplitPage } from "../components/SplitPage";
import { texts } from "../texts";

/**
 * The way into the account for a visitor: "Já tem conta? Entrar", a plain line of text close under
 * the create button, never a button. Nothing for who is logged (see `HomeAccount`).
 */
function HomeLogin() {
  const { state } = useAccountClient().useAccount();
  if (state.status === "loading" || state.user) return null;

  return (
    <p className="flex min-h-11 items-center gap-1.5 text-body-sm text-muted" data-testid="home-account">
      {texts.home.account.question}
      <Link to={PATHS.login} className={`inline-flex min-h-11 items-center ${TEXT_LINK}`}>
        {texts.home.account.login}
      </Link>
    </p>
  );
}

/**
 * Who is logged: a block of its own after the create button (as far from it as the other blocks of
 * the column are from each other): the picture and the nickname, leading to the profile, and under
 * them the ways to the wallet and the shop.
 */
function HomeAccount() {
  const { state } = useAccountClient().useAccount();
  if (state.status === "loading" || !state.user) return null;
  const { user } = state;

  return (
    <div className="flex flex-col items-center text-body-sm text-muted" data-testid="home-account">
      <Link
        to={PATHS.profile}
        aria-label={texts.nav.profile(user.nickname)}
        className={`inline-flex min-h-11 max-w-56 items-center gap-2 ${TEXT_LINK}`}
      >
        <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="xs" />
        <span className="truncate">{user.nickname}</span>
      </Link>
      <WalletLinks className="justify-center" />
    </div>
  );
}

export function HomePage() {
  return (
    <SplitPage aside={<ManifestoCard />}>
      <h1 className="font-display text-heading font-semibold sm:text-display-sm lg:text-display">
        {texts.home.title}
      </h1>
      <p className="max-w-xl">
        {texts.home.tagline.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
      <p className="text-body-sm text-muted">{texts.home.hint}</p>

      <CreateRoom className="mt-2" afterButton={<HomeLogin />} below={<HomeAccount />} withProtected />
    </SplitPage>
  );
}
