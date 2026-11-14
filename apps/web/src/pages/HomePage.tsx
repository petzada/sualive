import { Link } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { PATHS } from "../components/account/paths";
import { TEXT_LINK } from "../components/account/styles";
import { CreateRoom } from "../components/CreateRoom";
import { ManifestoCard } from "../components/ManifestoCard";
import { Avatar } from "../components/room/media";
import { SplitPage } from "../components/SplitPage";
import { texts } from "../texts";

/**
 * The way into the account: a plain line of text close under the create button, never a button.
 * A visitor gets "Já tem conta? Entrar"; who is logged gets the nickname, leading to the profile.
 */
function HomeAccount() {
  const { state } = useAccountClient().useAccount();
  if (state.status === "loading") return null;
  const { user } = state;

  return (
    <p className="flex min-h-11 items-center gap-1.5 text-body-sm text-muted" data-testid="home-account">
      {user ? (
        <Link
          to={PATHS.profile}
          aria-label={texts.nav.profile(user.nickname)}
          className={`inline-flex min-h-11 max-w-56 items-center gap-2 ${TEXT_LINK}`}
        >
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="xs" />
          <span className="truncate">{user.nickname}</span>
        </Link>
      ) : (
        <>
          {texts.home.account.question}
          <Link to={PATHS.login} className={`inline-flex min-h-11 items-center ${TEXT_LINK}`}>
            {texts.home.account.login}
          </Link>
        </>
      )}
    </p>
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

      <CreateRoom className="mt-2" afterButton={<HomeAccount />} />
    </SplitPage>
  );
}
