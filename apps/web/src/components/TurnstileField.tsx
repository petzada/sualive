import { Button } from "@heroui/react";
import { texts } from "../texts";
import { Turnstile } from "./Turnstile";
import type { useTurnstileAction } from "./useTurnstileAction";

type TurnstileFieldProps = Pick<ReturnType<typeof useTurnstileAction>, "turnstileProps" | "failed" | "retry">;

/** The Turnstile widget plus the failure message and the way to ask for a new token. */
export function TurnstileField({ turnstileProps, failed, retry }: TurnstileFieldProps) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Turnstile {...turnstileProps} />
      {failed && (
        <div role="alert" className="flex flex-col items-center gap-1 text-body-sm">
          <p>{texts.turnstile.failed}</p>
          <Button variant="ghost" className="min-h-11 rounded-button text-body-sm text-link" onPress={retry}>
            {texts.turnstile.retry}
          </Button>
        </div>
      )}
    </div>
  );
}
