import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

/**
 * Chame no topo de todo arquivo de teste que usa o D1: aplica as migrations no D1 em memória
 * antes dos testes do arquivo (é idempotente). Não é um `setupFiles` global de propósito: um
 * arquivo de setup carrega módulos antes dos `vi.mock` de cada teste.
 */
export function useD1(): void {
  beforeAll(async () => {
    const { DB, TEST_MIGRATIONS } = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };
    await applyD1Migrations(DB, TEST_MIGRATIONS);
  });
}
