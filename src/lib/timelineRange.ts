import type { SunTimes } from "./solarCalculations";
import { dayStartFor } from "./planningTime";
import { startOfZoneDay } from "../services/timeService";

/**
 * Franja visible de la línea de tiempo.
 *
 * Siempre arranca en la hora presente (a la izquierda de todo) y llega hasta la puesta de sol:
 * lo que importa es mirar hacia delante. Si el sol ya se ha puesto, la franja continúa hasta la
 * salida del día siguiente (`nextSunrise`, solo cuando el amanecer cae en el día siguiente al que
 * se está mirando). Cuando no hay luz que seguir en esa jornada (otro día ya anochecido), se
 * enseña su día completo, de la salida a la puesta.
 */
export function timelineRange(
  present: number,
  sun: Pick<SunTimes, "sunrise" | "sunset">,
  nextSunrise?: number
): { start: number; end: number } {
  if (present < sun.sunset) return { start: present, end: sun.sunset };
  if (nextSunrise != null) return { start: present, end: nextSunrise };
  return { start: sun.sunrise, end: sun.sunset };
}

/** Mismo reloj de pared que `now`, pero sobre el día `dayOffset` días después del de hoy. */
export function presentOnDay(now: number, dayOffset: number): number {
  return dayStartFor(now, dayOffset) + (now - startOfZoneDay(now));
}
