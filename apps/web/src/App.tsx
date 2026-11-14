import { ErrorBoundary } from "@sentry/react";
import { Route, Routes } from "react-router";
import { DebugError } from "./components/DebugError";
import { ErrorPage } from "./pages/ErrorPage";
import { HomePage } from "./pages/HomePage";

/** Must be rendered inside a router. Render errors are reported to Sentry by the boundary. */
export function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage kind="crash" />}>
      <DebugError />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<ErrorPage kind="notFound" />} />
      </Routes>
    </ErrorBoundary>
  );
}
