import { Hono } from "hono";
import type { AppEnv } from "../env";

/** `/api/wallet/*`: saldos, extrato, compra de ouro e presentes. Contratos em `@sualive/protocol` (wallet.ts). */
export const wallet = new Hono<{ Bindings: AppEnv }>();
