import type { ReactNode } from "react";

/** Own minimal line icons (24px grid, stroke follows the text color). Always decorative. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
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

export const ArrowDownIcon = () => (
  <Icon>
    <path d="M12 5v14M6 13l6 6 6-6" />
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
