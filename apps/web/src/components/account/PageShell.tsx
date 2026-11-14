import type { MeUser } from "@sualive/protocol";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import type { AccountActions, AccountState } from "../../lib/account";
import { texts } from "../../texts";
import { BackIcon, Spinner } from "../icons";
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

/**
 * `true` when this tab has an earlier page of the app to go back to. The router numbers the entries
 * it creates in the history of the tab (`idx` in `history.state`): the first page loaded in a tab
 * (new tab, typed address, outside link, return from a full-page redirect such as the login) is 0,
 * and every navigation inside the app adds one. Going back and forward moves along the same numbers.
 */
export function useHasPreviousPage(): boolean {
  // Read again on every navigation; the router has already written the entry when this renders.
  useLocation();
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !("idx" in state)) return false;
  return typeof state.idx === "number" && state.idx > 0;
}

/**
 * The browser's "back", inside the app: only the arrow, no outline, right above the title. Absent when
 * there is no earlier page of the app in this tab (see `useHasPreviousPage`).
 */
export function BackButton() {
  const navigate = useNavigate();
  if (!useHasPreviousPage()) return null;

  return (
    <button
      type="button"
      aria-label={texts.common.back}
      onClick={() => void navigate(-1)}
      className="-ml-3 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-button text-ink hover:bg-mist"
    >
      <BackIcon />
    </button>
  );
}

/** Minimal footer: the two legal pages and, with `home`, a way to the home page before them. */
export function SiteFooter({ home = false }: { home?: boolean }) {
  const link =
    "inline-flex min-h-11 items-center rounded-link px-2 underline-offset-2 hover:text-ink hover:underline";
  return (
    <footer
      aria-label={texts.nav.footerLabel}
      className="flex shrink-0 justify-center gap-3 px-5 pb-4 text-compact text-muted"
    >
      {home && (
        <Link to={PATHS.home} className={link}>
          {texts.nav.homeShort}
        </Link>
      )}
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
  /**
   * What goes above the content. `site`: name of the product at the left and the account at the
   * right. `back`: no name and no account, only the back arrow right above the title of the page
   * (when there is a page to go back to); the way home is then in the footer.
   */
  top?: "site" | "back";
  children: ReactNode;
}

/** Frame of the pages outside the room: the top row (see `top`), the content and the legal footer. */
export function PageShell({ width = "regular", top = "site", children }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      {top === "site" && (
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
      )}
      <main
        className={`mx-auto flex w-full flex-1 flex-col gap-10 px-5 pb-16 ${top === "back" ? "pt-6" : "pt-8"} ${WIDTHS[width]}`}
      >
        {top === "back" && (
          // In the column of the content, so the arrow lines up with the title right under it (the
          // negative margin takes back most of the gap). Always as tall as the button, so the
          // titles do not move when it comes or goes.
          <div className="-mb-8 flex min-h-11 shrink-0 items-center" data-testid="page-top">
            <BackButton />
          </div>
        )}
        {children}
      </main>
      <SiteFooter home={top === "back"} />
    </div>
  );
}

/**
 * Frame of the first access: no name and no account at the top, the content centered in the window
 * (both ways) and the legal links at the foot of the page.
 */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
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
