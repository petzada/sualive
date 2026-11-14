import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnstileHandle } from "./Turnstile";

type Status = "idle" | "waiting" | "running";

/**
 * A token lives 300 s at Cloudflare and is valid only once. One obtained and not used (the
 * action did not run) is kept for the next action only while it still has a minute to spare for
 * the request to reach the server.
 */
const TOKEN_REUSE_MS = 240_000;

interface HeldToken {
  token: string;
  receivedAt: number;
}

/**
 * Runs an action that needs a Turnstile token, one token per action. The check only starts on
 * `trigger` (the person's click): nothing is asked of Cloudflare before that. When the token
 * arrives, the action runs by itself. A token is handed to the action once and then dropped; the
 * next one is only asked for at the next `trigger`.
 */
export function useTurnstileAction(action: (token: string) => Promise<void>) {
  const widgetRef = useRef<TurnstileHandle>(null);
  const tokenRef = useRef<HeldToken | null>(null);
  const statusRef = useRef<Status>("idle");
  const actionRef = useRef(action);
  const [status, setStatusState] = useState<Status>("idle");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    actionRef.current = action;
  });

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const run = useCallback(
    async (token: string) => {
      tokenRef.current = null; // single-use: never handed out twice
      setStatus("running");
      try {
        await actionRef.current(token);
      } finally {
        setStatus("idle");
      }
    },
    [setStatus],
  );

  const onToken = useCallback(
    (token: string | null) => {
      if (!token) {
        tokenRef.current = null;
        return;
      }
      setFailed(false);
      if (statusRef.current === "waiting") void run(token);
      else tokenRef.current = { token, receivedAt: Date.now() };
    },
    [run],
  );

  const onError = useCallback(() => {
    tokenRef.current = null;
    setFailed(true);
    if (statusRef.current === "waiting") setStatus("idle");
  }, [setStatus]);

  const trigger = useCallback(() => {
    if (statusRef.current !== "idle") return;
    setFailed(false);
    const held = tokenRef.current;
    tokenRef.current = null;
    if (held && Date.now() - held.receivedAt < TOKEN_REUSE_MS) {
      void run(held.token);
      return;
    }
    setStatus("waiting");
    widgetRef.current?.execute();
  }, [run, setStatus]);

  return {
    /** Spread on `<Turnstile />`. */
    turnstileProps: { ref: widgetRef, onToken, onError },
    trigger,
    /** After a failure: runs the check again and, with the token, the action (one click). */
    retry: trigger,
    /** `waiting`: the user asked and the check is still running. `running`: the action is in flight. */
    status,
    failed,
  };
}
