/**
 * Tipos do ambiente do Worker. Bindings e vars vêm de `worker-configuration.d.ts`, gerado por
 * `pnpm types` a partir do `wrangler.jsonc` (rode de novo ao mudar o wrangler.jsonc). Segredos não
 * aparecem no wrangler.jsonc, então são declarados aqui.
 */
export type AppEnv = Env & {
  /** Segredo do Worker (`wrangler secret put SENTRY_DSN`). Ausente = Sentry desligado. */
  SENTRY_DSN?: string;
};
