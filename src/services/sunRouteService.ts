import { distanceMeters } from "../lib/coordinates";
import { planSunRoute, ROUTE_DEFAULTS, valuesFromWindows } from "../lib/sunRoute";
import type { LngLat, NormalizedSunRequest, SearchProgress, SunPlaceType, SunSearchResult } from "../types";
import { minutesForStraightMeters } from "./routeService";

/**
 * La ruta del sol con datos reales: el motor analiza los ~30 mejores lugares cercanos en la franja
 * y la programación dinámica (`lib/sunRoute.ts`) encadena 2–4 de ellos.
 */

const MIN = 60_000;
const SLOT = 15 * MIN;

export interface RouteRequest {
  origin: LngLat;
  start: number;
  end: number;
  mode: "sun" | "shade";
  /** Paseo máximo entre paradas (min). */
  maxWalk: number;
  signal?: AbortSignal;
  onProgress?(p: SearchProgress): void;
}

export interface RouteStopResult {
  result: SunSearchResult;
  start: number;
  end: number;
  /** Minutos de sol (o de sombra) en la parada. */
  minutes: number;
  /** Minutos a pie desde la parada anterior (o desde el origen). */
  walkBefore: number;
}

export interface PlannedRoute {
  stops: RouteStopResult[];
  sunMinutes: number;
  walkMinutes: number;
  request: NormalizedSunRequest;
  mode: "sun" | "shade";
  /** Una sola parada: ningún cambio de sitio mejoraba la tarde. */
  single: boolean;
}

const SUN_TYPES: SunPlaceType[] = ["park", "square", "open_space", "viewpoint", "beach", "playground"];
const SHADE_TYPES: SunPlaceType[] = ["park", "square", "open_space", "playground"];

export async function planRoute(r: RouteRequest): Promise<PlannedRoute | null> {
  const { findBestSunPlaces } = await import("./sunSearchService");
  const outcome = await findBestSunPlaces(
    {
      startTime: r.start,
      endTime: r.end,
      minimumSunlightMinutes: 30,
      maximumWalkingMinutes: 30,
      origin: r.origin,
      locationType: "any",
      locationTypes: r.mode === "shade" ? SHADE_TYPES : SUN_TYPES,
      intent: r.mode === "shade" ? "shade" : "sun",
      preference: "maximum_sun",
      limit: 30,
    },
    { signal: r.signal, onProgress: r.onProgress, maxCandidates: 60, maxSamplePoints: 4 }
  );
  const seen = new Set<string>();
  const pool: SunSearchResult[] = [];
  for (const res of [...outcome.results, ...outcome.bestAvailable]) {
    if (seen.has(res.placeId)) continue;
    seen.add(res.placeId);
    pool.push(res);
  }
  if (pool.length === 0) return null;
  const start = outcome.request.startTime;
  const slots = Math.max(1, Math.floor((outcome.request.endTime - start) / SLOT));
  const cands = pool.slice(0, 30).map((res) => ({
    id: res.placeId,
    lat: res.spot.latitude,
    lng: res.spot.longitude,
    values: valuesFromWindows(res.windows, start, slots, SLOT, r.mode),
  }));
  const walkMinutes = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    minutesForStraightMeters(distanceMeters(a.lng, a.lat, b.lng, b.lat));
  const params = { ...ROUTE_DEFAULTS, maxWalkMinutes: r.maxWalk, walkMinutes, origin: { lat: r.origin.lat, lng: r.origin.lng } };
  const plan = planSunRoute(cands, params) ?? planSunRoute(cands, { ...params, minStops: 1 });
  if (!plan) return null;
  return {
    stops: plan.stops.map((s) => ({
      result: pool[s.index],
      start: start + s.startSlot * SLOT,
      end: start + s.endSlot * SLOT,
      minutes: s.minutes,
      walkBefore: Math.round(s.walkBefore),
    })),
    sunMinutes: plan.sunMinutes,
    walkMinutes: plan.walkMinutes,
    request: outcome.request,
    mode: r.mode,
    single: plan.stops.length === 1,
  };
}
