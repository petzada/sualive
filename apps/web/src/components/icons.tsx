import type { ReactNode } from "react";

/** Own minimal line icons (24px grid, stroke follows the text color). Always decorative. */
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const SLASH = <path d="M4 4l16 16" />;

/** "<": back to the previous page. */
export const BackIcon = () => (
  <Icon>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Icon>
);

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Icon>
);

export const MicOffIcon = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    {SLASH}
  </Icon>
);

export const CameraIcon = () => (
  <Icon>
    <rect x="3" y="6.5" width="12.5" height="11" rx="3" />
    <path d="M15.5 10.5l5-3v9l-5-3" />
  </Icon>
);

export const CameraOffIcon = () => (
  <Icon>
    <rect x="3" y="6.5" width="12.5" height="11" rx="3" />
    <path d="M15.5 10.5l5-3v9l-5-3" />
    {SLASH}
  </Icon>
);

export const ScreenIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
    <path d="M8.5 20h7M12 16.5V20" />
  </Icon>
);

export const ScreenOffIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
    <path d="M8.5 20h7M12 16.5V20" />
    {SLASH}
  </Icon>
);

export const HandIcon = () => (
  <Icon>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5v-1a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.7-2.3L4 14.2a1.6 1.6 0 0 1 2.4-2.1L8 13.5" />
  </Icon>
);

export const SmileIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
  </Icon>
);

export const LeaveIcon = () => (
  <Icon>
    <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h9" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
);

export const SendIcon = () => (
  <Icon>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const MoreIcon = () => (
  <Icon>
    <path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="2.6" />
  </Icon>
);

/** A coin: the gold of the wallet (drawn in the text color, like every other icon). */
export const CoinIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
  </Icon>
);

export const ArrowDownIcon = () => (
  <Icon>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const PaletteIcon = () => (
  <Icon>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.6-1.1-1.6-1.1-3 0-1 .8-1.6 1.9-1.6H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" />
    <path d="M7.5 12h.01M9.5 8h.01M14 7h.01" strokeWidth="2.4" />
  </Icon>
);

/** The plan, where its name does not fit (the pill of the room on a phone). */
export const PlanIcon = () => (
  <Icon>
    <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor" />
  </Icon>
);

/**
 * A coin, for the two currencies. Same color as the text around it (never gold or silver): gold is
 * the filled one, silver the outlined one, and the name of the currency always comes with it.
 */
export const CoinIcon = ({ filled = false }: { filled?: boolean }) => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="8.5" fill={filled ? "currentColor" : "none"} />
    {!filled && <circle cx="12" cy="12" r="4.5" />}
  </Icon>
);

/** Badge glyphs: smaller than the control icons, to sit beside a name. */
const BADGE_ICON_SIZE = 14;

export const PlusBadgeIcon = () => (
  <Icon size={BADGE_ICON_SIZE}>
    <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="currentColor" />
  </Icon>
);

export const SupporterBadgeIcon = () => (
  <Icon size={BADGE_ICON_SIZE}>
    <path
      d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"
      fill="currentColor"
    />
  </Icon>
);

/** Three bars that pulse while someone speaks (static when motion is reduced). */
export function VoiceBars() {
  return (
    <span className="inline-flex h-3 items-center gap-0.5" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-full w-0.5 origin-center animate-voice-bar rounded-button bg-current motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Flat spinner in the text color (no gradient). Decorative: the text beside it says what is happening. */
export function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 animate-spin motion-reduce:animate-none"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/** Provider marks of the login buttons: official shapes, filled (not line icons). Decorative. */
function BrandIcon({ children, viewBox }: { children: ReactNode; viewBox: string }) {
  return (
    <svg viewBox={viewBox} width={20} height={20} aria-hidden="true" focusable="false" className="shrink-0">
      {children}
    </svg>
  );
}

/** The four-color "G". The colors are the `brand-google-*` tokens. */
export const GoogleIcon = () => (
  <BrandIcon viewBox="0 0 48 48">
    <path
      fill="var(--color-brand-google-red)"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="var(--color-brand-google-blue)"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="var(--color-brand-google-yellow)"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="var(--color-brand-google-green)"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </BrandIcon>
);

/** The Discord mark, in the color of the text around it. */
export const DiscordIcon = () => (
  <BrandIcon viewBox="0 0 127.14 96.36">
    <path
      fill="currentColor"
      d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z"
    />
  </BrandIcon>
);
