import { getZoneParts } from "../services/timeService";

/**
 * Horarios de OpenStreetMap (`opening_hours`) — los formatos comunes, sin dependencias.
 *
 * Se entienden:
 *   24/7 · «Mo-Fr 08:00-20:00; Sa 09:00-14:00» · «Mo,We,Fr 10:00-14:00,17:00-20:00»
 *   «Tu-Su 12:00-16:00, 20:00-24:00» · pasada la medianoche («Th-Sa 20:00-02:30»)
 *   «Su off» / «Su closed» · sin días («08:00-20:00» = todos los días) · rangos que dan la vuelta
 *   («Fr-Mo») · festivos («PH off»: se ignoran, no sabemos qué día es festivo)
 *
 * Lo que no se entiende (meses, semanas, «sunrise», comentarios, horas abiertas «18:00+»…) devuelve
 * null: el horario se trata como desconocido y nunca se afirma «abierto» o «cerrado» sin saberlo.
 * Una regla posterior con días sustituye a las anteriores para esos días (semántica de OSM).
 */

/** 0 = lunes … 6 = domingo. */
export type Weekday = number;

export interface TimeRange {
  /** Minutos desde las 00:00. */
  start: number;
  /** Puede pasar de 1440 si cierra después de medianoche. */
  end: number;
}

export interface Schedule {
  alwaysOpen: boolean;
  /** Tramos de cada día (0 = lunes). */
  days: TimeRange[][];
}

const DAY_CODES = ["mo", "tu", "we", "th", "fr", "sa", "su"];
/** Selector de días al principio de una regla («Mo-Fr,Su », «Sa,Su,PH »); el resto son las horas. */
const SELECTOR = /^((?:(?:mo|tu|we|th|fr|sa|su|ph)(?:\s*-\s*(?:mo|tu|we|th|fr|sa|su))?\s*,?\s*)*)(.*)$/i;
const UNSUPPORTED =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|week|sunrise|sunset|dawn|dusk|easter|sh)\b|"|\+|\[/i;

function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

function parseTimes(s: string): TimeRange[] | null {
  const out: TimeRange[] = [];
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(p);
    if (!m) return null;
    const start = parseTime(m[1]);
    let end = parseTime(m[2]);
    if (start === null || end === null) return null;
    if (end <= start) end += 1440;
    out.push({ start, end });
  }
  return out.length ? out : null;
}

/** «Mo-Fr,Su» → [0,1,2,3,4,6]; null si no es un selector de días. */
function parseDays(s: string): number[] | null {
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const p = part.trim().toLowerCase();
    if (!p) continue;
    if (p === "ph") continue;
    const range = /^([a-z]{2})\s*-\s*([a-z]{2})$/.exec(p);
    if (range) {
      const a = DAY_CODES.indexOf(range[1]);
      const b = DAY_CODES.indexOf(range[2]);
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
      continue;
    }
    const d = DAY_CODES.indexOf(p);
    if (d < 0) return null;
    out.add(d);
  }
  return [...out].sort((x, y) => x - y);
}

/** Horario de OSM → tramos por día. null si está vacío o usa algo que no se entiende. */
export function parseOpeningHours(spec: string | null | undefined): Schedule | null {
  if (!spec) return null;
  const text = spec.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/^24\/7$/i.test(text)) return { alwaysOpen: true, days: Array.from({ length: 7 }, () => [{ start: 0, end: 1440 }]) };
  if (UNSUPPORTED.test(text)) return null;

  const days: TimeRange[][] = Array.from({ length: 7 }, () => []);
  let any = false;
  for (const rawRule of text.split(/;|\|\|/)) {
    const rule = rawRule.trim();
    if (!rule) continue;
    // Selector de días: todo lo que hay antes de la primera hora (o de «off»).
    const m = SELECTOR.exec(rule);
    if (!m) return null;
    const daySel = m[1].trim().replace(/,$/, "");
    const rest = m[2].trim();
    // «PH off» o «PH 10:00-14:00»: festivos, sin calendario → se ignora la regla.
    if (/^ph$/i.test(daySel)) continue;
    const selected = daySel ? parseDays(daySel) : [0, 1, 2, 3, 4, 5, 6];
    if (selected === null) return null;
    if (selected.length === 0) continue;
    if (/^(off|closed)$/i.test(rest)) {
      for (const d of selected) days[d] = [];
      any = true;
      continue;
    }
    const ranges = parseTimes(rest.replace(/\s*open$/i, ""));
    if (!ranges) return null;
    for (const d of selected) days[d] = ranges.map((r) => ({ ...r }));
    any = true;
  }
  if (!any) return null;
  const alwaysOpen = days.every((ranges) => ranges.some((r) => r.start === 0 && r.end >= 1440));
  return { alwaysOpen, days };
}

/** ¿Abierto el día `weekday` (0 = lunes) a los `minutes` desde las 00:00? */
export function isOpenAt(s: Schedule, weekday: Weekday, minutes: number): boolean {
  if (s.alwaysOpen) return true;
  if (s.days[weekday].some((r) => minutes >= r.start && minutes < r.end)) return true;
  // Lo que queda del día anterior pasada la medianoche.
  const prev = s.days[(weekday + 6) % 7];
  return prev.some((r) => r.end > 1440 && minutes < r.end - 1440);
}

/** Día de la semana de Barcelona (0 = lunes) y minutos desde las 00:00 de un instante. */
export function zoneWeekMinutes(t: number): { weekday: Weekday; minutes: number } {
  const p = getZoneParts(t);
  const jsDay = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { weekday: (jsDay + 6) % 7, minutes: p.hour * 60 + p.minute };
}

export interface OpenState {
  open: boolean;
  /** Si está abierto: minutos desde las 00:00 de hoy a los que cierra (null si no cierra en 24 h). */
  closesAt: number | null;
  /** Si está cerrado: cuándo abre (días desde hoy y minutos) o null si no abre en la semana. */
  opensAt: { dayOffset: number; minutes: number } | null;
}

/** Estado del horario en un día y minuto: abierto hasta…, o cerrado hasta… */
export function openStateOf(s: Schedule, weekday: Weekday, minutes: number): OpenState {
  if (s.alwaysOpen) return { open: true, closesAt: null, opensAt: null };
  if (isOpenAt(s, weekday, minutes)) {
    const today = s.days[weekday].find((r) => minutes >= r.start && minutes < r.end);
    if (today) {
      // Un tramo que acaba a medianoche y sigue en otro que empieza a las 00:00 no «cierra».
      const next = s.days[(weekday + 1) % 7];
      const continues = today.end >= 1440 && next.some((r) => r.start === 0 && r.end >= today.end - 1440);
      return { open: true, closesAt: continues ? null : today.end, opensAt: null };
    }
    const prev = s.days[(weekday + 6) % 7].find((r) => r.end > 1440 && minutes < r.end - 1440);
    return { open: true, closesAt: prev ? prev.end - 1440 : null, opensAt: null };
  }
  for (let off = 0; off < 8; off++) {
    const d = (weekday + off) % 7;
    const starts = s.days[d].map((r) => r.start).filter((st) => off > 0 || st > minutes);
    if (starts.length) return { open: false, closesAt: null, opensAt: { dayOffset: off, minutes: Math.min(...starts) } };
  }
  return { open: false, closesAt: null, opensAt: null };
}

/** Estado del horario de OSM en un instante (hora de Barcelona); null si el horario no se entiende. */
export function openStateAt(spec: string | null | undefined, t: number): OpenState | null {
  const s = parseOpeningHours(spec);
  if (!s) return null;
  const { weekday, minutes } = zoneWeekMinutes(t);
  return openStateOf(s, weekday, minutes);
}

/** true / false si se sabe; null si el horario falta o no se entiende. */
export function isOpenNow(spec: string | null | undefined, t: number): boolean | null {
  const st = openStateAt(spec, t);
  return st ? st.open : null;
}
