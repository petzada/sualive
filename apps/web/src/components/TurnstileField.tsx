import { Button } from "@heroui/react";
import { texts } from "../texts";
import { Turnstile } from "./Turnstile";
import type { useTurnstileAction } from "./useTurnstileAction";

type TurnstileFieldProps = Pick<ReturnType<typeof useTurnstileAction>, "turnstileProps" | "failed" | "retry">;

/**
 * The out-of-sight Turnstile check. Takes no room in the layout: the widget floats over the page,
 * in the center of the window (and only when an interaction is demanded), and the only thing left in place is the failure
 * message with the way to ask for a new token.
 */
export function TurnstileField({ turnstileProps, failed, retry }: TurnstileFieldProps) {
  return (
    <>
      <Turnstile {...turnstileProps} />
      {failed && (
        <div role="alert" className="flex flex-col items-center gap-1 text-body-sm">
          <p>{texts.turnstile.failed}</p>
          <Button variant="ghost" className="min-h-11 rounded-button text-body-sm text-link" onPress={retry}>
            {texts.turnstile.retry}
          </Button>
        </div>
      )}
    </>
  );
}
