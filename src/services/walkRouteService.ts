import { TtlCache } from "../lib/cache";
import { fetchWithTimeout } from "../lib/net";
import type { LngLatPair } from "../lib/terraceShape";
import type { LngLat } from "../types";

/**
 * Rutas a pie con alternativas: OSRM del servidor público de FOSSGIS (perfil a pie, datos
 * © OpenStreetMap). Solo se piden al pulsar el botón, con caché de una semana por origen y destino.
 */

const OSRM_FOOT = "https://routing.openstreetmap.de/routed-foot/route/v1/driving/";
const OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike/route/v1/driving/";
export const WALK_ROUTE_ATTRIBUTION = "OSRM · FOSSGIS · © OpenStreetMap";

export interface WalkRoute {
  coords: LngLatPair[];
  distanceM: number;
}

const cache = new TtlCache<WalkRoute[]>({ namespace: "fts:walk-routes", ttlMs: 7 * 24 * 3_600_000, version: 1, persist: false });

export async function walkRoutes(from: LngLat, to: LngLat): Promise<WalkRoute[]> {
  const key = [from.lng, from.lat, to.lng, to.lat].map((v) => v.toFixed(4)).join(",");
  const hit = cache.get(key);
  if (hit) return hit.value;
  const url = `${OSRM_FOOT}${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}?overview=full&geometries=geojson&alternatives=3&steps=false`;
  const res = await fetchWithTimeout(url, {}, 12_000);
  const json = (await res.json()) as { code?: string; routes?: Array<{ distance?: number; geometry?: { coordinates?: LngLatPair[] } }> };
  if (json.code !== "Ok" || !Array.isArray(json.routes)) throw new Error("Sin rutas a pie");
  const routes = json.routes
    .map((r) => ({ coords: r.geometry?.coordinates ?? [], distanceM: r.distance ?? 0 }))
    .filter((r) => r.coords.length >= 2 && r.distanceM > 0);
  cache.set(key, routes);
  return routes;
}

const through = new TtlCache<WalkRoute>({ namespace: "fts:route-through", ttlMs: 7 * 24 * 3_600_000, version: 1, persist: false });

/** Ruta a pie o en bici que pasa por todos los puntos en orden (circuitos y vueltas para hacer deporte). */
export async function routeThrough(points: readonly LngLatPair[], profile: "foot" | "bike"): Promise<WalkRoute> {
  if (points.length < 2) throw new Error("Hacen falta dos puntos");
  const coords = points.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(";");
  const key = `${profile}:${coords}`;
  const hit = through.get(key);
  if (hit) return hit.value;
  const base = profile === "bike" ? OSRM_BIKE : OSRM_FOOT;
  const res = await fetchWithTimeout(`${base}${coords}?overview=full&geometries=geojson&steps=false`, {}, 15_000);
  const json = (await res.json()) as { code?: string; routes?: Array<{ distance?: number; geometry?: { coordinates?: LngLatPair[] } }> };
  const r = json.code === "Ok" ? json.routes?.[0] : undefined;
  const route = { coords: r?.geometry?.coordinates ?? [], distanceM: r?.distance ?? 0 };
  if (route.coords.length < 2 || route.distanceM <= 0) throw new Error("Sin ruta");
  through.set(key, route);
  return route;
}
