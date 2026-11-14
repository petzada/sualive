import { useEffect, useRef } from "react";
import type { RoomNotice } from "../../lib/room";
import { texts } from "../../texts";
import { CloseIcon } from "../icons";

/** How long the "link copied" confirmation stays; every other notice waits to be dismissed. */
const TRANSIENT_NOTICE_MS = 4000;

export function noticeText(notice: RoomNotice): string {
  switch (notice.kind) {
    case "mediaPermissionDenied":
      return texts.notices.mediaPermissionDenied[notice.device];
    default:
      return texts.notices[notice.kind];
  }
}

interface NoticeBannerProps {
  notice: RoomNotice | null;
  onDismiss: () => void;
  className?: string;
}

/** The live region is always mounted so screen readers announce each new notice. */
export function NoticeBanner({ notice, onDismiss, className = "" }: NoticeBannerProps) {
  const transient = notice?.kind === "linkCopied";

  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!transient) return;
    const timer = setTimeout(() => dismissRef.current(), TRANSIENT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [transient]);

  return (
    <div role="status" aria-live="polite" className={className}>
      {notice && (
        <div className="flex items-center gap-1 rounded-card bg-canvas py-1 pr-1 pl-4 text-left text-body-sm shadow-outline">
          <p className="flex-1 py-2">{noticeText(notice)}</p>
          <button
            type="button"
            aria-label={texts.notices.dismiss}
            onClick={onDismiss}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-button text-muted hover:bg-mist hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
