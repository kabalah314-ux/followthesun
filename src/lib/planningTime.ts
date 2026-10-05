import { BARCELONA } from "../config";
import { getZoneParts, startOfZoneDay } from "../services/timeService";

/**
 * Tiempo de planificación en la zona horaria de Barcelona (nunca la del dispositivo):
 * días locales, horas locales y etiquetas, con el cambio de hora de verano controlado.
 */

const DAY = 86_400_000;
const MIN = 60_000;

/** 00:00 locales del día `dayOffset` días después del de `now`. */
export function dayStartFor(now: number, dayOffset: number): number {
  // Se parte del mediodía del día destino para que los días de 23/25 h no salten de fecha.
  return startOfZoneDay(startOfZoneDay(now) + dayOffset * DAY + DAY / 2);
}

/** Instante (ms) de las `minutes` desde las 00:00 locales de `dayStart`. Admite > 1440 (día siguiente). */
export function zonedMs(dayStart: number, minutes: number): number {
  let t = dayStart + minutes * MIN;
  const p = getZoneParts(t);
  const local = p.hour * 60 + p.minute;
  const wanted = ((minutes % 1440) + 1440) % 1440;
  const diff = local - wanted;
  // Un desfase de ±1 h indica que el día tuvo un cambio de hora entre medias.
  if (diff !== 0 && Math.abs(diff) <= 120) t -= diff * MIN;
  return t;
}

export function minutesOfDay(ms: number): number {
  const p = getZoneParts(ms);
  return p.hour * 60 + p.minute;
}

/** 0 → "00:00", 1050 → "17:30". */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "17:30" → 1050. null si no es una hora válida. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

const dayFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: BARCELONA.timeZone,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const longDayFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: BARCELONA.timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "Hoy" · "Mañana" · "sáb, 10 oct". */
export function dayChoiceLabel(dayStart: number, now: number): string {
  const today = startOfZoneDay(now);
  const diff = Math.round((dayStart - today) / DAY);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return dayFmt.format(new Date(dayStart + DAY / 2));
}

/** "sábado, 10 de octubre". */
export function longDayLabel(ms: number): string {
  return longDayFmt.format(new Date(ms));
}
