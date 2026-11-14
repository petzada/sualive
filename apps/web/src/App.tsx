import { ErrorBoundary } from "@sentry/react";
import { ROOM_PATH_PREFIX } from "@sualive/config";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { DebugError } from "./components/DebugError";
import { MANIFESTO_PATH } from "./components/ManifestoCard";
import { ErrorPage } from "./pages/ErrorPage";
import { HomePage } from "./pages/HomePage";
import { ManifestoPage } from "./pages/ManifestoPage";
import { RoomPage } from "./pages/RoomPage";

/**
 * Demo of the room screens with a fake room client. Development only: in a production build
 * `import.meta.env.DEV` is `false` and the whole `demo` folder is left out of the bundle.
 */
const DemoPage = import.meta.env.DEV ? lazy(() => import("./demo/DemoPage")) : null;

/** Must be rendered inside a router. Render errors are reported to Sentry by the boundary. */
export function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage kind="crash" />}>
      <DebugError />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path={MANIFESTO_PATH} element={<ManifestoPage />} />
        <Route path={`${ROOM_PATH_PREFIX}:code`} element={<RoomPage />} />
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
        <Route path="*" element={<ErrorPage kind="notFound" />} />
      </Routes>
    </ErrorBoundary>
  );
}
