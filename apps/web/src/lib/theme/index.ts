import { useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";

/** Convenience only: the theme last chosen inside a room in this browser. */
export const THEME_STORAGE_KEY = "sualive:theme";

/** Same attribute HeroUI reads; `tokens.css` redefines the tokens under it. */
const THEME_ATTRIBUTE = "data-theme";

/** Light unless the person chose dark before. The system preference is not followed. */
export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // storage blocked: the room just starts light
  }
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage blocked: nothing to remember
  }
}

/** On `<html>`, so that portals (tooltips, popovers) follow too. Light is the absence of it. */
function applyTheme(theme: Theme) {
  if (theme === "dark") document.documentElement.setAttribute(THEME_ATTRIBUTE, "dark");
  else document.documentElement.removeAttribute(THEME_ATTRIBUTE);
}

/**
 * The theme of the room. It only exists while the component that calls this is mounted: every
 * other screen stays light, and leaving the room goes back to light.
 */
export function useRoomTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState(readStoredTheme);

  // Layout effect: applied before the first paint of the room, so it never flashes light.
  useLayoutEffect(() => {
    applyTheme(theme);
    return () => applyTheme("light");
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    storeTheme(next);
    setTheme(next);
  };

  return { theme, toggleTheme };
}
