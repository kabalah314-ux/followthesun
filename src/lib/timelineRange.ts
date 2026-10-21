import type { SunTimes } from "./solarCalculations";
import { dayStartFor } from "./planningTime";
import { startOfZoneDay } from "../services/timeService";

/** Horas del sol que necesita la línea de tiempo. */
export type TimelineSun = Pick<SunTimes, "sunrise" | "sunset" | "goldenMorningEnd" | "goldenEveningStart">;

export interface TimelineDay {
  start: number;
  end: number;
  /** Horas del sol del día que se está enseñando (hoy, otro día o, de noche, mañana). */
  sun: TimelineSun;
  /** De noche, la línea de tiempo enseña el día siguiente. */
  nextDay: boolean;
}

/** Crepúsculo que se enseña antes del amanecer y después de la puesta. */
export const TWILIGHT_MARGIN_MS = 30 * 60_000;

/**
 * Franja visible de la línea de tiempo: el día solar completo, del amanecer a la puesta, con media
 * hora de crepúsculo a cada lado. Lo ya pasado sigue siendo navegable (la interfaz lo atenúa).
 *
 * De noche (pasada la puesta y su crepúsculo), si se da `next`, se enseña el día siguiente: lo
 * útil a esa hora es saber cuándo y dónde volverá el sol. Sin `next` (otro día, ya anochecido) se
 * enseña el día completo de ese día.
 */
export function timelineRange(present: number, sun: TimelineSun, next?: TimelineSun): TimelineDay {
  const m = TWILIGHT_MARGIN_MS;
  if (next && present > sun.sunset + m) {
    return { start: next.sunrise - m, end: next.sunset + m, sun: next, nextDay: true };
  }
  return { start: sun.sunrise - m, end: sun.sunset + m, sun, nextDay: false };
}

/** Mismo reloj de pared que `now`, pero sobre el día `dayOffset` días después del de hoy. */
export function presentOnDay(now: number, dayOffset: number): number {
  return dayStartFor(now, dayOffset) + (now - startOfZoneDay(now));
}
