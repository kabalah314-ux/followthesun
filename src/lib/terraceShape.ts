import { DEG, clamp, latToMy, lngToMx, metersPerMercatorUnit, pointInPolygon } from "./coordinates";

/** Radio medio de la Tierra (el mismo que usa `distanceMeters`). */
const EARTH_R = 6371008.8;

/**
 * La terraza dibujada (guía maestra 2, B10): un rectángulo con la superficie de la licencia
 * municipal, paralelo a la fachada más cercana y hacia la calle, partido en 5 × 5 celdas que se
 * pintan al sol o a la sombra. Es una aproximación honesta: la licencia da los m² y el punto, no
 * la forma; el fondo se acota al de una acera (1,5–3,5 m) y el largo a 30 m.
 */

export type LngLatPair = [number, number];

export interface TerraceCell {
  center: LngLatPair;
  /** Anillo cerrado [lng, lat]. */
  ring: LngLatPair[];
}

export interface TerraceShape {
  /** Anillo cerrado [lng, lat] del rectángulo. */
  ring: LngLatPair[];
  cells: TerraceCell[];
  lengthM: number;
  depthM: number;
  /** Rumbo del lado largo (0–180°). */
  bearingDeg: number;
}

export const TERRACE_GRID = 5;

/** Largo y fondo de un rectángulo de esa superficie con el fondo de una acera. */
export function terraceDims(areaM2: number): { lengthM: number; depthM: number } {
  const a = clamp(areaM2, 2, 300);
  let depth = clamp(Math.sqrt(a / 3), 1.5, 3.5);
  let length = a / depth;
  if (length > 30) {
    length = 30;
    depth = Math.min(8, a / 30);
  }
  return { lengthM: length, depthM: depth };
}

/** Lo mínimo de un conjunto de edificios (`BuildingSet`): anillos en Mercator normalizado. */
export interface FootprintSet {
  count: number;
  coords: ArrayLike<number>;
  offsets: ArrayLike<number>;
  bbox: ArrayLike<number>;
}

export interface Facade {
  /** Rumbo del lado del edificio (0–180°). */
  bearingDeg: number;
  /** Distancia del punto al lado (m). */
  distM: number;
  /** Vector unitario [este, norte] desde la fachada hacia la calle. */
  outward: [number, number];
}

/** El lado de edificio más cercano al punto (a ≤ `maxM`) y hacia dónde queda la calle. */
export function nearestFacade(set: FootprintSet, lng: number, lat: number, maxM = 30): Facade | null {
  const px = lngToMx(lng);
  const py = latToMy(lat);
  const mpu = metersPerMercatorUnit(lat);
  const r = maxM / mpu;
  let best: { d: number; ax: number; ay: number; bx: number; by: number; cx: number; cy: number; inside: boolean } | null = null;
  for (let i = 0; i < set.count; i++) {
    const bi = 4 * i;
    if (set.bbox[bi + 2] < px - r || set.bbox[bi] > px + r || set.bbox[bi + 3] < py - r || set.bbox[bi + 1] > py + r) continue;
    const o = set.offsets[i];
    const end = set.offsets[i + 1];
    const n = end - o;
    if (n < 3) continue;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      xs[k] = set.coords[2 * (o + k)];
      ys[k] = set.coords[2 * (o + k) + 1];
    }
    const inside = pointInPolygon(px, py, xs, ys);
    for (let k = 0; k < n; k++) {
      const ax = xs[k];
      const ay = ys[k];
      const bx = xs[(k + 1) % n];
      const by = ys[(k + 1) % n];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy) * mpu;
      if (d <= maxM && (!best || d < best.d)) best = { d, ax, ay, bx, by, cx, cy, inside };
    }
  }
  if (!best) return null;
  // Mercator: x crece al este e y crece al sur.
  const east = best.bx - best.ax;
  const north = -(best.by - best.ay);
  const bearingDeg = (((Math.atan2(east, north) / DEG) % 180) + 180) % 180;
  // Normal del lado; se orienta hacia el punto (o al revés si el punto cae dentro del edificio).
  const len = Math.hypot(east, north);
  let ox = north / len;
  let oy = -east / len;
  const toPx = (px - best.cx) * mpu;
  const toPy = -(py - best.cy) * mpu;
  if (ox * toPx + oy * toPy < 0) {
    ox = -ox;
    oy = -oy;
  }
  if (best.inside) {
    ox = -ox;
    oy = -oy;
  }
  return { bearingDeg, distM: best.inside ? -best.d : best.d, outward: [ox, oy] };
}

const offset = (lng: number, lat: number, east: number, north: number): LngLatPair => [
  lng + east / (DEG * EARTH_R * Math.cos(lat * DEG)),
  lat + north / (DEG * EARTH_R),
];

/**
 * El rectángulo de la terraza. Sin fachada conocida se dibuja centrado en el punto y orientado
 * norte-sur; con fachada, paralelo a ella y empezando como pronto en la línea de fachada.
 */
export function terraceShape(lng: number, lat: number, areaM2: number, facade: Facade | null): TerraceShape {
  const { lengthM: L, depthM: D } = terraceDims(areaM2);
  const bearingDeg = facade ? facade.bearingDeg : 0;
  const u: [number, number] = [Math.sin(bearingDeg * DEG), Math.cos(bearingDeg * DEG)];
  const n: [number, number] = facade ? facade.outward : [u[1], -u[0]];
  // El borde interior no entra en el edificio: el centro queda al menos a D/2 de la fachada.
  const shift = facade ? Math.max(0, D / 2 - facade.distM) : 0;
  const c = offset(lng, lat, n[0] * shift, n[1] * shift);
  const at = (a: number, b: number): LngLatPair => offset(c[0], c[1], u[0] * a * L + n[0] * b * D, u[1] * a * L + n[1] * b * D);
  const ring: LngLatPair[] = [at(-0.5, -0.5), at(0.5, -0.5), at(0.5, 0.5), at(-0.5, 0.5), at(-0.5, -0.5)];
  const cells: TerraceCell[] = [];
  const G = TERRACE_GRID;
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const a0 = i / G - 0.5;
      const a1 = (i + 1) / G - 0.5;
      const b0 = j / G - 0.5;
      const b1 = (j + 1) / G - 0.5;
      cells.push({
        center: at((a0 + a1) / 2, (b0 + b1) / 2),
        ring: [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1), at(a0, b0)],
      });
    }
  }
  return { ring, cells, lengthM: L, depthM: D, bearingDeg };
}
