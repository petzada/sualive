import { Button } from "@heroui/react";
import { ROOM_THEMES } from "@sualive/config";
import type { RoomTheme } from "@sualive/config";
import { useLayoutEffect, useRef, useState } from "react";
import { texts } from "../../texts";
import { Hint } from "../Hint";
import { CheckIcon, PaletteIcon } from "../icons";

/** Read by `styles/room-themes.css`, which redefines some tokens under it. */
export const ROOM_THEME_ATTRIBUTE = "data-room-theme";

/** The theme every room starts with: the regular look, with no attribute at all. */
const DEFAULT_ROOM_THEME: RoomTheme = ROOM_THEMES[0];

/**
 * Applies the theme of the room while the room is on screen. On `<html>`, like light and dark, so
 * that the HeroUI variables and what is drawn outside the room tree (hints) follow it too.
 */
export function useAppliedRoomTheme(theme: RoomTheme) {
  useLayoutEffect(() => {
    if (theme === DEFAULT_ROOM_THEME) return;
    const root = document.documentElement;
    root.setAttribute(ROOM_THEME_ATTRIBUTE, theme);
    return () => root.removeAttribute(ROOM_THEME_ATTRIBUTE);
  }, [theme]);
}

interface RoomThemePickerProps {
  theme: RoomTheme;
  onChange: (theme: RoomTheme) => void;
}

/**
 * The owner of a fixed-link room chooses one of the ready-made themes; it changes for everyone.
 * The list stays open while the owner tries them, and closes with Escape or when the focus leaves.
 */
export function RoomThemePicker({ theme, onChange }: RoomThemePickerProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        setOpen(false);
        buttonRef.current?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Hint text={texts.room.roomTheme.open} placement="bottom">
        <Button
          ref={buttonRef}
          isIconOnly
          aria-label={texts.room.roomTheme.open}
          aria-expanded={open}
          className="size-11 shrink-0 rounded-button bg-canvas text-ink shadow-outline-soft"
          onPress={() => setOpen((current) => !current)}
        >
          <PaletteIcon />
        </Button>
      </Hint>
      {open && (
        <div
          role="group"
          aria-label={texts.room.roomTheme.label}
          className="absolute top-full right-0 z-40 mt-2 flex w-52 flex-col gap-0.5 rounded-nav bg-canvas p-1.5 shadow-outline"
        >
          {ROOM_THEMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={name === theme}
              onClick={() => onChange(name)}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-link px-3 text-left text-body-sm text-ink -outline-offset-2 hover:bg-mist"
            >
              {/* A sample of the theme: its own background and accent, read from the same tokens. */}
              <span
                aria-hidden="true"
                {...{ [ROOM_THEME_ATTRIBUTE]: name }}
                className="size-5 shrink-0 rounded-button border-4 border-accent bg-mist"
              />
              <span className="flex-1">{texts.room.roomTheme.names[name]}</span>
              {name === theme && <CheckIcon />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
