import { DurableObject } from "cloudflare:workers";
import type { AppEnv } from "./env";

/** Um Durable Object por sala. Vazio na entrega 0; a lógica da sala chega na entrega 1. */
export class RoomBase extends DurableObject<AppEnv> {}
