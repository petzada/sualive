import { describe, expect, it } from "vitest";
import { injectAnalyticsBeacon } from "./analytics";

describe("injectAnalyticsBeacon", () => {
  it("injects nothing without a token", () => {
    injectAnalyticsBeacon(undefined);
    injectAnalyticsBeacon("");

    expect(document.head.querySelector("script")).toBeNull();
  });

  it("injects the beacon with the token", () => {
    injectAnalyticsBeacon("public-token");

    const script = document.head.querySelector("script");
    expect(script?.getAttribute("src")).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(script?.getAttribute("data-cf-beacon")).toBe('{"token":"public-token"}');
  });
});
