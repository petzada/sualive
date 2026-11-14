/**
 * Único lugar para valores numéricos do produto (limites, preços, prazos).
 * Cada entrega acrescenta aqui os parâmetros que passa a usar; nada fica espalhado pelo código.
 */

export const APP_NAME = "sualive";

export const ENVIRONMENTS = ["production", "staging", "development"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];
