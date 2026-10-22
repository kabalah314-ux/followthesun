/**
 * Evento de calendario (iCalendar, RFC 5545) para los avisos de sol o de sombra: «Sol en tu
 * terraza» con una alarma antes. Funciona en cualquier móvil sin cuentas ni servidor: es el
 * calendario de la persona el que avisa, aunque la app esté cerrada.
 */

export interface IcsEvent {
  uid: string;
  start: number;
  end: number;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  geo?: { lat: number; lng: number };
  /** Minutos de antelación de la alarma (sin alarma si no se indica). */
  alarmMinutesBefore?: number;
  alarmText?: string;
  /** Regla de repetición (RFC 5545), p. ej. «FREQ=DAILY». */
  rrule?: string;
  /**
   * Hora «flotante» (la del reloj de quien lo añade, sin zona): un evento diario a las 8:55 sigue
   * a las 8:55 al cambiar al horario de verano. `start` y `end` se escriben en hora de Barcelona.
   */
  floating?: boolean;
}

const FLOAT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Fecha local de Barcelona sin zona (hora flotante): 20261023T085500. */
export function icsFloatingDate(ms: number): string {
  const p: Record<string, string> = {};
  for (const x of FLOAT_FMT.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = x.value;
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha en UTC con el formato de iCalendar: 20261022T114000Z. */
export function icsDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escapa un texto para un valor de iCalendar (barra, punto y coma, coma y saltos de línea). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** Pliega una línea a 75 octetos (RFC 5545 §3.1) sin partir un carácter multibyte. */
export function icsFold(line: string): string {
  if (utf8Length(line) <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = utf8Length(ch);
    // Las líneas de continuación empiezan con un espacio, que también cuenta.
    const max = parts.length === 0 ? 75 : 74;
    if (bytes + b > max) {
      parts.push(cur);
      cur = ch;
      bytes = b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(ev: IcsEvent, now: number = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//I Follow the Sun//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${ev.floating ? icsFloatingDate(ev.start) : icsDate(ev.start)}`,
    `DTEND:${ev.floating ? icsFloatingDate(Math.max(ev.end, ev.start + 60_000)) : icsDate(Math.max(ev.end, ev.start + 60_000))}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ];
  if (ev.rrule) lines.push(`RRULE:${ev.rrule}`);
  if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  if (ev.geo) lines.push(`GEO:${ev.geo.lat.toFixed(6)};${ev.geo.lng.toFixed(6)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  if (ev.alarmMinutesBefore !== undefined) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(ev.alarmText ?? ev.title)}`,
      `TRIGGER:-PT${Math.max(0, Math.round(ev.alarmMinutesBefore))}M`,
      "END:VALARM"
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
