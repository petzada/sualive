/**
 * Única parte do front que conhece WebRTC. Expõe uma interface única (`MediaSession`) para os
 * dois caminhos de mídia; nesta entrega só existe a malha direta.
 */
export type * from "./types";

// Implementação (tarefa de mídia da entrega 1):
//   export const createMediaSession: CreateMediaSession
//   export function createDevicePreview(): Promise<DevicePreview>
//   export function getMediaCapabilities(): MediaCapabilities
