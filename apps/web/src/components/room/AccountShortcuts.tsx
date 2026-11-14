import { Link } from "@heroui/react";
import { useState } from "react";
import { texts } from "../../texts";
import { useAccountClient } from "../account/AccountClient";
import { PATHS } from "../account/paths";
import { Hint } from "../Hint";
import { PlanIcon } from "../icons";

/** Leaving the page ends the call, so both shortcuts open in another tab. */
const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

/** Same height and rounding as the buttons around them. */
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

/** What the shortcuts need from the account; `null` until it is known, so nothing changes under the pointer. */
function useShortcutAccount() {
  const { state } = useAccountClient().useAccount();
  return state.status === "loading" ? null : { user: state.user };
}

interface ShortcutProps {
  /** Side of the hint: below in the header, above in the row of the actions. */
  hint?: "top" | "bottom";
}

/**
 * The pill of the plan: "Plus" to the own plan, or the invitation to know it, also for a visitor.
 * `compact`: only the glyph, in a round button as big as its neighbors (the header, on a phone).
 */
export function PlanShortcut({ compact = false, hint = "top" }: ShortcutProps & { compact?: boolean }) {
  const account = useShortcutAccount();
  if (!account) return null;
  const hasPlus = account.user?.plan.plus === true;
  const label = hasPlus ? texts.controls.plan : texts.controls.plusOffer;

  return (
    <Hint text={label} placement={hint}>
      <Link
        href={hasPlus ? PATHS.plan : PATHS.plus}
        {...NEW_TAB}
        aria-label={label}
        data-testid="plan-pill"
        className={`justify-center bg-plan text-body-sm font-medium text-on-plan ${compact ? "w-11" : "px-4"} ${ROUND}`}
      >
        {compact ? (
          // The name stays in the label and in the hint.
          <PlanIcon />
        ) : (
          <span className="whitespace-nowrap">
            {hasPlus ? texts.controls.planShort : texts.controls.plusOfferShort}
          </span>
        )}
      </Link>
    </Hint>
  );
}

/** The picture of who is logged, to the profile. Nothing for a visitor. */
export function ProfileShortcut({ hint = "top" }: ShortcutProps) {
  const user = useShortcutAccount()?.user;
  if (!user) return null;

  return (
    <Hint text={texts.controls.profile} placement={hint}>
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
  );
}

/**
 * Both shortcuts side by side, round and of the same size: in the header of the room on a phone,
 * before the theme and leave buttons. On wider screens they are apart, at the two ends of the row
 * of the actions (see `ControlBar`).
 */
export function AccountShortcuts({ className = "" }: { className?: string }) {
  if (!useShortcutAccount()) return null;

  return (
    <nav
      aria-label={texts.controls.accountLabel}
      className={`flex shrink-0 items-center gap-1.5 ${className}`}
    >
      <PlanShortcut compact hint="bottom" />
      <ProfileShortcut hint="bottom" />
    </nav>
  );
}
