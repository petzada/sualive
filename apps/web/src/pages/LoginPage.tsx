import { Navigate, useSearchParams } from "react-router";
import { useAccountClient } from "../components/account/AccountClient";
import { PageLoading, PageShell } from "../components/account/PageShell";
import { onboardingPath, PATHS, RETURN_TO_PARAM, safeReturnTo } from "../components/account/paths";
import { OUTLINE_PILL, PRIMARY_LINK } from "../components/account/styles";
import { texts } from "../texts";

/** `?erro=login`: the server could not finish the login and sent the person back here. */
const ERROR_PARAM = "erro";
const LOGIN_ERROR = "login";

/** Login with Google or Discord. No password and no sign-up by e-mail: only the providers' buttons. */
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
    <PageShell width="narrow">
      {state.status === "loading" ? (
        <PageLoading />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-gap text-center">
          <h1 className="font-display text-heading font-semibold">{texts.login.title}</h1>
          <p className="max-w-sm">{texts.login.intro}</p>

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
          ) : state.providers.length === 0 ? (
            <p role="status" className="max-w-sm text-body-sm font-medium text-notice">
              {texts.login.noProviders}
            </p>
          ) : (
            <ul className="flex w-full max-w-xs flex-col gap-3">
              {state.providers.map((provider) => (
                <li key={provider}>
                  {/* Plain link: the login is a full-page trip to the provider and back. */}
                  <a
                    href={actions.loginUrl(provider, returnTo ?? undefined)}
                    className={`w-full ${PRIMARY_LINK}`}
                  >
                    {texts.login.providers[provider]}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <p className="max-w-sm text-body-sm text-muted">{texts.login.guestHint}</p>
        </div>
      )}
    </PageShell>
  );
}
