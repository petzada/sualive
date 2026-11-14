import { FIXED_ROOM_PATH_PREFIX } from "@sualive/config";

/** Fixed pages. They take precedence over the fixed-link room (`/@nome`) in the router. */
export const PATHS = {
  home: "/",
  login: "/entrar",
  onboarding: "/boas-vindas",
  profile: "/perfil",
  plus: "/plus",
  terms: "/termos",
  privacy: "/privacidade",
} as const;

export const RETURN_TO_PARAM = "returnTo";

/** Only a local path is accepted as a destination: starts with one "/" and has no backslash. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const safe = safeReturnTo(returnTo);
  return safe ? `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}` : path;
}

export const loginPath = (returnTo?: string | null) => withReturnTo(PATHS.login, returnTo);
export const onboardingPath = (returnTo?: string | null) => withReturnTo(PATHS.onboarding, returnTo);

/** Path of the fixed-link room of a handle: `/@nome`. */
export const fixedRoomPath = (handle: string) => FIXED_ROOM_PATH_PREFIX + handle;
