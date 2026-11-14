/** Read at call time so tests can stub the environment. */
export function isProduction(): boolean {
  return import.meta.env.VITE_ENVIRONMENT === "production";
}
