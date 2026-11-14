import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Teste de fumaça: o produto real (Worker + Durable Object + front construído) no simulador do
 * Wrangler, sem banco externo nem Docker. Rode `pnpm build` antes (o `pnpm e2e` da raiz já faz).
 */

const here = fileURLToPath(new URL(".", import.meta.url));
const apiDir = resolve(here, "../apps/api");
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Segredos de desenvolvimento lidos de `apps/api/.dev.vars.example` (só valores de TESTE, públicos:
 * a chave secreta do Turnstile que sempre passa e um SESSION_SECRET falso). Sem TURN: só STUN.
 */
function devVars(): string[] {
  const text = readFileSync(join(apiDir, ".dev.vars.example"), "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return `${line.slice(0, index)}:${line.slice(index + 1)}`;
    });
}

// Estado do simulador zerado a cada execução: nenhuma sala sobra de uma rodada anterior. Os
// processos de teste também leem este arquivo; só o principal (que sobe o servidor) apaga.
const persistDir = join(here, ".wrangler", "e2e-state");
if (!process.env.TEST_WORKER_INDEX) rmSync(persistDir, { recursive: true, force: true });

const wranglerArgs = [
  "wrangler dev",
  "--local",
  `--port ${PORT}`,
  "--ip 127.0.0.1",
  `--persist-to "${persistDir}"`,
  "--show-interactive-dev-session=false",
  "--log-level warn",
  ...devVars().map((pair) => `--var "${pair}"`),
];

export default defineConfig({
  testDir: "tests",
  // Uma sala por teste e o mesmo IP para todos: em série, sem disputar o limite por IP.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["camera", "microphone"],
        launchOptions: {
          args: [
            // Câmera e microfone falsos, sem pedir permissão.
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            // Candidatos ICE com o IP da máquina em vez de nomes mDNS (que o runner do CI pode não
            // resolver): os dois contextos estão na mesma máquina.
            "--disable-features=WebRtcHideLocalIpsWithMdns",
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm exec ${wranglerArgs.join(" ")}`,
    cwd: apiDir,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
