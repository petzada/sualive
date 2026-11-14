import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { texts } from "./texts";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("renders the home page copy from the texts file", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(texts.home.title);
    expect(screen.getByText(texts.home.tagline)).toBeTruthy();
    expect(screen.getByText(texts.home.notice)).toBeTruthy();
    expect(screen.getByText(texts.home.noticeDetail)).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
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
