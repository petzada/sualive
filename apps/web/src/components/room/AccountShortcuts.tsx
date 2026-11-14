import { Link } from "@heroui/react";
import { useState } from "react";
import { texts } from "../../texts";
import { useAccountClient } from "../account/AccountClient";
import { PATHS } from "../account/paths";
import { Hint } from "../Hint";
import { PlanIcon } from "../icons";

/** Leaving the page ends the call, so both shortcuts open in another tab. */
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

/** Same height and rounding as the action buttons of the row. */
const ROUND = "h-11 shrink-0 rounded-button no-underline hover:no-underline";

/** The picture of the account filling the round button; the initial when there is none or it fails. */
function Picture({ nickname, avatarUrl }: { nickname: string; avatarUrl: string | null }) {
  // Remembers which address failed, so a new address gets its own chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = Array.from(nickname.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?";

  return avatarUrl !== null && avatarUrl !== failedUrl ? (
    <img
      src={avatarUrl}
      alt=""
      // The picture lives on another site: it does not need to know which room asked for it.
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(avatarUrl)}
      className="size-full object-cover"
    />
  ) : (
    <span aria-hidden="true">{initial}</span>
  );
}

/**
 * At the right of the actions of the room: the picture of who is logged (to the profile) and the
 * pill of the plan ("Plus" to the own plan, or the invitation to know it, also for a visitor).
 */
export function AccountShortcuts({ className = "" }: { className?: string }) {
  const { state } = useAccountClient().useAccount();
  // Nothing until the account is known, so the pill never changes under the pointer.
  if (state.status === "loading") return null;
  const { user } = state;
  const hasPlus = user?.plan.plus === true;
  const planLabel = hasPlus ? texts.controls.plan : texts.controls.plusOffer;

  return (
    <nav
      aria-label={texts.controls.accountLabel}
      className={`flex shrink-0 items-center gap-1 sm:gap-2 ${className}`}
    >
      <Hint text={planLabel}>
        <Link
          href={hasPlus ? PATHS.plan : PATHS.plus}
          {...NEW_TAB}
          aria-label={planLabel}
          data-testid="plan-pill"
          className={`w-11 justify-center bg-plan text-body-sm font-medium text-on-plan sm:w-auto sm:px-4 ${ROUND}`}
        >
          {/* Phones: only the glyph, so the row fits; the name stays in the label and in the hint. */}
          <span className="inline-flex sm:hidden">
            <PlanIcon />
          </span>
          <span className="hidden whitespace-nowrap sm:inline">
            {hasPlus ? texts.controls.planShort : texts.controls.plusOfferShort}
          </span>
        </Link>
      </Hint>
      {user && (
        <Hint text={texts.controls.profile}>
          <Link
            href={PATHS.profile}
            {...NEW_TAB}
            aria-label={texts.controls.profile}
            data-testid="account-photo"
            className={`w-11 justify-center overflow-hidden bg-control font-semibold text-ink ${ROUND}`}
          >
            <Picture nickname={user.nickname} avatarUrl={user.avatarUrl} />
          </Link>
        </Hint>
      )}
    </nav>
  );
}
