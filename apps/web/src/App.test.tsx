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
    // The card closes the page, with only its title beside the link.
    expect(main.lastElementChild?.contains(order.at(-1)!)).toBe(true);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(texts.home.manifesto.title);
    expect(texts.home.manifesto.action).toBe("Saiba mais");
    expect(screen.queryByText("Conheça a plataforma")).toBeNull();
    expect(main.textContent).not.toContain(String(ROOM_MAX_PEOPLE));
    expect(main.textContent).not.toContain("IP");
  });

  it("keeps the Turnstile out of sight and out of the layout: no label and no reserved space", async () => {
    const { api } = installTurnstileStub();
    renderAt("/");

    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(api.render.mock.calls[0]?.[1].appearance).toBe("interaction-only");
    // Rendered in the mode that asks Cloudflare for nothing until the person acts.
    expect(api.render.mock.calls[0]?.[1].execution).toBe("execute");
    expect(api.execute).not.toHaveBeenCalled();
    const container = screen.getByTestId("turnstile");
    expect(container.getAttribute("role")).toBeNull();
    expect(container.className).toContain("empty:hidden");
    expect(container.className).not.toContain("min-h");
    // Not inside the page at all: it floats over it, straight on the body.
    const overlay = screen.getByTestId("turnstile-overlay");
    expect(container.parentElement).toBe(overlay);
    expect(overlay.parentElement).toBe(document.body);
    expect(screen.getByRole("main").contains(overlay)).toBe(false);
    expect(overlay.className.split(" ")).toContain("fixed");
    // Nothing demanded from the person: no veil, and the clicks go through to the page.
    expect(overlay.dataset.interactive).toBe("false");
    expect(overlay.className.split(" ")).toContain("pointer-events-none");
    expect(overlay.className).not.toContain("bg-");
    expect(container.className.split(" ")).toContain("invisible");
  });

  it("shows the Turnstile alone in the center of the window, over a veil, only while an interaction is demanded", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    renderAt("/");
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    const overlay = screen.getByTestId("turnstile-overlay");
    const widget = screen.getByTestId("turnstile");
    const classes = () => overlay.className.split(" ");

    // Only after the click: the check runs, and whatever Cloudflare draws is visible and clickable.
    fireEvent.click(createButton());
    expect(api.execute).toHaveBeenCalledTimes(1);
    expect(widget.className.split(" ")).not.toContain("invisible");
    expect(widget.className.split(" ")).toContain("pointer-events-auto");

    act(() => callbacks.beforeInteractive?.());
    expect(overlay.dataset.interactive).toBe("true");
    // Covers the window, centered both ways, above everything else on the page.
    for (const name of ["fixed", "inset-0", "flex", "items-center", "justify-center", "z-[2147483647]"]) {
      expect(classes()).toContain(name);
    }
    // The veil, of a theme token, takes the clicks instead of the page.
    expect(classes()).toContain("bg-stage/40");
    expect(classes()).not.toContain("pointer-events-none");
    // Only the widget: straight in the veil, with no box, border or background of ours around it.
    expect(overlay.children).toHaveLength(1);
    expect(widget.parentElement).toBe(overlay);
    expect(widget.className.split(" ")).not.toContain("invisible");
    for (const chrome of ["bg-", "rounded", "shadow", "border", "p-"]) {
      expect(widget.className.split(" ").some((name) => name.startsWith(chrome))).toBe(false);
    }
    // Never a focus trap: nothing in the veil is focusable besides what the widget brings.
    expect(overlay.getAttribute("tabindex")).toBeNull();

    // The interaction is over but there is no token yet: the veil goes, the widget stays reachable.
    act(() => callbacks.afterInteractive?.());
    expect(overlay.dataset.interactive).toBe("false");
    expect(classes()).toContain("pointer-events-none");
    expect(classes()).not.toContain("bg-stage/40");
    expect(widget.className.split(" ")).not.toContain("invisible");

    // Passing the check ends it, even if the widget does not say that the interaction is over, and
    // hides the widget even if Cloudflare leaves its "success" drawn.
    act(() => callbacks.beforeInteractive?.());
    expect(classes()).toContain("bg-stage/40");
    act(() => callbacks.token?.("token-after-interaction"));
    expect(overlay.dataset.interactive).toBe("false");
    expect(classes()).toContain("pointer-events-none");
    expect(widget.className.split(" ")).toContain("invisible");
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

  it("shows a Turnstile failure and creates the room with one click on the retry", async () => {
    const { api, callbacks } = installTurnstileStub({ pass: false });
    const { createRoom } = renderApp({ path: "/" });
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    fireEvent.click(createButton());
    act(() => void callbacks.error?.("300030"));
    expect(await screen.findByText(texts.turnstile.failed)).toBeTruthy();
    expect(createButton()).toBeTruthy(); // out of "checking"

    fireEvent.click(screen.getByRole("button", { name: texts.turnstile.retry }));
    expect(api.execute).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByText(texts.turnstile.failed)).toBeNull());
    act(() => callbacks.token?.("second-token"));
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith("second-token"));
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
