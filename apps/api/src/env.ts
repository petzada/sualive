/**
 * Tipos do ambiente do Worker. Bindings e vars vêm de `worker-configuration.d.ts`, gerado por
 * `pnpm types` a partir do `wrangler.jsonc` (rode de novo ao mudar o wrangler.jsonc). Segredos não
 * aparecem no wrangler.jsonc, então são declarados aqui. Em desenvolvimento e nos testes eles vêm
 * de `.dev.vars` ou da configuração do teste, nunca de arquivo versionado.
 */
export type AppEnv = Env & {
  /** Ausente = Sentry desligado. */
  SENTRY_DSN?: string;
  /** Chave secreta do Turnstile, para validar o token no servidor. Obrigatória em runtime. */
  TURNSTILE_SECRET_KEY?: string;
  /** Assina o cookie de sessão de quem não tem conta. Obrigatória em runtime. */
  SESSION_SECRET?: string;
  /** Chave de TURN da Cloudflare. Ausentes = só STUN (desenvolvimento e testes). */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  /** Login. Par ausente = aquele login fica desligado neste ambiente. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  /** Woovi. Sem os dois, a assinatura do Plus fica desligada neste ambiente. */
  WOOVI_APP_ID?: string;
  WOOVI_WEBHOOK_SECRET?: string;
};
