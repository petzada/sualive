import type { VideoView } from "./types";

/**
 * Vídeo em destaque: o escolhido pela pessoa enquanto ele existir; senão a tela compartilhada mais
 * antiga; senão o vídeo mais antigo. `videos` vem na ordem em que apareceram. `null` sem vídeos.
 */
export function pickFeaturedVideo(videos: readonly VideoView[], chosen: string | null): string | null {
  if (chosen && videos.some((video) => video.id === chosen)) return chosen;
  const screen = videos.find((video) => video.kind === "screen");
  return (screen ?? videos[0])?.id ?? null;
}
