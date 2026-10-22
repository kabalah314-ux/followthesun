import { DEG, clamp, latToMy, lngToMx, metersPerMercatorUnit, pointInPolygon } from "./coordinates";
import { altitudeCrossings } from "./photoLight";
import { getSunPosition } from "./solarCalculations";
import type { FootprintSet, LngLatPair } from "./terraceShape";

/**
 * La calle de un punto (guía maestra 2, utilidades 20 «Qué acera tomar» y 32 «Alineaciones
 * sol-calle»): el rumbo del tramo más cercano, hasta dónde llega cada acera y los días del año en
 * que el sol sale o se pone justo al fondo de la calle.
 */

/** Radio medio de la Tierra (el mismo que usa `distanceMeters`). */
const EARTH_R = 6371008.8;
const DAY = 86_400_000;

export interface StreetHit {
  /** Rumbo del tramo (0–180°). */
  bearingDeg: number;
  /** Distancia del punto al eje de la calle (m). */
  distM: number;
  /** Punto del eje más cercano. */
  lng: number;
  lat: number;
}

/** El tramo de calle más cercano al punto (a ≤ `maxM`). Las líneas van en [lng, lat]. */
export function streetBearingAt(lines: ReadonlyArray<ReadonlyArray<LngLatPair>>, lng: number, lat: number, maxM = 25): StreetHit | null {
  const kx = DEG * EARTH_R * Math.cos(lat * DEG);
  const ky = DEG * EARTH_R;
  let best: StreetHit | null = null;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const ax = (line[i][0] - lng) * kx;
      const ay = (line[i][1] - lat) * ky;
      const bx = (line[i + 1][0] - lng) * kx;
      const by = (line[i + 1][1] - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) continue;
      const t = clamp(-(ax * dx + ay * dy) / len2, 0, 1);
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const d = Math.hypot(cx, cy);
      if (d <= maxM && (!best || d < best.distM)) {
        best = {
          bearingDeg: (((Math.atan2(dx, dy) / DEG) % 180) + 180) % 180,
          distM: d,
          lng: lng + cx / kx,
          lat: lat + cy / ky,
        };
      }
    }
  }
  return best;
}

/** Punto a `meters` del origen en el rumbo `azimuthDeg`. */
export function offsetPoint(lng: number, lat: number, azimuthDeg: number, meters: number): LngLatPair {
  const e = Math.sin(azimuthDeg * DEG) * meters;
  const n = Math.cos(azimuthDeg * DEG) * meters;
  return [lng + e / (DEG * EARTH_R * Math.cos(lat * DEG)), lat + n / (DEG * EARTH_R)];
}

/** Distancia (m) hasta la primera fachada siguiendo el rumbo `azimuthDeg` (null si no hay en `maxM`). */
export function facadeDistance(set: FootprintSet, lng: number, lat: number, azimuthDeg: number, maxM = 30, stepM = 0.5): number | null {
  const mpu = metersPerMercatorUnit(lat);
  const px = lngToMx(lng);
  const py = latToMy(lat);
  const ux = Math.sin(azimuthDeg * DEG) / mpu;
  const uy = -Math.cos(azimuthDeg * DEG) / mpu;
  const ex = px + ux * maxM;
  const ey = py + uy * maxM;
  const minX = Math.min(px, ex);
  const maxX = Math.max(px, ex);
  const minY = Math.min(py, ey);
  const maxY = Math.max(py, ey);
  const cands: Array<{ xs: Float64Array; ys: Float64Array; b: [number, number, number, number] }> = [];
  for (let i = 0; i < set.count; i++) {
    const bi = 4 * i;
    if (set.bbox[bi + 2] < minX || set.bbox[bi] > maxX || set.bbox[bi + 3] < minY || set.bbox[bi + 1] > maxY) continue;
    const o = set.offsets[i];
    const n = set.offsets[i + 1] - o;
    if (n < 3) continue;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      xs[k] = set.coords[2 * (o + k)];
      ys[k] = set.coords[2 * (o + k) + 1];
    }
    cands.push({ xs, ys, b: [set.bbox[bi], set.bbox[bi + 1], set.bbox[bi + 2], set.bbox[bi + 3]] });
  }
  if (cands.length === 0) return null;
  for (let s = stepM; s <= maxM + 1e-9; s += stepM) {
    const qx = px + ux * s;
    const qy = py + uy * s;
    for (const c of cands) {
      if (qx < c.b[0] || qx > c.b[2] || qy < c.b[1] || qy > c.b[3]) continue;
      if (pointInPolygon(qx, qy, c.xs, c.ys)) return s;
    }
  }
  return null;
}

/** Salida y puesta de cada día del año (a `altitudeDeg` sobre el horizonte) con su azimut. */
export interface YearSun {
  rise: Array<{ t: number; az: number } | null>;
  set: Array<{ t: number; az: number } | null>;
}

const yearCache = new Map<string, YearSun>();

export function yearSun(year: number, lat: number, lng: number, altitudeDeg = 1): YearSun {
  const key = `${year}|${lat.toFixed(2)}|${lng.toFixed(2)}|${altitudeDeg}`;
  const hit = yearCache.get(key);
  if (hit) return hit;
  const rise: YearSun["rise"] = [];
  const set: YearSun["set"] = [];
  // ≈ 00:00 de Barcelona (UTC+1); en verano la ventana va de 01:00 a 01:00: incluye salida y puesta.
  const start = Date.UTC(year, 0, 1) - 3_600_000;
  for (let d = 0; d < 366; d++) {
    const day = start + d * DAY;
    if (new Date(day + 12 * 3_600_000).getUTCFullYear() !== year) break;
    const c = altitudeCrossings(day, lat, lng, altitudeDeg);
    rise.push(c.up === null ? null : { t: c.up, az: getSunPosition(c.up, lat, lng).azimuthDeg });
    set.push(c.down === null ? null : { t: c.down, az: getSunPosition(c.down, lat, lng).azimuthDeg });
  }
  const out = { rise, set };
  yearCache.set(key, out);
  return out;
}

/** Diferencia de rumbos con signo en (−180°, 180°]. */
const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** Días en que el azimut de la serie cruza `dirDeg` (normalmente dos al año, o ninguno). */
export function alignmentsIn(series: YearSun["rise"], dirDeg: number): Array<{ time: number; azimuthDeg: number }> {
  const out: Array<{ t: number; az: number }> = [];
  for (let i = 0; i + 1 < series.length; i++) {
    const a = series[i];
    const b = series[i + 1];
    if (!a || !b) continue;
    const da = angleDiff(a.az, dirDeg);
    const db = angleDiff(b.az, dirDeg);
    if (Math.abs(da) > 10 || Math.abs(db) > 10) continue;
    if (da === 0 || da < 0 !== db < 0) out.push(Math.abs(da) <= Math.abs(db) ? a : b);
  }
  // Junto a un solsticio el azimut casi no se mueve: si roza la dirección sin cruzarla, vale el día más cercano.
  if (out.length === 0) {
    let best: { t: number; az: number } | null = null;
    for (const s of series) if (s && (!best || Math.abs(angleDiff(s.az, dirDeg)) < Math.abs(angleDiff(best.az, dirDeg)))) best = s;
    if (best && Math.abs(angleDiff(best.az, dirDeg)) <= 0.3) out.push(best);
  }
  return out.map((s) => ({ time: s.t, azimuthDeg: s.az }));
}

export interface StreetAlignment {
  kind: "rise" | "set";
  /** Hacia dónde se mira (rumbo de la calle en ese sentido). */
  dirDeg: number;
  days: Array<{ time: number; azimuthDeg: number }>;
}

/** Salidas y puestas de sol al fondo de una calle de rumbo `bearingDeg` en un año. */
export function streetAlignments(year: number, lat: number, lng: number, bearingDeg: number): StreetAlignment[] {
  const ys = yearSun(year, lat, lng);
  const out: StreetAlignment[] = [];
  for (const dir of [bearingDeg % 360, (bearingDeg + 180) % 360]) {
    for (const kind of ["rise", "set"] as const) {
      const days = alignmentsIn(kind === "rise" ? ys.rise : ys.set, dir);
      if (days.length > 0) out.push({ kind, dirDeg: dir, days });
    }
  }
  return out;
}

/** Ocho sectores del rumbo: 0 = norte, 1 = noreste … 7 = noroeste. */
export const sectorOf = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;
