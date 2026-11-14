import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AccountClientProvider } from "./components/account/AccountClient";
import { ROOM_MAX_PEOPLE } from "@sualive/config";
import type { CreateRoom } from "./lib/room";
import { makeAccountClient } from "./test/account";
import { installTurnstileStub, renderApp, TEST_TOKEN } from "./test/room";
import { texts } from "./texts";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {/* The real room client is fine here (nothing opens a room); the account is a visitor. */}
      <AccountClientProvider client={makeAccountClient()}>
        <App />
      </AccountClientProvider>
    </MemoryRouter>,
  );
}

const createButton = () => screen.getByRole("button", { name: texts.home.create });

/** `true` when `first` comes before `second` in the document. */
const isBefore = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("App", () => {
  it("renders the home page with one create button", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.home.title);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(createButton()).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("breaks the sub-headline in two lines", () => {
    renderAt("/");

    const [first, second] = texts.home.tagline;
    expect(texts.home.tagline).toHaveLength(2);
    const lines = [screen.getByText(first), screen.getByText(second)];
    // Each line is its own block inside the same paragraph.
    expect(lines.map((line) => line.className)).toEqual(["block", "block"]);
    expect(lines[0]?.parentElement).toBe(lines[1]?.parentElement);
    expect(lines[0]?.parentElement?.tagName).toBe("P");
  });

  it("orders the home page: name, sub-headline, hint, button and account line, then the manifesto card", () => {
    renderAt("/");

    const main = screen.getByRole("main");
    const order = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByText(texts.home.tagline[0]),
      screen.getByText(texts.home.tagline[1]),
      screen.getByText(texts.home.hint),
      createButton(),
      screen.getByTestId("home-account"),
      screen.getByRole("link", { name: texts.home.manifesto.action }),
    ];
    // The hint sits right under the sub-headline, as the next block of the column.
    expect(screen.getByText(texts.home.tagline[0]).parentElement?.nextElementSibling).toBe(
      screen.getByText(texts.home.hint),
    );
    order.slice(1).forEach((element, index) => expect(isBefore(order[index]!, element)).toBe(true));
    // The card closes the page, with its title and description beside the link.
    expect(main.lastElementChild?.contains(order.at(-1)!)).toBe(true);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(texts.home.manifesto.title);
    expect(screen.getByText(texts.home.manifesto.description)).toBeTruthy();
    expect(main.textContent).not.toContain(String(ROOM_MAX_PEOPLE));
    expect(main.textContent).not.toContain("IP");
  });

  it("keeps the Turnstile out of sight and out of the layout: no label and no reserved space", async () => {
    const { api } = installTurnstileStub();
    renderAt("/");

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(api.render.mock.calls[0]?.[1].appearance).toBe("interaction-only");
    const container = screen.getByTestId("turnstile");
    expect(container.getAttribute("role")).toBeNull();
    expect(container.className).toContain("empty:hidden");
    expect(container.className).not.toContain("min-h");
    // Not inside the page at all: it floats over it, straight on the body.
    const toast = screen.getByTestId("turnstile-toast");
    expect(toast.contains(container)).toBe(true);
    expect(toast.parentElement).toBe(document.body);
    expect(screen.getByRole("main").contains(toast)).toBe(false);
    expect(toast.className.split(" ")).toContain("fixed");
    // No chrome while nothing is demanded from the person.
    expect(toast.dataset.interactive).toBe("false");
    expect(toast.innerHTML).not.toContain("bg-frost");
  });

  it("shows the Turnstile as a floating notice at the top only while an interaction is demanded", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    renderAt("/");
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    const toast = screen.getByTestId("turnstile-toast");
    const box = () => screen.getByTestId("turnstile").parentElement!.className.split(" ");

    act(() => callbacks.beforeInteractive?.());
    expect(toast.dataset.interactive).toBe("true");
    // Fixed at the top center of the window, above everything, in a discreet box of the theme.
    for (const name of ["fixed", "inset-x-0", "top-4", "justify-center", "z-[1000]"]) {
      expect(toast.className.split(" ")).toContain(name);
    }
    for (const name of ["bg-frost", "rounded-nav", "shadow-outline-soft"]) expect(box()).toContain(name);

    act(() => callbacks.afterInteractive?.());
    expect(toast.dataset.interactive).toBe("false");
    expect(box()).not.toContain("bg-frost");

    // Passing the check also ends it, even if the widget does not say that the interaction is over.
    act(() => callbacks.beforeInteractive?.());
    act(() => callbacks.token?.("token-after-interaction"));
    expect(toast.dataset.interactive).toBe("false");
  });

  it("creates a room with the Turnstile token and goes to its link", async () => {
    const { api } = installTurnstileStub();
    const { createRoom } = renderApp({ path: "/" });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.click(createButton());

    await waitFor(() => expect(createRoom).toHaveBeenCalledWith(TEST_TOKEN));
    // The fake room is in the lobby: arriving there proves the navigation to /s/<code>.
    expect(await screen.findByRole("heading", { name: texts.lobby.title })).toBeTruthy();
  });

  it("waits for the Turnstile token when the button is pressed before it arrives", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    const { createRoom } = renderApp({ path: "/" });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.click(createButton());
    expect(createRoom).not.toHaveBeenCalled();
    expect(screen.getByText(texts.turnstile.checking)).toBeTruthy();

    callbacks.token?.("late-token");
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith("late-token"));
  });

  it.each(["turnstileFailed", "rateLimited", "error"] as const)(
    "explains a %s failure and asks for a new token",
    async (reason) => {
      const { api } = installTurnstileStub();
      const createRoom = vi.fn<CreateRoom>(() => Promise.resolve({ ok: false, reason }));
      renderApp({ path: "/", createRoom });
      await waitFor(() => expect(api.render).toHaveBeenCalled());

      fireEvent.click(createButton());

      expect((await screen.findByRole("alert")).textContent).toBe(texts.home.errors[reason]);
      expect(api.reset).toHaveBeenCalledWith("widget-1");
      expect(createButton()).toBeTruthy();
    },
  );

  it("treats a thrown createRoom as a generic error", async () => {
    const { api } = installTurnstileStub();
    const createRoom = vi.fn<CreateRoom>(() => Promise.reject(new Error("network")));
    renderApp({ path: "/", createRoom });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.click(createButton());

    expect((await screen.findByRole("alert")).textContent).toBe(texts.home.errors.error);
  });

  it("shows a Turnstile failure and lets the person ask for a new check", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    renderApp({ path: "/" });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    callbacks.error?.();
    expect(await screen.findByText(texts.turnstile.failed)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: texts.turnstile.retry }));
    expect(api.reset).toHaveBeenCalledWith("widget-1");
    await waitFor(() => expect(screen.queryByText(texts.turnstile.failed)).toBeNull());
  });

  it("shows the error page with a way back for unknown routes", () => {
    renderAt("/rota-que-nao-existe");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.error.notFound.title);
    expect(screen.getByRole("link", { name: texts.error.backHome }).getAttribute("href")).toBe("/");
  });

  it("shows the error page when ?debug=erro is used outside production", () => {
    vi.stubEnv("VITE_ENVIRONMENT", "staging");
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderAt("/?debug=erro");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.error.crash.title);
    expect(screen.getByRole("link", { name: texts.error.backHome })).toBeTruthy();
    expect(screen.queryByText(texts.home.tagline[0])).toBeNull();
  });

  it("ignores ?debug=erro in production", () => {
    vi.stubEnv("VITE_ENVIRONMENT", "production");

    renderAt("/?debug=erro");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.home.title);
    expect(screen.queryByText(texts.error.crash.title)).toBeNull();
  });
});
