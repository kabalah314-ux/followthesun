import type { SavedPlace, SunPlace } from "../types";
import { log } from "../lib/log";

/**
 * savedPlacesService — lugares favoritos («sitios soleados»), solo en este navegador.
 *
 * Todavía no hay cuentas ni backend: se guardan en localStorage. La interfaz es la que usará un
 * almacenamiento remoto cuando existan usuarios (`list`, `isSaved`, `toggle`).
 */

const KEY = "fts:saved-places:v1";
const MAX = 50;

const valid = (v: unknown): v is SavedPlace => {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.type === "string" &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    typeof p.savedAt === "number"
  );
};

function read(): SavedPlace[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch (error) {
    log.warn("favoritos ilegibles, se empieza con la lista vacía", error);
    return [];
  }
}

class SavedPlacesService {
  private cache: SavedPlace[] = read();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Referencia estable entre cambios (apta para `useSyncExternalStore`). */
  getSnapshot = (): SavedPlace[] => this.cache;

  private commit(next: SavedPlace[]) {
    this.cache = next;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (error) {
      // Almacenamiento lleno o desactivado: los favoritos siguen funcionando en memoria.
      log.warn("no se pudieron guardar los favoritos", error);
    }
    this.listeners.forEach((l) => l());
  }

  list = (): SavedPlace[] => this.cache;

  isSaved = (id: string): boolean => this.cache.some((p) => p.id === id);

  /** Guarda o quita un lugar. Devuelve true si queda guardado. */
  toggle(place: Pick<SunPlace, "id" | "name" | "type" | "latitude" | "longitude">): boolean {
    if (this.isSaved(place.id)) {
      this.commit(this.cache.filter((p) => p.id !== place.id));
      return false;
    }
    const entry: SavedPlace = {
      id: place.id,
      name: place.name,
      type: place.type,
      latitude: place.latitude,
      longitude: place.longitude,
      savedAt: Date.now(),
    };
    this.commit([entry, ...this.cache].slice(0, MAX));
    return true;
  }
}

export const savedPlacesService = new SavedPlacesService();
