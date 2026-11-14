/** Class lists shared by the account screens. Only theme tokens, so they work in both themes. */

/** Text field: 17px (phones do not zoom in), pill outline, 48px tall. */
export const FIELD =
  "min-h-12 w-full rounded-field bg-canvas px-5 text-body text-ink shadow-outline outline-offset-2 placeholder:text-muted disabled:bg-mist";

/** Filled main action (HeroUI `Button variant="primary"` or a link that looks like it). */
export const PRIMARY_PILL = "min-h-12 rounded-button px-7 text-body font-medium";

/** A link dressed as the filled main action (full-page navigations, such as the login). */
export const PRIMARY_LINK = `inline-flex items-center justify-center bg-accent text-on-accent ${PRIMARY_PILL}`;

/** Secondary action: outlined pill. */
export const OUTLINE_PILL = "min-h-11 rounded-button border-outline bg-canvas px-5 text-body-sm text-ink";

/** A link dressed as the outlined pill. */
export const OUTLINE_LINK =
  "inline-flex min-h-11 items-center justify-center rounded-button bg-canvas px-5 text-body-sm text-ink shadow-outline";

/** Inline text link. */
export const TEXT_LINK = "rounded-link text-link underline-offset-2 hover:underline";

/** White card on a mist band, or mist block on the white page. */
export const CARD = "rounded-card bg-mist p-card";

export const FIELD_ERROR = "px-1 text-body-sm font-medium text-notice";
export const FIELD_HINT = "px-1 text-body-sm text-muted";
