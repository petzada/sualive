import { instrumentDurableObjectWithSentry, withSentry } from "@sentry/cloudflare";
import { app } from "./app";
import type { AppEnv } from "./env";
import { RoomBase } from "./room";
import { sentryOptions } from "./sentry";

// O nome exportado precisa bater com `class_name` do binding ROOM e com a migration v1.
export const Room = instrumentDurableObjectWithSentry(sentryOptions, RoomBase);
export type Room = RoomBase;

const handler = {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<AppEnv>;

export default withSentry(sentryOptions, handler);
