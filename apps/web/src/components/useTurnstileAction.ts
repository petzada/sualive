import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnstileHandle } from "./Turnstile";

type Status = "idle" | "waiting" | "running";

/**
 * Runs an action that needs a Turnstile token. If the token has not arrived yet, the action
 * waits for it; after each run the widget is reset, because a token is valid only once.
 */
export function useTurnstileAction(action: (token: string) => Promise<void>) {
  const widgetRef = useRef<TurnstileHandle>(null);
  const tokenRef = useRef<string | null>(null);
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
      tokenRef.current = null;
      setStatus("running");
      try {
        await actionRef.current(token);
      } finally {
        setStatus("idle");
        widgetRef.current?.reset();
      }
    },
    [setStatus],
  );

  const onToken = useCallback(
    (token: string | null) => {
      tokenRef.current = token;
      if (!token) return;
      setFailed(false);
      if (statusRef.current === "waiting") void run(token);
    },
    [run],
  );

  const onError = useCallback(() => {
    tokenRef.current = null;
    setFailed(true);
    if (statusRef.current === "waiting") setStatus("idle");
  }, [setStatus]);

  const retry = useCallback(() => {
    setFailed(false);
    widgetRef.current?.reset();
  }, []);

  const trigger = useCallback(() => {
    if (statusRef.current !== "idle") return;
    if (tokenRef.current) {
      void run(tokenRef.current);
      return;
    }
    setStatus("waiting");
    if (failed) retry();
  }, [failed, retry, run, setStatus]);

  return {
    /** Spread on `<Turnstile />`. */
    turnstileProps: { ref: widgetRef, onToken, onError },
    trigger,
    retry,
    /** `waiting`: the user asked and the check is still running. `running`: the action is in flight. */
    status,
    failed,
  };
}
