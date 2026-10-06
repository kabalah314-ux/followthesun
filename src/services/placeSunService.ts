import { clamp } from "../lib/coordinates";
import { dayStartFor } from "../lib/planningTime";
import { getSunTimes } from "../lib/solarCalculations";
import type { NormalizedSunRequest, SavedPlace, SunPlace, SunSearchResult } from "../types";
import { zoneDayKey } from "./timeService";

/**
 * placeSunService — el sol de UN lugar concreto hoy (y, si no hay, cuándo vuelve). Lo usan los
 * Guardados: «Mejor sol hoy 17:30–19:12» o «Sin sol directo hoy · Próximo: mañana 09:18».
 * Reutiliza `findBestSunPlaces` con el lugar como único candidato: nada se duplica.
 */

const MIN = 60_000;

export interface PlaceSunSummary {
  status: "sun" | "none";
  /** Ventana de sol directo más larga que queda hoy. */
  window: { start: number; end: number } | null;
  /** Si hoy no hay: primera ventana de sol de mañana. */
  next: { start: number; end: number } | null;
  /** Para abrir el detalle. */
  result: SunSearchResult | null;
  request: NormalizedSunRequest | null;
  weatherAvailable: boolean;
}

export const savedToPlace = (p: SavedPlace): SunPlace => ({
  id: p.id,
  name: p.name,
  type: p.type,
  latitude: p.latitude,
  longitude: p.longitude,
  source: "saved",
});

function longestSun(r: SunSearchResult | null, minMinutes: number) {
  if (!r) return null;
  let best: { start: number; end: number } | null = null;
  for (const w of r.windows) {
    if (w.kind !== "sun") continue;
    if (w.end - w.start < minMinutes * MIN) continue;
    if (!best || w.end - w.start > best.end - best.start) best = { start: w.start, end: w.end };
  }
  return best;
}

function firstSun(r: SunSearchResult | null, minMinutes: number) {
  if (!r) return null;
  const w = r.windows.find((x) => x.kind === "sun" && x.end - x.start >= minMinutes * MIN);
  return w ? { start: w.start, end: w.end } : null;
}

async function analyzeDay(place: SunPlace, start: number, end: number, now: number) {
  const span = Math.round((end - start) / MIN);
  // Bajo demanda: el motor de búsqueda solo se descarga cuando se abre «Guardados».
  const { findBestSunPlaces } = await import("./sunSearchService");
  const outcome = await findBestSunPlaces(
    {
      startTime: start,
      endTime: end,
      minimumSunlightMinutes: clamp(span, 15, 60),
      locationType: place.type,
      limit: 1,
    },
    { places: [place], now }
  );
  const result = outcome.results[0] ?? outcome.bestAvailable[0] ?? null;
  return { result, request: outcome.request };
}

export async function getPlaceSunSummary(place: SunPlace, now: number = Date.now()): Promise<PlaceSunSummary> {
  const today = getSunTimes(dayStartFor(now, 0), place.latitude, place.longitude);
  const start = Math.max(now, today.sunrise);
  let result: SunSearchResult | null = null;
  let request: NormalizedSunRequest | null = null;

  if (today.sunset - start > 15 * MIN) {
    ({ result, request } = await analyzeDay(place, start, today.sunset, now));
    const window = longestSun(result, 10);
    if (window) {
      return { status: "sun", window, next: null, result, request, weatherAvailable: result?.weatherAvailable ?? false };
    }
  }

  const tomorrow = getSunTimes(dayStartFor(now, 1), place.latitude, place.longitude);
  const t = await analyzeDay(place, tomorrow.sunrise, tomorrow.sunset, now);
  return {
    status: "none",
    window: null,
    next: firstSun(t.result, 15),
    result: result ?? t.result,
    request: request ?? t.request,
    weatherAvailable: (result ?? t.result)?.weatherAvailable ?? false,
  };
}

/* Caché por lugar y hora: abrir Guardados varias veces no recalcula nada. */
const cache = new Map<string, Promise<PlaceSunSummary>>();

export function getPlaceSunSummaryCached(place: SunPlace, now: number = Date.now()): Promise<PlaceSunSummary> {
  const key = `${place.id}|${zoneDayKey(now)}|${Math.floor(now / 3_600_000)}`;
  let p = cache.get(key);
  if (!p) {
    p = getPlaceSunSummary(place, now).catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}
