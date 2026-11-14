import { PLUS_ANNUAL_EXPIRY_NOTICE_DAYS } from "@sualive/config";
import type { Plan } from "@sualive/protocol";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { planStatusText } from "../components/account/plan";
import { formatDate } from "../components/format";
import { DAY_MS, makeAccountState, makeActivePlan, makePlan, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import { texts } from "../texts";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const withPlan = (plan: Plan, overrides: Parameters<typeof makeUser>[0] = {}) =>
  makeAccountState({ user: makeUser({ plan, ...overrides }) });
const details = () => screen.getByTestId("plan-details").textContent;

describe("page of the own plan", () => {
  const periodEnd = Date.now() + 40 * DAY_MS;

  it("sends a visitor to the login, with the way back", () => {
    const { accountActions } = renderApp({ path: "/plano" });
    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/plano");
  });

  it("sends who has not finished the first access to it", () => {
    renderApp({
      path: "/plano",
      account: makeAccountState({ user: makeUser({ onboarded: false, handle: null }) }),
    });
    expect(heading()).toBe(texts.onboarding.title);
  });

  it.each([
    ["never subscribed", makePlan()],
    ["ended", makePlan({ status: "ended", plus: false, cycle: "monthly", periodEnd: Date.now() - DAY_MS })],
  ])("takes who has no plan in force (%s) to the offer", (_name, plan) => {
    renderApp({ path: "/plano", account: withPlan(plan) });
    expect(heading()).toBe(texts.plus.title);
    expect(screen.queryByTestId("plan-details")).toBeNull();
  });

  it("shows an ended plan on the offer page, where it can be subscribed again", () => {
    const plan = makePlan({ status: "ended", plus: false, cycle: "annual", periodEnd: Date.now() - DAY_MS });
    renderApp({ path: "/plano", account: withPlan(plan) });
    expect(within(screen.getByTestId("plan-status")).getByText(texts.plus.status.ended)).toBeTruthy();
    expect(screen.getByRole("button", { name: texts.plus.cycles.annual.choose })).toBeTruthy();
  });

  it("describes an active monthly plan: state, cycle and when it renews", () => {
    const plan = makeActivePlan({ periodEnd });
    renderApp({ path: "/plano", account: withPlan(plan) });

    expect(heading()).toBe(texts.plan.title);
    const status = within(screen.getByTestId("plan-status"));
    expect(status.getByText(planStatusText(plan)!)).toBeTruthy();
    expect(details()).toBe(
      `${texts.plan.details.state}${texts.plan.details.states.active}` +
        `${texts.plan.details.cycle}${texts.plus.cycles.monthly.name}` +
        `${texts.plan.details.renewsOn}${formatDate(periodEnd)}`,
    );
    expect(status.getByRole("button", { name: texts.plus.cancel.start })).toBeTruthy();
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
  });

  it("describes an active annual plan: valid until, nothing to cancel", () => {
    const plan = makeActivePlan({ cycle: "annual", renews: false, periodEnd });
    renderApp({ path: "/plano", account: withPlan(plan) });

    expect(screen.getByText(planStatusText(plan)!)).toBeTruthy();
    expect(details()).toBe(
      `${texts.plan.details.state}${texts.plan.details.states.active}` +
        `${texts.plan.details.cycle}${texts.plus.cycles.annual.name}` +
        `${texts.plan.details.validUntil}${formatDate(periodEnd)}`,
    );
    // The annual plan never renews: there is nothing to cancel.
    expect(screen.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
  });

  it("describes a Plus received as a gift: valid until, nothing to cancel and nothing that renews", () => {
    const plan = makeActivePlan({ cycle: "gift", renews: false, periodEnd });
    renderApp({ path: "/plano", account: withPlan(plan) });

    expect(heading()).toBe(texts.plan.title);
    expect(
      screen.getByText(texts.plus.status.activeUntil(texts.plus.status.cycle.gift, formatDate(periodEnd))),
    ).toBeTruthy();
    expect(details()).toBe(
      `${texts.plan.details.state}${texts.plan.details.states.active}` +
        `${texts.plan.details.cycle}${texts.plan.details.giftCycle}` +
        `${texts.plan.details.validUntil}${formatDate(periodEnd)}`,
    );
    expect(screen.queryByText(texts.plan.details.renewsOn)).toBeNull();
    expect(screen.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
    // It ends without an expiry warning, even close to the end.
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
  });

  it("does not warn about a gifted Plus close to its end, nor offers to subscribe over it", () => {
    const plan = makeActivePlan({ cycle: "gift", renews: false, periodEnd: Date.now() + DAY_MS });
    const view = renderApp({ path: "/plano", account: withPlan(plan) });
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
    expect(screen.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
    view.unmount();

    renderApp({ path: "/plus", account: withPlan(plan) });
    expect(screen.queryByRole("button", { name: texts.plus.cycles.monthly.choose })).toBeNull();
    expect(screen.queryByRole("button", { name: texts.plus.cycles.annual.choose })).toBeNull();
  });

  it("describes a plan with a payment that did not pass, as an alert, still cancelable", () => {
    const plan = makePlan({
      status: "past_due",
      plus: true,
      cycle: "monthly",
      periodEnd: Date.now() - DAY_MS,
    });
    renderApp({ path: "/plano", account: withPlan(plan) });

    expect(screen.getByRole("alert").textContent).toBe(texts.plus.status.pastDue);
    // No date to promise while the charge is being retried.
    expect(details()).toBe(
      `${texts.plan.details.state}${texts.plan.details.states.past_due}` +
        `${texts.plan.details.cycle}${texts.plus.cycles.monthly.name}`,
    );
    expect(screen.getByRole("button", { name: texts.plus.cancel.start })).toBeTruthy();
  });

  it("describes a canceled plan: valid until the end of what was paid, nothing left to cancel", () => {
    const plan = makePlan({ status: "canceled", plus: true, cycle: "monthly", periodEnd });
    renderApp({ path: "/plano", account: withPlan(plan) });

    expect(screen.getByText(texts.plus.status.canceled(formatDate(periodEnd)))).toBeTruthy();
    expect(screen.getByText(texts.plus.status.resubscribeLater)).toBeTruthy();
    expect(details()).toBe(
      `${texts.plan.details.state}${texts.plan.details.states.canceled}` +
        `${texts.plan.details.cycle}${texts.plus.cycles.monthly.name}` +
        `${texts.plan.details.validUntil}${formatDate(periodEnd)}`,
    );
    expect(screen.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
  });

  it.each([
    [PLUS_ANNUAL_EXPIRY_NOTICE_DAYS, true],
    [1, true],
    [PLUS_ANNUAL_EXPIRY_NOTICE_DAYS + 1, false],
  ])("warns about the annual plan at %i days from the end: %s", (days, warns) => {
    // Half a day short, so the count rounds up to exactly `days`.
    const end = Date.now() + days * DAY_MS - DAY_MS / 2;
    const plan = makeActivePlan({ cycle: "annual", renews: false, periodEnd: end });
    renderApp({ path: "/plano", account: withPlan(plan) });

    const notice = screen.queryByTestId("annual-expiry");
    expect(Boolean(notice)).toBe(warns);
    if (warns) expect(notice?.textContent).toBe(texts.plus.annualExpiry(days, formatDate(end)));
  });

  it("never warns about a monthly plan, which renews by itself", () => {
    renderApp({ path: "/plano", account: withPlan(makeActivePlan({ periodEnd: Date.now() + DAY_MS })) });
    expect(screen.queryByTestId("annual-expiry")).toBeNull();
  });

  it("shows the badges tied to the plan", () => {
    renderApp({
      path: "/plano",
      account: withPlan(makeActivePlan(), { badges: ["plus", "early_supporter"] }),
    });
    const badges = within(screen.getByRole("group", { name: texts.plan.badgesLabel }));
    expect(badges.getByText(texts.badges.plus.name)).toBeTruthy();
    expect(badges.getByText(texts.badges.early_supporter.name)).toBeTruthy();
  });

  it("gives the fixed link of the subscriber, to copy and to open", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderApp({ path: "/plano", account: withPlan(makeActivePlan()) });

    const address = `${window.location.origin}/@marina`;
    expect(screen.getByLabelText<HTMLInputElement>(texts.plan.fixedLinkLabel).value).toBe(address);
    expect(screen.getByRole("link", { name: texts.plan.fixedLinkOpen }).getAttribute("href")).toBe(
      "/@marina",
    );

    fireEvent.click(screen.getByRole("button", { name: texts.common.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address));
    expect(await screen.findByRole("button", { name: texts.common.copied })).toBeTruthy();
  });

  it("cancels the subscription after a confirmation that says until when it is valid", async () => {
    const plan = makeActivePlan({ periodEnd });
    const { accountActions } = renderApp({ path: "/plano", account: withPlan(plan) });
    const status = within(screen.getByTestId("plan-status"));

    fireEvent.click(status.getByRole("button", { name: texts.plus.cancel.start }));
    expect(status.getByText(texts.plus.cancel.explain(formatDate(periodEnd)))).toBeTruthy();
    expect(accountActions.cancelPlus).not.toHaveBeenCalled();

    fireEvent.click(status.getByRole("button", { name: texts.plus.cancel.confirm }));

    await waitFor(() => expect(accountActions.cancelPlus).toHaveBeenCalledTimes(1));
    expect(await status.findByText(/Assinatura cancelada/)).toBeTruthy();
    expect(status.queryByRole("button", { name: texts.plus.cancel.start })).toBeNull();
    // Still the page of the plan: a canceled plan is valid until the end of the period.
    expect(heading()).toBe(texts.plan.title);
  });

  it("can keep the subscription", () => {
    const { accountActions } = renderApp({ path: "/plano", account: withPlan(makeActivePlan()) });
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.start }));
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.keep }));
    expect(accountActions.cancelPlus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: texts.plus.cancel.start })).toBeTruthy();
  });

  it("explains a cancellation that failed and keeps the plan as it was", async () => {
    const { accountActions } = renderApp({ path: "/plano", account: withPlan(makeActivePlan()) });
    vi.mocked(accountActions.cancelPlus).mockResolvedValue({ ok: false, reason: "error" });
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.start }));
    fireEvent.click(screen.getByRole("button", { name: texts.plus.cancel.confirm }));

    expect(await screen.findByText(texts.account.errors.error)).toBeTruthy();
    expect(screen.getByText(texts.plan.details.states.active)).toBeTruthy();
  });
});
