import type { MeUser } from "@sualive/protocol";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import type { AccountActions, AccountState } from "../../lib/account";
import { texts } from "../../texts";
import { Spinner } from "../icons";
import { Avatar } from "../room/media";
import { useAccountClient } from "./AccountClient";
import { loginPath, onboardingPath, PATHS } from "./paths";
import { OUTLINE_PILL } from "./styles";

const NAV_LINK =
  "inline-flex min-h-11 items-center gap-2 rounded-button px-3 text-body-sm text-ink hover:bg-mist";

/** Discreet way into the account, for the top right of a page. Links only: no buttons. */
export function AccountAccess() {
  const { state } = useAccountClient().useAccount();
  if (state.status === "loading") return null;
  const { user } = state;

  return (
    <nav aria-label={texts.nav.label} className="flex min-w-0 items-center gap-1">
      {user ? (
        <>
          <Link to={PATHS.plus} className={NAV_LINK}>
            {texts.nav.plus}
          </Link>
          <Link to={PATHS.profile} aria-label={texts.nav.profile(user.nickname)} className={NAV_LINK}>
            <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size="xs" />
            <span className="max-w-32 truncate">{user.nickname}</span>
          </Link>
        </>
      ) : (
        <Link to={PATHS.login} className={NAV_LINK}>
          {texts.nav.login}
        </Link>
      )}
    </nav>
  );
}

/** Minimal footer: the two legal pages. */
export function SiteFooter() {
  const link =
    "inline-flex min-h-11 items-center rounded-link px-2 underline-offset-2 hover:text-ink hover:underline";
  return (
    <footer
      aria-label={texts.nav.footerLabel}
      className="flex shrink-0 justify-center gap-3 px-5 pb-4 text-compact text-muted"
    >
      <Link to={PATHS.terms} className={link}>
        {texts.nav.terms}
      </Link>
      <Link to={PATHS.privacy} className={link}>
        {texts.nav.privacy}
      </Link>
    </footer>
  );
}

const WIDTHS = { narrow: "max-w-md", regular: "max-w-2xl", wide: "max-w-4xl" };

interface PageShellProps {
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}

/** Frame of the pages outside the room: name at the top left, account at the right, legal footer. */
export function PageShell({ width = "regular", children }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 px-5 py-1.5">
        <Link
          to={PATHS.home}
          aria-label={texts.nav.home}
          className="inline-flex min-h-11 items-center rounded-link font-display text-title font-semibold"
        >
          {texts.home.title}
        </Link>
        <AccountAccess />
      </header>
      <main className={`mx-auto flex w-full flex-1 flex-col gap-10 px-5 pt-8 pb-16 ${WIDTHS[width]}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Centered waiting line, for the moments before the account is known. */
export function PageLoading() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-3 text-muted">
      <Spinner />
      <p className="text-body-sm">{texts.common.loading}</p>
    </div>
  );
}

function AccountLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-gap text-center">
      <p role="alert">{texts.account.loadFailed}</p>
      <button type="button" onClick={onRetry} className={`cursor-pointer shadow-outline ${OUTLINE_PILL}`}>
        {texts.common.tryAgain}
      </button>
    </div>
  );
}

interface AccountGate {
  /** The finished account; `null` while `fallback` is set (or for a visitor, when allowed). */
  user: MeUser | null;
  fallback: ReactNode;
  state: AccountState;
  actions: AccountActions;
}

/**
 * For pages that need a finished account: gives the user, or what to render instead (waiting,
 * failure, or the redirect to the login or to the first access, with the way back here).
 * With `anonymous: "allow"`, a visitor without login gets `user: null` and no fallback.
 */
export function useAccountGate(options?: { anonymous: "allow" }): AccountGate {
  const { state, actions } = useAccountClient().useAccount();
  const location = useLocation();
  const here = location.pathname + location.search;
  const base = { state, actions, user: null };

  if (state.status === "loading") return { ...base, fallback: <PageLoading /> };
  if (state.status === "error") {
    return { ...base, fallback: <AccountLoadError onRetry={() => void actions.refresh()} /> };
  }
  if (!state.user) {
    return {
      ...base,
      fallback: options?.anonymous === "allow" ? null : <Navigate to={loginPath(here)} replace />,
    };
  }
  if (!state.user.onboarded) {
    return { ...base, fallback: <Navigate to={onboardingPath(here)} replace /> };
  }
  return { state, actions, user: state.user, fallback: null };
}
