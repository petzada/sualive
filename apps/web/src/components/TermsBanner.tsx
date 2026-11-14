import { TERMS_DATE } from "@sualive/config";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { texts } from "../texts";
import { useAccountClient } from "./account/AccountClient";
import { PATHS } from "./account/paths";
import { formatIsoDate } from "./format";

/**
 * Height of the banner, published on `<html>` while it is on screen. The room fills the window
 * (`RoomView`) and takes this out of its height, so nothing of it ends up below the fold.
 */
export const TERMS_BANNER_HEIGHT_VAR = "--terms-banner-height";

/**
 * Notice that the Termos de Uso changed since the account last saw them (`user.termsUpdate`). A
 * strip at the top of every page, in the inverted pair of the theme (`ink` + `canvas`), that blocks
 * nothing: closing it or opening the link records the version as seen and hides it at once, without
 * waiting for the answer. A failure shows nothing; the strip comes back on the next load.
 */
export function TermsBanner() {
  const { state, actions } = useAccountClient().useAccount();
  const version = state.user?.termsUpdate ?? null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const visible = version !== null && version !== dismissed;
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!visible || !element) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(TERMS_BANNER_HEIGHT_VAR, `${element.offsetHeight}px`);
    publish();
    // The text wraps on a narrow window, so the height follows the width.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(TERMS_BANNER_HEIGHT_VAR);
    };
  }, [visible]);

  if (!visible) return null;

  const markSeen = () => {
    setDismissed(version);
    void actions.markTermsSeen().catch(() => undefined);
  };

  return (
    <section
      ref={ref}
      aria-label={texts.termsBanner.label}
      data-testid="terms-banner"
      className="sticky top-0 z-40 flex items-start gap-3 bg-ink py-2 pr-2 pl-5 text-body-sm text-canvas"
    >
      <p className="min-w-0 flex-1 py-1.5 text-center">
        <time dateTime={TERMS_DATE} className="font-semibold">
          {formatIsoDate(TERMS_DATE)}
        </time>
        {texts.termsBanner.before}
        <Link to={PATHS.terms} onClick={markSeen} className="rounded-link font-semibold underline">
          {texts.termsBanner.link}
        </Link>
        {texts.termsBanner.after}
      </p>
      <button
        type="button"
        aria-label={texts.termsBanner.close}
        onClick={markSeen}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-link"
      >
        <span aria-hidden="true">{texts.termsBanner.closeMark}</span>
      </button>
    </section>
  );
}
