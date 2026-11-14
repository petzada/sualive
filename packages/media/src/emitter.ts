type Handler = (...args: never[]) => void;

export interface Emitter<Events extends { [K in keyof Events]: Handler }> {
  on<E extends keyof Events>(event: E, handler: Events[E]): () => void;
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void;
  clear(): void;
}

function report(error: unknown): void {
  const reportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (reportError) reportError(error);
  else console.error(error);
}

export function createEmitter<Events extends { [K in keyof Events]: Handler }>(): Emitter<Events> {
  const handlers = new Map<keyof Events, Set<Handler>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      return () => {
        handlers.get(event)?.delete(handler);
      };
    },
    emit(event, ...args) {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        // Um erro de quem escuta não pode quebrar a mídia.
        try {
          (handler as (...a: Parameters<Events[typeof event]>) => void)(...args);
        } catch (error) {
          report(error);
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
