import type { MediaCapabilities } from "./types";

export interface NavigatorLike {
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
  mediaDevices?: { getUserMedia?: unknown; getDisplayMedia?: unknown };
}

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobi/i;

function isMobileBrowser(nav: NavigatorLike): boolean {
  if (nav.userAgentData?.mobile) return true;
  const userAgent = nav.userAgent ?? "";
  if (MOBILE_USER_AGENT.test(userAgent)) return true;
  // iPadOS se apresenta como Mac; a tela de toque denuncia.
  return /Macintosh/.test(userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

export function detectMediaCapabilities(nav: NavigatorLike | undefined): MediaCapabilities {
  if (!nav) return { canShareScreen: false, canUseCamera: false };
  const devices = nav.mediaDevices;
  return {
    canShareScreen: typeof devices?.getDisplayMedia === "function" && !isMobileBrowser(nav),
    canUseCamera: typeof devices?.getUserMedia === "function",
  };
}
