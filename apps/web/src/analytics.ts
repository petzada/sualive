const BEACON_URL = "https://static.cloudflareinsights.com/beacon.min.js";

/** Injects the Cloudflare Web Analytics beacon only when a token was provided at build time. */
export function injectAnalyticsBeacon(token: string | undefined): void {
  if (!token) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = BEACON_URL;
  script.dataset.cfBeacon = JSON.stringify({ token });
  document.head.append(script);
}
