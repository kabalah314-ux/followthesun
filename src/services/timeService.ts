import { BARCELONA } from "../config";

/**
 * Utilidades de tiempo en la zona horaria de Barcelona, independientes
 * de la zona horaria del dispositivo del usuario.
 */

const TZ = BARCELONA.timeZone;

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const clockFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});

export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getZoneParts(ms: number): ZoneParts {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

export function zoneDayKey(ms: number): string {
  const p = getZoneParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Epoch (ms) de las 00:00 locales de Barcelona del día que contiene `ms`. */
export function startOfZoneDay(ms: number): number {
  const p = getZoneParts(ms);
  const elapsed = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + (ms % 1000);
  let t = ms - elapsed;
  // Corrección por cambios de hora (DST).
  const q = getZoneParts(t);
  const drift = ((q.hour * 60 + q.minute) * 60 + q.second) * 1000;
  if (q.day !== p.day) t += 24 * 3600 * 1000 - drift;
  else t -= drift;
  return t;
}

export const formatClock = (ms: number) => clockFmt.format(new Date(ms));

export function formatDayLabel(ms: number) {
  return dayFmt.format(new Date(ms));
}

export function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "ahora mismo" · "hace 6 min" · "hace 2 h 10 min". Seguro con valores no válidos. */
export function formatAge(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return "hace más de un día";
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
