import { useSearchParams } from "react-router";
import { isProduction } from "../env";

const DEBUG_PARAM = "debug";
const DEBUG_ERROR_VALUE = "erro";

/**
 * Throws during render when the URL has `?debug=erro`, to validate the error boundary and the
 * Sentry pipeline. Ignored in production.
 */
export function DebugError(): null {
  const [searchParams] = useSearchParams();

  if (!isProduction() && searchParams.get(DEBUG_PARAM) === DEBUG_ERROR_VALUE) {
    throw new Error("Intentional render error triggered by ?debug=erro");
  }
  return null;
}
