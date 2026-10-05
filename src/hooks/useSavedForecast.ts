import { useEffect, useRef, useState } from "react";
import { BARCELONA, SEARCH_CONFIG } from "../config";
import { getSunTimes } from "../lib/solarCalculations";
import { createShadowEvaluator } from "../services/shadowService";
import { kindOf } from "../services/sunSearchService";
import { sunlightService } from "../services/sunlightService";
import { startOfZoneDay } from "../services/timeService";
import { urbanGeometryService } from "../services/urbanGeometryService";
import type { SavedPlace } from "../types";
import { log } from "../lib/log";

const STEP = 10 * 60_000;

export interface DayForecast {
  /** sun: sol ahora · shade: sin sol ahora pero queda · none: no queda sol hoy · night: ya es de noche */
  state: "sun" | "shade" | "none" | "night";
  /** Fin del tramo de sol actual (state = sun). */
  until?: number;
  /** Próximo tramo de sol (state = shade). */
  next?: { start: number; end: number };
  /** Minutos de sol que quedan hoy. */
  remainingMinutes: number;
}

/** Sol que queda hoy en cada favorito: sombras de edificios + nubes, cada 10 minutos. */
export function useSavedForecast(saved: SavedPlace[], enabled: boolean): Record<string, DayForecast> {
  const [out, setOut] = useState<Record<string, DayForecast>>({});
  const key = saved.map((p) => p.id).join("|");
  // La lista se lee de un ref: el efecto se relanza solo cuando cambian los ids (`key`).
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    const saved = savedRef.current;
    if (!enabled || saved.length === 0) return;
    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const sun = getSunTimes(startOfZoneDay(now), BARCELONA.lat, BARCELONA.lng);
      const result: Record<string, DayForecast> = {};
      if (now >= sun.sunset) {
        for (const p of saved) result[p.id] = { state: "night", remainingMinutes: 0 };
        setOut(result);
        return;
      }
      const start = Math.max(now, sun.sunrise);
      const times: number[] = [];
      for (let t = start; t < sun.sunset; t += STEP) times.push(t);
      const points = saved.map((p) => ({ lng: p.longitude, lat: p.latitude }));
      let geometry = null;
      try {
        geometry = await urbanGeometryService.load(points, SEARCH_CONFIG.shadowRadiusM);
      } catch (error) {
        log.warn("edificios no disponibles para favoritos", error);
        geometry = null;
      }
      if (cancelled) return;
      for (const p of saved) {
        const known = geometry !== null && geometry.known(p.longitude, p.latitude);
        const shadow = createShadowEvaluator({
          latitude: p.latitude,
          longitude: p.longitude,
          buildings: known && geometry ? geometry.buildings : null,
        });
        const series = sunlightService.buildWeatherSeries(p.latitude, p.longitude, times, now);
        const lit = sunlightService
          .evaluateSpotSeries(shadow, series)
          .map((r) => kindOf(r))
          .map((k) => k === "sun" || k === "partial");
        result[p.id] = summarize(lit, times);
      }
      if (!cancelled) setOut(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return out;
}

function summarize(lit: boolean[], times: number[]): DayForecast {
  const remainingMinutes = lit.filter(Boolean).length * (STEP / 60_000);
  const runEnd = (i: number) => {
    let j = i;
    while (j < lit.length && lit[j]) j++;
    return j < times.length ? times[j] : times[times.length - 1] + STEP;
  };
  if (lit[0]) return { state: "sun", until: runEnd(0), remainingMinutes };
  const i = lit.indexOf(true);
  if (i === -1) return { state: "none", remainingMinutes: 0 };
  return { state: "shade", next: { start: times[i], end: runEnd(i) }, remainingMinutes };
}
