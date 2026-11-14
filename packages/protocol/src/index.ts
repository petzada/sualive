/**
 * Contratos validados entre o front e a API. As mensagens do WebSocket da sala entram aqui
 * a partir da entrega 1; nenhuma mensagem é aceita sem passar por um esquema deste pacote.
 */
import { z } from "zod";

export const environmentSchema = z.enum(["production", "staging", "development"]);

/** Resposta de `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  /** SHA do commit publicado; "dev" fora do CI. */
  commit: z.string().min(1),
  environment: environmentSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
