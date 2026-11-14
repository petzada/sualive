import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// O pool 0.23 traz um workerd que só aceita compatibility_date até 2026-08-22, anterior à do
// wrangler.jsonc (2026-11-01). Nos testes a data é rebaixada; produção segue a do wrangler.jsonc.
const TEST_COMPATIBILITY_DATE = "2026-08-22";

export default defineConfig(async () => {
  // Migrations do D1 lidas no Node e aplicadas no D1 em memória pelos arquivos de teste que usam o banco
  // (`useD1()` em test/d1.ts). Nenhum banco de verdade.
  const migrations = await readD1Migrations("./migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityDate: TEST_COMPATIBILITY_DATE,
          // Segredos só de teste (valores falsos). Turnstile, TURN, Google, Discord e Woovi são
          // simulados nos testes com um `fetch` falso: nenhuma chamada sai para a rede.
          bindings: {
            TEST_MIGRATIONS: migrations,
            TURNSTILE_SECRET_KEY: "segredo-falso-do-turnstile-para-testes",
            SESSION_SECRET: "segredo-falso-da-sessao-para-testes-0000000000",
          },
        },
      }),
    ],
  };
});
