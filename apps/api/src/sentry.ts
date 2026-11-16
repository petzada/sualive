import type { CloudflareOptions } from "@sentry/cloudflare";
import type { AppEnv } from "./env";

/**
 * Opções do Sentry a partir do ambiente. Sem `SENTRY_DSN`, o SDK fica desligado.
 *
 * Por padrão o SDK anexa ao evento o corpo das requisições e o IP de quem chamou. O corpo do checkout
 * e do webhook da Woovi traz CPF e nome, que só podem ir para a Woovi; o IP já tem o registro de
 * acesso com prazo próprio. Os dois ficam desligados aqui.
 */
export function sentryOptions(env: AppEnv): CloudflareOptions {
  return {
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    release: env.COMMIT_SHA,
    environment: env.ENVIRONMENT,
    dataCollection: { httpBodies: [], userInfo: false },
  };
}
