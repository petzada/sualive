/**
 * Indicador de fala com histerese: liga acima de `on`, só desliga depois de `holdMs` abaixo de `off`.
 * Os limites são técnicos (escala do `audioLevel` do WebRTC, 0 a 1 linear), não parâmetros do produto.
 */

export interface SpeakingThresholds {
  on: number;
  off: number;
  holdMs: number;
}

export const DEFAULT_SPEAKING_THRESHOLDS: SpeakingThresholds = { on: 0.04, off: 0.02, holdMs: 500 };

/** Intervalo de amostragem do nível de áudio (ms). */
export const SPEAKING_POLL_MS = 150;

export interface SpeakingDetector {
  update(id: string, level: number, now: number): void;
  /** Desliga na hora (mudo, saída). */
  forceOff(id: string): void;
  remove(id: string): void;
  clear(): void;
}

export function createSpeakingDetector(
  onChange: (id: string, speaking: boolean) => void,
  thresholds: SpeakingThresholds = DEFAULT_SPEAKING_THRESHOLDS,
): SpeakingDetector {
  const states = new Map<string, { speaking: boolean; lastLoudAt: number }>();

  function forceOff(id: string): void {
    const state = states.get(id);
    if (state?.speaking) {
      state.speaking = false;
      onChange(id, false);
    }
  }

  return {
    update(id, level, now) {
      let state = states.get(id);
      if (!state) {
        state = { speaking: false, lastLoudAt: -Infinity };
        states.set(id, state);
      }
      if (state.speaking) {
        if (level >= thresholds.off) state.lastLoudAt = now;
        else if (now - state.lastLoudAt >= thresholds.holdMs) {
          state.speaking = false;
          onChange(id, false);
        }
      } else if (level >= thresholds.on) {
        state.speaking = true;
        state.lastLoudAt = now;
        onChange(id, true);
      }
    },
    forceOff,
    remove(id) {
      forceOff(id);
      states.delete(id);
    },
    clear() {
      states.clear();
    },
  };
}
