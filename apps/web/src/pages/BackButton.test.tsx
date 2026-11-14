import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { AccountClientProvider } from "../components/account/AccountClient";
import type { AccountState } from "../lib/account";
import { makeAccountClient, makeAccountState, makeActivePlan, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import { texts } from "../texts";

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const backButton = () => screen.queryByRole("button", { name: texts.common.back });
const logged = (overrides: Parameters<typeof makeUser>[0] = {}) =>
  makeAccountState({ user: makeUser(overrides) });
const subscriber = () => logged({ plan: makeActivePlan() });
/** Position of the page in the history of the tab, as the router numbers it. */
const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx;

/**
 * The app on the real history of the tab (the back button reads it), as in the browser. Each call
 * with `path` starts as a page just loaded in a tab: an entry the router has not numbered yet.
 * Without `path` it renders over the entry the tab is on, as a reload does.
 */
function openTab(account: AccountState, path?: string) {
  if (path !== undefined) window.history.replaceState(null, "", path);
  return render(
    <BrowserRouter>
      <AccountClientProvider client={makeAccountClient(account)}>
        <App />
      </AccountClientProvider>
    </BrowserRouter>,
  );
}

const goToProfile = () => fireEvent.click(screen.getByRole("link", { name: texts.nav.profile("Marina") }));
const goToPlan = () => fireEvent.click(screen.getByTestId("profile-plan-link"));
const pressBack = () => fireEvent.click(backButton()!);
/** The header of the page itself: the content has headers of its own (title blocks), inside `main`. */
const siteHeaders = () =>
  screen.queryAllByRole("banner").filter((header) => !screen.getByRole("main").contains(header));

describe("pages without a header: profile, Plus and the own plan", () => {
  const pages = [
    ["/perfil", texts.profile.title, logged()],
    ["/plus", texts.plus.title, logged()],
    ["/plus", texts.plus.title, makeAccountState()],
    ["/plano", texts.plan.title, subscriber()],
  ] as const;

  it.each(pages)("has no logo and no account links at the top of %s (%#)", (path, title, account) => {
    renderApp({ path, account });

    expect(heading()).toBe(title);
    expect(siteHeaders()).toEqual([]);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.home })).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.plus })).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.login })).toBeNull();
    expect(screen.queryByRole("link", { name: texts.nav.profile("Marina") })).toBeNull();
    // The row at the top is only the place of the back button, and the titles come right after it.
    const top = screen.getByTestId("page-top");
    const main = screen.getByRole("main");
    expect(top.parentElement?.firstElementChild).toBe(top);
    expect(top.nextElementSibling).toBe(main);
    expect(top.textContent).toBe("");
    expect(main.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
  });

  it.each(pages)("keeps a discreet way home in the footer of %s (%#)", (path, _title, account) => {
    renderApp({ path, account });

    const footer = screen.getByRole("contentinfo", { name: texts.nav.footerLabel });
    const links = within(footer).getAllByRole("link");
    expect(texts.nav.homeShort).toBe("Início");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      [texts.nav.homeShort, "/"],
      [texts.nav.terms, "/termos"],
      [texts.nav.privacy, "/privacidade"],
    ]);
    // As discreet as the legal links beside it.
    expect(links[0]!.className).toBe(links[1]!.className);

    fireEvent.click(links[0]!);
    expect(screen.getByRole("button", { name: texts.home.create })).toBeTruthy();
  });

  it("leaves the other pages as they were: the legal pages keep the name at the top, the home page has no 'Início'", () => {
    const legal = renderApp({ path: "/termos" });
    expect(siteHeaders()).toHaveLength(1);
    expect(within(siteHeaders()[0]!).getByRole("link", { name: texts.nav.home })).toBeTruthy();
    expect(screen.queryByRole("link", { name: texts.nav.homeShort })).toBeNull();
    expect(backButton()).toBeNull();
    legal.unmount();

    renderApp({ path: "/" });
    expect(screen.queryByRole("link", { name: texts.nav.homeShort })).toBeNull();
  });
});

describe("back button", () => {
  it.each([
    ["/perfil", texts.profile.title, logged()],
    ["/plus", texts.plus.title, logged()],
    ["/plano", texts.plan.title, subscriber()],
  ] as const)("is not there when %s is the first page of the tab", (path, title, account) => {
    openTab(account, path);

    expect(heading()).toBe(title);
    expect(historyIndex()).toBe(0);
    expect(backButton()).toBeNull();
    // Its row keeps its height, so the titles are where they are when the button is there.
    expect(screen.getByTestId("page-top").className.split(" ")).toContain("min-h-14");
  });

  it("is not there after a redirect that replaced the first page of the tab", () => {
    // Who has no plan and opens `/plano` is taken to the offer, in the same entry of the history.
    openTab(logged(), "/plano");

    expect(heading()).toBe(texts.plus.title);
    expect(window.location.pathname).toBe("/plus");
    expect(backButton()).toBeNull();
  });

  it("appears after a navigation inside the app, and goes back to the page the person came from", async () => {
    openTab(logged(), "/");
    expect(backButton()).toBeNull();

    goToProfile();

    expect(heading()).toBe(texts.profile.title);
    expect(historyIndex()).toBe(1);
    const back = backButton()!;
    // At the top left, in the row above the content.
    expect(back.parentElement).toBe(screen.getByTestId("page-top"));
    // Only the arrow, with its accessible name.
    expect(texts.common.back).toBe("Voltar");
    expect(back.getAttribute("aria-label")).toBe("Voltar");
    expect(back.textContent).toBe("");
    expect(back.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // Ink, thin outline, no fill.
    const classes = back.className.split(" ");
    for (const name of ["size-11", "rounded-button", "border", "border-outline", "text-ink"]) {
      expect(classes).toContain(name);
    }
    expect(back.className).not.toMatch(/(^| )bg-/);

    pressBack();

    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
    expect(historyIndex()).toBe(0);
  });

  it("goes back one page at a time after two navigations, and stays right after going forward", async () => {
    openTab(logged(), "/");
    goToProfile();
    goToPlan();
    expect(heading()).toBe(texts.plus.title);
    expect(historyIndex()).toBe(2);

    // Plus -> profile: there is still the home page behind, so the button stays.
    pressBack();
    await waitFor(() => expect(heading()).toBe(texts.profile.title));
    expect(window.location.pathname).toBe("/perfil");
    expect(backButton()).toBeTruthy();

    // Profile -> home.
    pressBack();
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(window.location.pathname).toBe("/");

    // Forward with the browser: each page knows again that there is one behind it.
    window.history.forward();
    await waitFor(() => expect(heading()).toBe(texts.profile.title));
    expect(backButton()).toBeTruthy();
    window.history.forward();
    await waitFor(() => expect(heading()).toBe(texts.plus.title));
    expect(backButton()).toBeTruthy();

    // And the browser's own "back" lands on the first page, where there is nothing to go back to.
    window.history.go(-2);
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
    expect(historyIndex()).toBe(0);
  });

  it("goes from the profile to the own plan and back", async () => {
    openTab(subscriber(), "/perfil");
    expect(backButton()).toBeNull();

    goToPlan();
    expect(heading()).toBe(texts.plan.title);

    pressBack();
    await waitFor(() => expect(heading()).toBe(texts.profile.title));
    // Back on the first page of the tab.
    expect(backButton()).toBeNull();
  });

  it("is still there after reloading a page that has another one behind it", async () => {
    const first = openTab(logged(), "/");
    goToProfile();
    expect(backButton()).toBeTruthy();
    first.unmount();

    // The reload keeps the entry of the history, with the number the router gave it.
    openTab(logged());

    expect(heading()).toBe(texts.profile.title);
    expect(historyIndex()).toBe(1);
    pressBack();
    expect(await screen.findByRole("button", { name: texts.home.create })).toBeTruthy();
  });

  it("does not count pages of another history: a router without the tab's history has no button", () => {
    // `renderApp` uses a memory router, which writes nothing to the history of the tab.
    window.history.replaceState(null, "", "/");
    renderApp({ path: "/perfil", account: logged() });
    expect(backButton()).toBeNull();
  });
});
