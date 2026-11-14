import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// O pool 0.23 traz um workerd que só aceita compatibility_date até 2026-08-22, anterior à do
// wrangler.jsonc (2026-11-01). Nos testes a data é rebaixada; produção segue a do wrangler.jsonc.
const TEST_COMPATIBILITY_DATE = "2026-08-22";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        compatibilityDate: TEST_COMPATIBILITY_DATE,
        // Segredos só de teste (valores falsos). O Turnstile e a API de TURN são simulados nos
        // testes com um `fetch` falso: nenhuma chamada sai para a rede.
        bindings: {
          TURNSTILE_SECRET_KEY: "segredo-falso-do-turnstile-para-testes",
          SESSION_SECRET: "segredo-falso-da-sessao-para-testes-0000000000",
        },
      },
    }),
  ],
});
