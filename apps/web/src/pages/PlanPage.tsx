import type { MeUser, Plan } from "@sualive/protocol";
import { useState } from "react";
import { Navigate } from "react-router";
import { Badges } from "../components/account/Badges";
import { PageShell, useAccountGate } from "../components/account/PageShell";
import { PATHS } from "../components/account/paths";
import { FixedLink, PlanStatus } from "../components/account/plan";
import type { AccountActions } from "../lib/account";
import { texts } from "../texts";

function PlanContent({ user, actions }: { user: MeUser; actions: AccountActions }) {
  // After a cancellation the answer of the server is shown at once, whatever the account refresh does.
  const [canceledPlan, setCanceledPlan] = useState<Plan | null>(null);
  const plan = canceledPlan ?? user.plan;

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-heading font-semibold">{texts.plan.title}</h1>
        {user.badges.length > 0 && (
          <div role="group" aria-label={texts.plan.badgesLabel}>
            <Badges badges={user.badges} withNames />
          </div>
        )}
      </header>

      <PlanStatus plan={plan} manage={{ actions, onChange: setCanceledPlan }} />
      {user.handle && <FixedLink handle={user.handle} />}
    </>
  );
}

/**
 * The plan of the own account, and only that: state of the subscription, its badges, the fixed
 * link and the cancellation. Who has no plan in force is taken to the offer (`/plus`).
 */
export function PlanPage() {
  const { user, fallback, actions } = useAccountGate();
  if (!user) return <PageShell>{fallback}</PageShell>;
  if (!user.plan.plus) return <Navigate to={PATHS.plus} replace />;

  return (
    <PageShell>
      <PlanContent user={user} actions={actions} />
    </PageShell>
  );
}
