import { ErrorBoundary } from "@sentry/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { PATHS } from "./components/account/paths";
import { DebugError } from "./components/DebugError";
import { MANIFESTO_PATH } from "./components/ManifestoCard";
import { TermsBanner } from "./components/TermsBanner";
import { ErrorPage } from "./pages/ErrorPage";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { LoginPage } from "./pages/LoginPage";
import { ManifestoPage } from "./pages/ManifestoPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PlanPage } from "./pages/PlanPage";
import { PlusPage } from "./pages/PlusPage";
import { ProfilePage } from "./pages/ProfilePage";
import { FixedRoomPage, RoomPage } from "./pages/RoomPage";
import { WelcomePage } from "./pages/WelcomePage";

/**
 * Demo of the screens with fake room and account clients. Development only: in a production build
 * `import.meta.env.DEV` is `false` and the whole `demo` folder is left out of the bundle.
 */
const DemoPage = import.meta.env.DEV ? lazy(() => import("./demo/DemoPage")) : null;

/**
 * Development only, and only after a demo session was chosen on `/demo` (it leaves this key in the
 * tab): the whole app then runs on the fake clients, so the account screens can be walked through.
 */
const DemoShell =
  import.meta.env.DEV && sessionStorage.getItem("sualive:demo") !== null
    ? lazy(() => import("./demo/DemoShell"))
    : null;

/** Must be rendered inside a router. Render errors are reported to Sentry by the boundary. */
export function App() {
  const routes = <AppRoutes />;
  return (
    <ErrorBoundary fallback={<ErrorPage kind="crash" />}>
      <DebugError />
      {DemoShell ? (
        <Suspense fallback={null}>
          <DemoShell>{routes}</DemoShell>
        </Suspense>
      ) : (
        routes
      )}
    </ErrorBoundary>
  );
}

function AppRoutes() {
  return (
    <>
      <TermsBanner />
      <Routes>
        <Route path={PATHS.home} element={<HomePage />} />
        <Route path={MANIFESTO_PATH} element={<ManifestoPage />} />
        <Route path={`${ROOM_PATH_PREFIX}:code`} element={<RoomPage />} />
        <Route path={PATHS.login} element={<LoginPage />} />
        <Route path={PATHS.onboarding} element={<OnboardingPage />} />
        <Route path={PATHS.profile} element={<ProfilePage />} />
        <Route path={PATHS.plus} element={<PlusPage />} />
        <Route path={PATHS.welcome} element={<WelcomePage />} />
        <Route path={PATHS.plan} element={<PlanPage />} />
        <Route path={PATHS.terms} element={<LegalPage kind="terms" />} />
        <Route path={PATHS.privacy} element={<LegalPage kind="privacy" />} />
        {DemoPage && (
          <Route
            path="/demo"
            element={
              <Suspense fallback={null}>
                <DemoPage />
              </Suspense>
            }
          />
        )}
        {/*
          Fixed-link room, `/@nome`. The router has no partial segment (`/@:handle`), so the whole
          segment is taken and checked by the page. Every fixed path above ranks higher than this.
        */}
        <Route path="/:slug" element={<FixedRoomPage />} />
        <Route path="*" element={<ErrorPage kind="notFound" />} />
      </Routes>
    </>
  );
}
