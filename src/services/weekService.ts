import { dayStartFor } from "../lib/planningTime";
import { getSunTimes } from "../lib/solarCalculations";
import { bestMoment, hourCells, sunMinutesOf, WEEK_HOURS, type HourCell } from "../lib/weekGrid";
import type { SunPlace, SunWindow } from "../types";

/**
 * «Esta semana» de un lugar: los próximos 7 días con su luz hora a hora y el mejor momento de
 * cada día. Más allá de la previsión (≈ 2 días) solo cuentan el sol y los edificios: «sol posible».
 */

export interface WeekDay {
  dayOffset: number;
  dayStart: number;
  cells: HourCell[];
  best: { start: number; end: number } | null;
  sunMinutes: number;
  /** Hay previsión de nubes para ese día. */
  forecast: boolean;
}

export async function analyzeWeek(
  place: SunPlace,
  now: number,
  onDay: (d: WeekDay) => void,
  signal?: AbortSignal
): Promise<WeekDay[]> {
  const { findBestSunPlaces } = await import("./sunSearchService");
  const out: WeekDay[] = [];
  for (let off = 0; off < 7; off++) {
    if (signal?.aborted) break;
    const dayStart = dayStartFor(now, off);
    const sun = getSunTimes(dayStart, place.latitude, place.longitude);
    let windows: SunWindow[] = [];
    try {
      const outcome = await findBestSunPlaces(
        {
          startTime: sun.sunrise,
          endTime: sun.sunset,
          minimumSunlightMinutes: 30,
          locationType: "any",
          locationTypes: [place.type],
          limit: 1,
        },
        { places: [place], now, signal, maxSamplePoints: 6 }
      );
      const r = outcome.results[0] ?? outcome.bestAvailable[0] ?? null;
      windows = r?.windows ?? [];
    } catch (e) {
      if (signal?.aborted) break;
      void e;
    }
    const day: WeekDay = {
      dayOffset: off,
      dayStart,
      cells: hourCells(windows, dayStart, WEEK_HOURS),
      best: bestMoment(windows),
      sunMinutes: sunMinutesOf(windows),
      forecast: windows.some((w) => (w.kind === "sun" || w.kind === "partial") && !w.unverified) || windows.some((w) => w.kind === "cloud"),
    };
    out.push(day);
    onDay(day);
  }
  return out;
}
