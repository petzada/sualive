import { defineConfig } from "drizzle-kit";

// Só gera os arquivos SQL; quem aplica é o `wrangler d1 migrations apply` no CI.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
