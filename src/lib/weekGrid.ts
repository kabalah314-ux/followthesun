import type { SunWindow, SunWindowKind } from "../types";
import { zonedMs } from "./planningTime";

/**
 * «Esta semana» (guía maestra 2): una cuadrícula de días × horas con el mejor momento de cada día.
 * A partir de las ventanas de luz de un lugar (las del motor). Lógica pura.
 */

export type CellState = "sun" | "partial" | "shade" | "cloud" | "night";

export interface HourCell {
  /** Hora local (0–23). */
  hour: number;
  start: number;
  state: CellState;
  /** Sin previsión de nubes: el sol es posible, no confirmado. */
  unverified: boolean;
}

export const WEEK_HOURS: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const STATE_OF: Record<SunWindowKind, CellState> = {
  sun: "sun",
  partial: "partial",
  shadow: "shade",
  cloud: "cloud",
  uncertain: "partial",
  night: "night",
};

/** Estado dominante de cada hora del día (lo que más dura dentro de esa hora). */
export function hourCells(windows: readonly SunWindow[], dayStart: number, hours: readonly number[] = WEEK_HOURS): HourCell[] {
  return hours.map((hour) => {
    const a = zonedMs(dayStart, hour * 60);
    const b = a + 3_600_000;
    const share = new Map<CellState, number>();
    let unverified = false;
    for (const w of windows) {
      const o = Math.min(b, w.end) - Math.max(a, w.start);
      if (o <= 0) continue;
      const st = STATE_OF[w.kind];
      share.set(st, (share.get(st) ?? 0) + o);
      if (w.unverified && (st === "sun" || st === "partial")) unverified = true;
    }
    let state: CellState = "night";
    let best = 0;
    for (const [st, ms] of share) {
      if (ms > best) {
        best = ms;
        state = st;
      }
    }
    return { hour, start: a, state, unverified: unverified && (state === "sun" || state === "partial") };
  });
}

/** El mejor momento del día: el tramo de sol seguido más largo (mínimo `minMinutes`). */
export function bestMoment(windows: readonly SunWindow[], minMinutes = 30): { start: number; end: number } | null {
  const sunny = windows.filter((w) => w.kind === "sun" || w.kind === "partial").sort((a, b) => a.start - b.start);
  let best: { start: number; end: number } | null = null;
  let cur: { start: number; end: number } | null = null;
  for (const w of sunny) {
    if (cur && w.start <= cur.end + 60_000) cur.end = Math.max(cur.end, w.end);
    else {
      if (cur && (!best || cur.end - cur.start > best.end - best.start)) best = cur;
      cur = { start: w.start, end: w.end };
    }
  }
  if (cur && (!best || cur.end - cur.start > best.end - best.start)) best = cur;
  return best && best.end - best.start >= minMinutes * 60_000 ? best : null;
}

/** Minutos de sol de un día (el sol suave cuenta la mitad). */
export function sunMinutesOf(windows: readonly SunWindow[]): number {
  let ms = 0;
  for (const w of windows) {
    if (w.kind === "sun") ms += w.end - w.start;
    else if (w.kind === "partial") ms += (w.end - w.start) / 2;
  }
  return Math.round(ms / 60_000);
}

/** Minutos de luz de día que no son sol (sombra de edificios, nubes o dudoso); la noche no cuenta. */
export function shadeMinutesOf(windows: readonly SunWindow[]): number {
  let ms = 0;
  for (const w of windows) if (w.kind !== "night") ms += w.end - w.start;
  return Math.max(0, Math.round(ms / 60_000) - sunMinutesOf(windows));
}
