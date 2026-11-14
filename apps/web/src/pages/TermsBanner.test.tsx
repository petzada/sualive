import { TERMS_DATE, TERMS_VERSION } from "@sualive/config";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PATHS } from "../components/account/paths";
import { TERMS_BANNER_HEIGHT_VAR } from "../components/TermsBanner";
import { makeAccountActions, makeAccountState, makeUser } from "../test/account";
import { makeConnectedState, renderApp } from "../test/room";
import { texts } from "../texts";

const banner = () => screen.queryByTestId("terms-banner");
const pending = () => makeAccountState({ user: makeUser({ termsUpdate: TERMS_VERSION }) });
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("terms banner", () => {
  it("shows the date first, the sentence, the link to the Termos de Uso and a plain x", () => {
    renderApp({ path: PATHS.profile, account: pending() });

    const strip = banner()!;
    const [year, month, day] = TERMS_DATE.split("-");
    const date = `${day}/${month}/${year}`;
    expect(strip.textContent).toBe(
      `${date}${texts.termsBanner.before}${texts.termsBanner.link}${texts.termsBanner.after}x`,
    );
    expect(strip.textContent?.startsWith(date)).toBe(true);
    expect(texts.termsBanner.link).toBe("Termos de Uso");
    expect(within(strip).getByRole("link", { name: texts.termsBanner.link }).getAttribute("href")).toBe(
      PATHS.terms,
    );
    const close = within(strip).getByRole("button", { name: texts.termsBanner.close });
    expect(texts.termsBanner.closeMark).toBe("x");
    expect(close.textContent).toBe("x");
    // Only the letter: no outline around it.
    expect(close.className).not.toMatch(/shadow|border|ring/);
    // The inverted pair of the theme, the same tokens in the light and in the dark theme.
    expect(strip.className).toContain("bg-ink");
    expect(strip.className).toContain("text-canvas");
    expect(strip.className).not.toContain("dark:");
  });

  it("comes before the page, at the top", () => {
    renderApp({ path: PATHS.profile, account: pending() });

    const strip = banner()!;
    expect(strip.className).toContain("sticky");
    expect(strip.className).toContain("top-0");
    const main = screen.getByRole("main");
    expect(strip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.contains(main)).toBe(false);
  });

  it.each([PATHS.home, PATHS.profile, PATHS.plus, PATHS.privacy, "/s/abcdefghjk"])(
    "is on every page: %s",
    (path) => {
      renderApp({ path, account: pending() });
      expect(banner()).toBeTruthy();
    },
  );

  it("stays above the room, which gives up its height", () => {
    renderApp({ account: pending(), state: makeConnectedState() });

    expect(banner()).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue(TERMS_BANNER_HEIGHT_VAR)).not.toBe("");
    const room = screen.getByRole("toolbar", { name: texts.controls.label }).closest('[class*="100dvh"]');
    expect(room?.className).toContain(`var(${TERMS_BANNER_HEIGHT_VAR},0px)`);
  });

  it("is not there when the account already saw the current version", () => {
    renderApp({ path: PATHS.profile, account: makeAccountState({ user: makeUser() }) });
    expect(banner()).toBeNull();
  });

  it("is not there without an account", () => {
    renderApp({ path: PATHS.home });
    expect(banner()).toBeNull();
  });

  it("the x records the version as seen and hides the banner at once", () => {
    const accountActions = makeAccountActions();
    // Never answers: the banner does not wait for it.
    accountActions.markTermsSeen.mockReturnValue(new Promise(() => undefined));
    renderApp({ path: PATHS.profile, account: pending(), accountActions });

    fireEvent.click(screen.getByRole("button", { name: texts.termsBanner.close }));

    expect(accountActions.markTermsSeen).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
    expect(document.documentElement.style.getPropertyValue(TERMS_BANNER_HEIGHT_VAR)).toBe("");
    // The page under it is untouched.
    expect(heading()).toBe(texts.profile.title);
  });

  it("the link records the version as seen, hides the banner and opens the Termos de Uso", () => {
    const accountActions = makeAccountActions();
    renderApp({ path: PATHS.profile, account: pending(), accountActions });

    fireEvent.click(within(banner()!).getByRole("link", { name: texts.termsBanner.link }));

    expect(accountActions.markTermsSeen).toHaveBeenCalledTimes(1);
    expect(banner()).toBeNull();
    expect(heading()).toBe(texts.legal.terms.title);
  });

  it.each([
    ["answers with a refusal", () => Promise.resolve({ ok: false as const, reason: "error" as const })],
    ["rejects", () => Promise.reject(new Error("offline"))],
  ])("shows no error when the request %s", async (_case, answer) => {
    const accountActions = makeAccountActions();
    accountActions.markTermsSeen.mockImplementation(answer);
    renderApp({ path: PATHS.profile, account: pending(), accountActions });

    fireEvent.click(screen.getByRole("button", { name: texts.termsBanner.close }));
    await Promise.resolve();

    expect(banner()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(texts.account.errors.error)).toBeNull();
  });
});
