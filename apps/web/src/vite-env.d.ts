/// <reference types="vite/client" />

// Valores públicos por natureza (vão para o navegador). Nenhum segredo entra em VITE_*.
interface ImportMetaEnv {
  /** DSN público do projeto do front no Sentry. Vazio desliga o Sentry. */
  readonly VITE_SENTRY_DSN?: string;
  /** Token público do Cloudflare Web Analytics. Vazio desliga o beacon. */
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
  /** SHA do commit publicado. */
  readonly VITE_COMMIT_SHA?: string;
  /** "production" | "staging" | "development". */
  readonly VITE_ENVIRONMENT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
