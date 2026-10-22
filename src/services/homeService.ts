import { createLocalStore } from "../lib/localStore";
import type { SunPlace } from "../types";

/** «Mi casa o balcón»: un punto guardado con su sol por meses (solo en este dispositivo). */
export interface HomePoint {
  lat: number;
  lng: number;
  name: string;
  savedAt: number;
}

const sanitize = (v: unknown): HomePoint | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as HomePoint;
  return typeof o.lat === "number" && typeof o.lng === "number" && typeof o.name === "string"
    ? { lat: o.lat, lng: o.lng, name: o.name, savedAt: Number(o.savedAt) || 0 }
    : null;
};

export const homeStore = createLocalStore<HomePoint | null>("fts:home:v1", null, sanitize);

export const homeToPlace = (h: HomePoint): SunPlace => ({
  id: `point:${h.lat.toFixed(5)},${h.lng.toFixed(5)}`,
  name: h.name,
  type: "open_space",
  latitude: h.lat,
  longitude: h.lng,
  source: "home",
  metadata: { generated: true },
});
