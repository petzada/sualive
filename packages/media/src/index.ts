/**
 * Única parte do front que conhece WebRTC. Expõe uma interface única (`MediaSession`) para os
 * dois caminhos de mídia; nesta entrega só existe a malha direta.
 */
import { detectMediaCapabilities, type NavigatorLike } from "./capabilities";
import { browserEnvironment } from "./env";
import { createDevicePreviewWith } from "./preview";
import { createMeshSession } from "./session";
import type { CreateMediaSession, DevicePreview, MediaCapabilities } from "./types";

export type * from "./types";

export const createMediaSession: CreateMediaSession = (options) =>
  createMeshSession(options, browserEnvironment());

export function createDevicePreview(): Promise<DevicePreview> {
  return createDevicePreviewWith(browserEnvironment());
}

export function getMediaCapabilities(): MediaCapabilities {
  return detectMediaCapabilities(globalThis.navigator as NavigatorLike | undefined);
}
