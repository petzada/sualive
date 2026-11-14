import { captureException, instrumentDurableObjectWithSentry, withSentry } from "@sentry/cloudflare";
import { purgeAccessLog } from "./access/log";
import { app } from "./app";
import { runDailyBilling } from "./billing/daily";
import type { AppEnv } from "./env";
import { RoomBase } from "./room";
import { sentryOptions } from "./sentry";

// O nome exportado precisa bater com `class_name` do binding ROOM e com a migration v1.
export const Room = instrumentDurableObjectWithSentry(sentryOptions, RoomBase);
export type Room = RoomBase;

/** As duas rotinas diárias, cada uma isolada da falha da outra. */
export async function runDaily(env: AppEnv, now: number): Promise<void> {
  const results = await Promise.allSettled([runDailyBilling(env, now), purgeAccessLog(env, now)]);
  for (const result of results) {
    if (result.status === "rejected") captureException(result.reason);
  }
}

const handler = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // Rotina diária (cron em `triggers.crons` do wrangler.jsonc): o Plus e o prazo do registro de
  // acesso. Uma falha numa parte não impede a outra.
  scheduled: async (_controller, env) => {
    await runDaily(env, Date.now());
  },
} satisfies ExportedHandler<AppEnv>;

export default withSentry(sentryOptions, handler);
