import { useEffect, useRef } from "react";
import type { WalletResult } from "../../lib/wallet";
import { texts } from "../../texts";
import { OUTLINE_PILL } from "../account/styles";
import { Spinner } from "../icons";

/** Runs a wallet action; a thrown error counts as the generic failure. */
export async function attempt<T>(action: () => Promise<WalletResult<T>>): Promise<WalletResult<T>> {
  try {
    return await action();
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Nothing of the wallet loads by itself: the screen asks when it opens. Runs once per mount,
 * whatever the identity of the actions.
 */
export function useLoadOnMount(load: () => void) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => loadRef.current(), []);
}

/** How the person writes an @handle (capitals, "@" in front) → what the server takes. */
export function cleanHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

/** Waiting line of a part of the wallet or of the shop. */
export function WalletLoading({ text = texts.common.loading }: { text?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-body-sm text-muted">
      <Spinner />
      {text}
    </p>
  );
}

/** A part that could not be loaded, with the way to ask again. */
export function WalletLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="font-medium text-notice">
        {message}
      </p>
      <button type="button" onClick={onRetry} className={`cursor-pointer shadow-outline ${OUTLINE_PILL}`}>
        {texts.common.tryAgain}
      </button>
    </div>
  );
}
