import { useMemo } from "react";
import { BARCELONA } from "../config";
import { solarService } from "../services/solarService";
import { startOfZoneDay } from "../services/timeService";

/** Inicio del día (zona de Barcelona), horas de sol y rango de la línea de tiempo. */
export function useDaySun(now: number) {
  // Número primitivo: es idéntico durante todo el día, así que los memos solo cambian a medianoche.
  const dayStart = startOfZoneDay(now);
  const sunTimes = useMemo(() => solarService.getSunTimes(dayStart, BARCELONA.lat, BARCELONA.lng), [dayStart]);
  const range = useMemo(() => ({ start: sunTimes.sunrise, end: sunTimes.sunset }), [sunTimes]);
  return { dayStart, sunTimes, range };
}
