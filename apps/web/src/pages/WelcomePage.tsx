import { Button, Popover } from "@heroui/react";
import type { MeUser } from "@sualive/protocol";
import { useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { SiteFooter, useAccountGate } from "../components/account/PageShell";
import { fixedRoomPath, PATHS } from "../components/account/paths";
import { PRIMARY_LINK, PRIMARY_PILL, TEXT_LINK } from "../components/account/styles";
import { CheckIcon, CloseIcon } from "../components/icons";
import { MANIFESTO_PATH } from "../components/ManifestoCard";
import { texts } from "../texts";

/** From this width on there is room for the balloon beside the button; below it, it opens under. */
const BESIDE_QUERY = "(min-width: 768px)";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia?.(BESIDE_QUERY);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function useRoomBeside(): boolean {
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia?.(BESIDE_QUERY).matches ?? false);
}

/**
 * The main button does not leave the page: it opens a balloon beside it with what the Plus gives,
 * and only the button inside the balloon leads to the plans. The focus goes into the balloon when
 * it opens; Escape, the "X" or a click outside close it and give the focus back to the button.
 */
function PlansBalloon({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const beside = useRoomBeside();

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button variant="primary" className={PRIMARY_PILL}>
        {texts.welcome.plansOpen}
      </Button>
      <Popover.Content
        // Beside: aligned with the top of the button, so it grows over the empty part of the page.
        placement={beside ? "right top" : "bottom"}
        offset={12}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-card bg-frost text-ink shadow-outline"
      >
        <Popover.Dialog className="flex flex-col gap-4 p-5" data-testid="plans-balloon">
          <div className="flex items-start justify-between gap-3">
            <Popover.Heading className="pt-2 font-display text-title font-semibold">
              {texts.welcome.plans.title}
            </Popover.Heading>
            <button
              type="button"
              aria-label={texts.common.close}
              onClick={() => setOpen(false)}
              className="-mt-1 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-button text-ink hover:bg-control"
            >
              <CloseIcon />
            </button>
          </div>
          <ul className="flex flex-col gap-2.5 text-body-sm">
            {texts.welcome.plans.benefits(fixedRoomPath(handle)).map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5">
                <span className="shrink-0 text-accent">
                  <CheckIcon />
                </span>
                <span className="pt-px">{benefit}</span>
              </li>
            ))}
          </ul>
          <Link to={PATHS.plus} className={`self-start ${PRIMARY_LINK}`}>
            {texts.welcome.plans.action}
          </Link>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

function WelcomeContent({ user }: { user: MeUser }) {
  return (
    <div className="flex max-w-md flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-heading font-semibold break-words">
          {texts.welcome.title(user.nickname)}
        </h1>
        {user.handle && <p data-testid="welcome-handle">{texts.welcome.ready(user.handle)}</p>}
      </div>

      <p className="text-muted">
        {texts.welcome.manifesto.before}
        <Link to={MANIFESTO_PATH} className={TEXT_LINK}>
          {texts.welcome.manifesto.link}
        </Link>
        {texts.welcome.manifesto.after}
      </p>

      <PlansBalloon handle={user.handle ?? ""} />

      <Link to={PATHS.home} className={`inline-flex min-h-11 items-center text-body-sm ${TEXT_LINK}`}>
        {texts.welcome.home}
      </Link>
    </div>
  );
}

/**
 * Shown once, right after the first access. Same frame as the first access: no name at the top, no
 * account links in the corner, everything centered, the legal pages centered at the bottom.
 */
export function WelcomePage() {
  const { user, fallback } = useAccountGate();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        {user ? <WelcomeContent user={user} /> : fallback}
      </main>
      <SiteFooter />
    </div>
  );
}
