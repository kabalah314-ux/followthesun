import type { SunWindow } from "../types";
import { getSunPosition } from "./solarCalculations";

/**
 * Modo foto (guía maestra 2, utilidad 21): hora azul, hora dorada y de dónde llega la luz.
 *
 * Definiciones habituales en fotografía, con la altura del centro del sol sobre el horizonte:
 *   hora azul    de −6° a −4° (antes de la dorada por la mañana y después de ella por la tarde)
 *   hora dorada  de −4° a +6°
 * Los cruces se buscan con la misma posición del sol que usa el motor (paso de 10 min y bisección
 * hasta el segundo), así que coinciden con las sombras que dibuja el mapa.
 */

export type TimeRange = readonly [number, number];

export interface PhotoLight {
  blueMorning: TimeRange | null;
  goldenMorning: TimeRange | null;
  goldenEvening: TimeRange | null;
  blueEvening: TimeRange | null;
  /** Parte de cada hora dorada con el sol por encima del horizonte (la que puede dar luz directa). */
  litMorning: TimeRange | null;
  litEvening: TimeRange | null;
}

/** Alturas del sol (°). `horizon` es la del orto y el ocaso oficiales (refracción y semidiámetro). */
export const PHOTO_ALTITUDES = { blue: -6, golden: -4, horizon: -0.833, high: 6 } as const;

const MIN = 60_000;
const DAY = 86_400_000;
const STEP = 10 * MIN;

const altitude = (t: number, lat: number, lng: number) => getSunPosition(t, lat, lng).altitudeDeg;

/** Instantes del día (24 h desde `dayStart`) en que la altura del sol cruza `deg` al subir y al bajar. */
export function altitudeCrossings(dayStart: number, lat: number, lng: number, deg: number): { up: number | null; down: number | null } {
  let up: number | null = null;
  let down: number | null = null;
  let t0 = dayStart;
  let f0 = altitude(t0, lat, lng) - deg;
  for (let t1 = dayStart + STEP; t1 <= dayStart + DAY; t1 += STEP) {
    const f1 = altitude(t1, lat, lng) - deg;
    if ((f0 < 0) !== (f1 < 0)) {
      let lo = t0;
      let hi = t1;
      let flo = f0;
      while (hi - lo > 1000) {
        const mid = (lo + hi) / 2;
        const fm = altitude(mid, lat, lng) - deg;
        if ((fm < 0) === (flo < 0)) {
          lo = mid;
          flo = fm;
        } else {
          hi = mid;
        }
      }
      const t = Math.round((lo + hi) / 2);
      if (f0 < 0) {
        if (up === null) up = t;
      } else if (down === null) {
        down = t;
      }
    }
    t0 = t1;
    f0 = f1;
  }
  return { up, down };
}

const range = (a: number | null, b: number | null): TimeRange | null => (a !== null && b !== null && b > a ? [a, b] : null);

/** Horas azul y dorada del día de `dayStart` en un punto. */
export function photoLight(dayStart: number, lat: number, lng: number): PhotoLight {
  const blue = altitudeCrossings(dayStart, lat, lng, PHOTO_ALTITUDES.blue);
  const golden = altitudeCrossings(dayStart, lat, lng, PHOTO_ALTITUDES.golden);
  const horizon = altitudeCrossings(dayStart, lat, lng, PHOTO_ALTITUDES.horizon);
  const high = altitudeCrossings(dayStart, lat, lng, PHOTO_ALTITUDES.high);
  return {
    blueMorning: range(blue.up, golden.up),
    goldenMorning: range(golden.up, high.up),
    goldenEvening: range(high.down, golden.down),
    blueEvening: range(golden.down, blue.down),
    litMorning: range(horizon.up, high.up),
    litEvening: range(high.down, horizon.down),
  };
}

/** Rumbo de la luz en ocho sectores: 0 = norte, 1 = nordeste … 7 = noroeste. */
export function lightSector(azimuthDeg: number): number {
  return Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8;
}

/** De dónde llega la luz en un instante (rumbo en grados desde el norte y sector). */
export function lightAt(t: number, lat: number, lng: number): { azimuthDeg: number; altitudeDeg: number; sector: number } {
  const p = getSunPosition(t, lat, lng);
  return { azimuthDeg: p.azimuthDeg, altitudeDeg: p.altitudeDeg, sector: lightSector(p.azimuthDeg) };
}

export const midpoint = (r: TimeRange): number => Math.round((r[0] + r[1]) / 2);

/**
 * Qué pasa en un sitio durante una franja, con las ventanas del motor:
 *  · lit     tramos con sol directo (o casi) de al menos 3 min
 *  · shadow  sin sol: lo tapan los edificios
 *  · cloud   sin sol: nubes previstas
 *  · unknown sin datos suficientes
 */
export type SpotVerdict = { kind: "lit"; ranges: TimeRange[] } | { kind: "shadow" } | { kind: "cloud" } | { kind: "unknown" };

export function spotVerdict(windows: readonly SunWindow[], r: TimeRange): SpotVerdict {
  const [a, b] = r;
  const lit: Array<[number, number]> = [];
  let shadow = 0;
  let cloud = 0;
  let total = 0;
  for (const w of windows) {
    const s = Math.max(a, w.start);
    const e = Math.min(b, w.end);
    if (e <= s) continue;
    total += e - s;
    if (w.kind === "sun" || w.kind === "partial") {
      const last = lit[lit.length - 1];
      if (last && s - last[1] <= MIN) last[1] = Math.max(last[1], e);
      else lit.push([s, e]);
    } else if (w.kind === "shadow") {
      shadow += e - s;
    } else if (w.kind === "cloud") {
      cloud += e - s;
    }
  }
  const useful = lit.filter(([s, e]) => e - s >= 3 * MIN).map(([s, e]) => [s, e] as const);
  if (useful.length > 0) return { kind: "lit", ranges: useful };
  if (total === 0) return { kind: "unknown" };
  if (shadow > 0 && shadow >= cloud) return { kind: "shadow" };
  if (cloud > 0) return { kind: "cloud" };
  return { kind: "unknown" };
}
