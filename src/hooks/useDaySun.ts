import { useMemo } from "react";
import { BARCELONA } from "../config";
import { solarService } from "../services/solarService";
import { startOfZoneDay } from "../services/timeService";
import { dayStartFor } from "../lib/planningTime";
import { timelineRange } from "../lib/timelineRange";

/** Mismo reloj de pared que `now`, pero sobre el día `dayOffset` días después del de hoy. */
export function presentOnDay(now: number, dayOffset: number): number {
  return dayStartFor(now, dayOffset) + (now - startOfZoneDay(now));
}

/**
 * Inicio del día elegido (zona de Barcelona), sus horas de sol y el rango de la línea de tiempo.
 * El rango siempre arranca en la hora presente de ese día (hoy = ahora mismo): mirar hacia
 * delante es lo que importa. El detalle de hasta dónde llega está en `timelineRange`.
 */
export function useDaySun(now: number, dayOffset = 0) {
  const dayStart = dayStartFor(now, dayOffset);
  const sunTimes = useMemo(() => solarService.getSunTimes(dayStart, BARCELONA.lat, BARCELONA.lng), [dayStart]);
  const range = useMemo(() => {
    const present = presentOnDay(now, dayOffset);
    // El amanecer de mañana solo hace falta si estamos hoy y el sol ya se ha puesto.
    const nextSunrise =
      dayOffset === 0 && present >= sunTimes.sunset
        ? solarService.getSunTimes(dayStartFor(now, 1), BARCELONA.lat, BARCELONA.lng).sunrise
        : undefined;
    return timelineRange(present, sunTimes, nextSunrise);
  }, [now, dayOffset, sunTimes]);
  return { dayStart, sunTimes, range };
}
