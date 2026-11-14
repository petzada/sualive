import { PLUS_VIDEO_QUALITY, PLUS_VIDEOS_PER_PERSON } from "@sualive/config";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeAccountState, makeUser } from "../test/account";
import { renderApp } from "../test/room";
import { texts } from "../texts";

// `hidden`: while the balloon is open, the page behind it is hidden from assistive technology.
const heading = () => screen.getByRole("heading", { level: 1, hidden: true }).textContent;
const logged = (user = makeUser()) => makeAccountState({ user });
const opener = () => screen.getByRole("button", { name: texts.welcome.plansOpen });
/** A real click: the browser focuses the button before the click reaches it. */
const press = (button: HTMLElement) => {
  act(() => button.focus());
  fireEvent.click(button);
};
const balloon = () => screen.queryByRole("dialog", { name: texts.welcome.plans.title });

describe("page after the first access", () => {
  it("sends a visitor to the login, with the way back", () => {
    const { accountActions } = renderApp({ path: "/bem-vindo" });
    expect(heading()).toBe(texts.login.title);
    expect(accountActions.loginUrl).toHaveBeenCalledWith("google", "/bem-vindo");
  });

  it("sends who has not finished the first access to it", () => {
    renderApp({ path: "/bem-vindo", account: logged(makeUser({ onboarded: false, handle: null })) });
    expect(heading()).toBe(texts.onboarding.title);
  });

  it("welcomes the person by nickname and @handle, in the frame of the first access", () => {
    renderApp({ path: "/bem-vindo", account: logged() });

    expect(heading()).toBe(texts.welcome.title("Marina"));
    expect(screen.getByTestId("welcome-handle").textContent).toContain("@marina");
    // No name of the product at the top and no account links in the corner.
    expect(screen.queryByRole("banner")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    // Centered, with the legal pages centered at the bottom.
    const main = screen.getByRole("main");
    expect(main.className).toContain("items-center");
    expect(main.className).toContain("justify-center");
    const footer = screen.getByRole("contentinfo");
    expect(footer.className).toContain("justify-center");
    expect(within(footer).getByRole("link", { name: texts.nav.terms }).getAttribute("href")).toBe("/termos");
    expect(within(footer).getByRole("link", { name: texts.nav.privacy }).getAttribute("href")).toBe(
      "/privacidade",
    );
  });

  it("invites to the manifesto as a text link, and has one filled button, for the plans", () => {
    renderApp({ path: "/bem-vindo", account: logged() });

    const manifesto = screen.getByRole("link", { name: texts.welcome.manifesto.link });
    expect(manifesto.getAttribute("href")).toBe("/manifesto");
    expect(manifesto.className).toContain("text-link");
    expect(manifesto.className).not.toContain("bg-accent");
    expect(manifesto.parentElement?.textContent).toBe(
      `${texts.welcome.manifesto.before}${texts.welcome.manifesto.link}${texts.welcome.manifesto.after}`,
    );

    expect(screen.getAllByRole("button")).toEqual([opener()]);
    expect(manifesto.compareDocumentPosition(opener()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A way to go on without looking at the plans.
    expect(screen.getByRole("link", { name: texts.welcome.home }).getAttribute("href")).toBe("/");
  });

  it("opens a balloon instead of leaving the page, with the benefits and the way to the plans", async () => {
    renderApp({ path: "/bem-vindo", account: logged() });
    expect(balloon()).toBeNull();

    press(opener());

    const dialog = balloon()!;
    expect(dialog).toBeTruthy();
    // Still on the same page.
    expect(heading()).toBe(texts.welcome.title("Marina"));
    // The focus goes into the balloon.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const inside = within(dialog);
    expect(inside.getByRole("heading", { name: texts.welcome.plans.title })).toBeTruthy();
    const items = inside.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      `Vídeo em ${PLUS_VIDEO_QUALITY.height}p a ${PLUS_VIDEO_QUALITY.frameRate} fps`,
      `${PLUS_VIDEOS_PER_PERSON} vídeos ao mesmo tempo`,
      "Link fixo em /@marina",
      "Tema de sala",
      "Selo ao lado do nome",
    ]);
    // Each benefit has its check.
    for (const item of items) expect(item.querySelector("svg")).toBeTruthy();
    // The close button sits in the header, after the title.
    const close = inside.getByRole("button", { name: texts.common.close });
    const title = inside.getByRole("heading", { name: texts.welcome.plans.title });
    expect(title.parentElement).toBe(close.parentElement);
    expect(title.nextElementSibling).toBe(close);

    const plans = inside.getByRole("link", { name: texts.welcome.plans.action });
    expect(plans.getAttribute("href")).toBe("/plus");
    expect(plans.className).toContain("bg-accent");
    fireEvent.click(plans);
    expect(heading()).toBe(texts.plus.title);
  });

  it("closes the balloon with the X and gives the focus back to the button", async () => {
    renderApp({ path: "/bem-vindo", account: logged() });
    press(opener());
    const dialog = balloon()!;
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.click(within(dialog).getByRole("button", { name: texts.common.close }));

    await waitFor(() => expect(balloon()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });

  it("closes the balloon with Escape and gives the focus back to the button", async () => {
    renderApp({ path: "/bem-vindo", account: logged() });
    press(opener());
    const dialog = balloon()!;
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyUp(document.activeElement!, { key: "Escape" });

    await waitFor(() => expect(balloon()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener()));
  });
});
