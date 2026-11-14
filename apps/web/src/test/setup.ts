import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("script").forEach((script) => script.remove());
  delete window.turnstile;
  localStorage.clear();
});
