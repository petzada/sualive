import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { PageLoading, SiteFooter } from "../components/account/PageShell";
import { onboardingPath, PATHS, RETURN_TO_PARAM, safeReturnTo } from "../components/account/paths";
import { OUTLINE_PILL } from "../components/account/styles";
import { FaceCards } from "../components/FaceCards";
import { DiscordIcon, GoogleIcon } from "../components/icons";
import { SplitPage } from "../components/SplitPage";
import type { AccountState } from "../lib/account";
import { texts } from "../texts";

/** `?erro=login`: the server could not finish the login and sent the person back here. */
const ERROR_PARAM = "erro";
const LOGIN_ERROR = "login";

type Provider = AccountState["providers"][number];

/**
 * The two buttons, always in this order and with the same width. Each one follows the guidelines
 * of its provider: white with a light outline and the colored "G"; the Discord color with the
 * white mark.
 */
const PROVIDER_BUTTONS: { provider: Provider; icon: ReactNode; look: string }[] = [
  { provider: "google", icon: <GoogleIcon />, look: "border border-hairline bg-canvas text-ink" },
  { provider: "discord", icon: <DiscordIcon />, look: "bg-brand-discord text-on-brand-discord" },
];

const PROVIDER_BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-button px-6 text-body font-medium";

/**
 * Login with Google or Discord, in the two columns of the home page. No password and no sign-up by
 * e-mail: only the providers' buttons. Nothing at the top: no name and no account.
 */
export function LoginPage() {
  const { state, actions } = useAccountClient().useAccount();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM));
  const failed = params.get(ERROR_PARAM) === LOGIN_ERROR;

  if (state.user) {
    const target = state.user.onboarded ? (returnTo ?? PATHS.profile) : onboardingPath(returnTo);
    return <Navigate to={target} replace />;
  }

  return (
    <SplitPage aside={<FaceCards />} footer={false}>
      {state.status === "loading" ? (
        <PageLoading />
      ) : (
        <>
          <h1 className="font-display text-heading font-semibold">{texts.login.title}</h1>
          <p className="max-w-xl">{texts.login.intro}</p>

          {failed && (
            <p role="alert" className="text-body-sm font-medium text-notice">
              {texts.login.failed}
            </p>
          )}

          {state.status === "error" ? (
            <>
              <p role="alert" className="text-body-sm font-medium text-notice">
                {texts.account.loadFailed}
              </p>
              <button
                type="button"
                onClick={() => void actions.refresh()}
                className={`cursor-pointer shadow-outline ${OUTLINE_PILL}`}
              >
                {texts.common.tryAgain}
              </button>
            </>
          ) : (
            <ul className="mt-2 flex w-full max-w-xs flex-col gap-3">
              {PROVIDER_BUTTONS.map(({ provider, icon, look }) => (
                <li key={provider}>
                  {state.providers.includes(provider) ? (
                    // Plain link: the login is a full-page trip to the provider and back.
                    <a
                      href={actions.loginUrl(provider, returnTo ?? undefined)}
                      className={`${PROVIDER_BUTTON} ${look}`}
                    >
                      {icon}
                      {texts.login.providers[provider]}
                    </a>
                  ) : (
                    // Not configured yet: the button is there, switched off, and leads nowhere.
                    <span
                      role="link"
                      aria-disabled="true"
                      className={`cursor-not-allowed opacity-50 ${PROVIDER_BUTTON} ${look}`}
                    >
                      {icon}
                      {texts.login.providers[provider]}
                      <span className="text-compact font-normal">{texts.login.soon}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <SiteFooter />
        </>
      )}
    </SplitPage>
  );
}
