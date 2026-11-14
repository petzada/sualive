import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Empty prefix: also reads build-only variables that are never exposed to the browser.
  const env = loadEnv(mode, ".", "");
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN;

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Source maps are uploaded only where the build has the token (CI).
      ...(sentryAuthToken
        ? sentryVitePlugin({
            org: "marct",
            project: "sualive-web",
            authToken: sentryAuthToken,
            release: { name: env.VITE_COMMIT_SHA || undefined },
            telemetry: false,
          })
        : []),
    ],
    build: { sourcemap: true },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["src/test/setup.ts"],
      restoreMocks: true,
      unstubEnvs: true,
    },
  };
});
