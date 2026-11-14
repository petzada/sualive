import { Hono } from "hono";
import type { AppEnv } from "../env";

/** `/api/shop/*`: catálogo, compra e equipar. Contratos em `@sualive/protocol` (wallet.ts). */
export const shop = new Hono<{ Bindings: AppEnv }>();
