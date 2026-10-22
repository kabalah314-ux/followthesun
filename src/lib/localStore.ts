/**
 * Almacén pequeño en localStorage con suscripción (apto para `useSyncExternalStore`). Si el
 * navegador no deja guardar (modo privado, almacenamiento lleno), sigue funcionando en memoria.
 */
export interface LocalStore<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** Vuelve al valor inicial y borra lo guardado. */
  reset(): void;
}

export function createLocalStore<T>(key: string, initial: T, sanitize: (v: unknown) => T): LocalStore<T> {
  const read = (): T => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? sanitize(JSON.parse(raw)) : initial;
    } catch {
      return initial;
    }
  };
  let value: T = read();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* sin almacenamiento: queda en memoria */
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      value = initial;
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* sin almacenamiento */
      }
      emit();
    },
  };
}

/** Lectura y escritura sueltas (preferencias de la interfaz que no necesitan suscripción). */
export function readLocal<T>(key: string, fallback: T, sanitize: (v: unknown) => T | null): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return sanitize(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
}
