import { getSunTimes } from "../lib/solarCalculations";
import { sunMinutesOf } from "../lib/weekGrid";
import type { SunPlace } from "../types";
import { getZoneParts, startOfZoneDay } from "./timeService";

/**
 * «Mi casa o balcón»: horas de sol directo de un punto el día 21 de cada mes (solsticios y
 * equinoccios caen cerca), solo con el sol y los edificios: es una orientación para todo el año,
 * no una previsión.
 */

export interface MonthSun {
  /** 1–12. */
  month: number;
  dayStart: number;
  sunMinutes: number;
  daylightMinutes: number;
}

const MIN = 60_000;

/** El día 21 de cada mes del año en curso (00:00 de Barcelona). */
export function monthDays(now: number): Array<{ month: number; dayStart: number }> {
  const year = getZoneParts(now).year;
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    dayStart: startOfZoneDay(Date.UTC(year, i, 21, 12)),
  }));
}

export async function analyzeYear(
  place: SunPlace,
  now: number,
  onMonth: (m: MonthSun) => void,
  signal?: AbortSignal
): Promise<MonthSun[]> {
  const { findBestSunPlaces } = await import("./sunSearchService");
  const out: MonthSun[] = [];
  for (const { month, dayStart } of monthDays(now)) {
    if (signal?.aborted) break;
    const sun = getSunTimes(dayStart, place.latitude, place.longitude);
    // El motor analiza como mucho 14 h seguidas: en verano, en dos mitades.
    const noon = Math.round((sun.sunrise + sun.sunset) / 2);
    let minutes = 0;
    for (const [a, b] of [
      [sun.sunrise, noon],
      [noon, sun.sunset],
    ] as const) {
      try {
        const outcome = await findBestSunPlaces(
          { startTime: a, endTime: b, minimumSunlightMinutes: 10, locationType: "any", locationTypes: [place.type], limit: 1 },
          // Fuera de la previsión el motor cuenta solo el sol y los edificios («sol posible»).
          { places: [place], now, signal, maxSamplePoints: 1 }
        );
        const r = outcome.results[0] ?? outcome.bestAvailable[0] ?? null;
        minutes += r ? sunMinutesOf(r.windows) : 0;
      } catch {
        if (signal?.aborted) break;
      }
    }
    const m: MonthSun = { month, dayStart, sunMinutes: minutes, daylightMinutes: Math.round((sun.sunset - sun.sunrise) / MIN) };
    out.push(m);
    onMonth(m);
  }
  return out;
}
