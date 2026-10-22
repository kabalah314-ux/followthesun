import { createLocalStore } from "../lib/localStore";
import type { SunPlace, SunPlaceType } from "../types";

/**
 * Historial de Mis sitios: los lugares cuya ficha se ha abierto, solo en este dispositivo.
 * Sirve para volver a lo que funcionó y para el gusto aprendido.
 */

export interface HistoryEntry {
  id: string;
  name: string;
  type: SunPlaceType;
  latitude: number;
  longitude: number;
  openedAt: number;
}

const MAX = 40;

const sanitize = (v: unknown): HistoryEntry[] =>
  Array.isArray(v)
    ? v
        .filter(
          (e): e is HistoryEntry =>
            !!e &&
            typeof e === "object" &&
            typeof (e as HistoryEntry).id === "string" &&
            typeof (e as HistoryEntry).name === "string" &&
            typeof (e as HistoryEntry).latitude === "number" &&
            typeof (e as HistoryEntry).longitude === "number" &&
            typeof (e as HistoryEntry).openedAt === "number"
        )
        .slice(0, MAX)
    : [];

export const historyStore = createLocalStore<HistoryEntry[]>("fts:history:v1", [], sanitize);

/** Apunta que se abrió la ficha de un lugar (lo sube arriba si ya estaba). */
export function recordVisit(place: Pick<SunPlace, "id" | "name" | "type" | "latitude" | "longitude">): void {
  if (place.id.startsWith("point:")) return;
  historyStore.set((list) => [
    { id: place.id, name: place.name, type: place.type, latitude: place.latitude, longitude: place.longitude, openedAt: Date.now() },
    ...list.filter((e) => e.id !== place.id),
  ].slice(0, MAX));
}

export const historyToPlace = (e: HistoryEntry): SunPlace => ({
  id: e.id,
  name: e.name,
  type: e.type,
  latitude: e.latitude,
  longitude: e.longitude,
  source: "history",
});
