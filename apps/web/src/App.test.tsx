import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CreateRoom } from "./lib/room";
import { installTurnstileStub, renderApp, TEST_TOKEN } from "./test/room";
import { texts } from "./texts";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const createButton = () => screen.getByRole("button", { name: texts.home.create });

describe("App", () => {
  it("renders the home page with one create button and the IP warning", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.home.title);
    expect(screen.getByText(texts.home.tagline)).toBeTruthy();
    expect(screen.getByText(texts.ipNotice.message, { exact: false })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(createButton()).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
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
    expect(screen.queryByText(texts.home.tagline)).toBeNull();
  });

  it("ignores ?debug=erro in production", () => {
    vi.stubEnv("VITE_ENVIRONMENT", "production");

    renderAt("/?debug=erro");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.home.title);
    expect(screen.queryByText(texts.error.crash.title)).toBeNull();
  });
});
