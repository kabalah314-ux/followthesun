import { DEG, clamp, distanceMeters, pointInRing } from "./coordinates";

/**
 * Geometría de lugares sobre coordenadas geográficas ([lng, lat]). Puro y sin dependencias del mapa.
 * Se trabaja en un plano local equirectangular, suficiente a escala de ciudad (error < 0,1 %).
 */

export type LL = [number, number];

const M_LAT = 111_194;
const mLng = (lat: number) => 111_320 * Math.cos(lat * DEG);

export interface LLBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export function ringBounds(ring: ArrayLike<number[]>): LLBounds {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return { west, east, south, north };
}

/** Superficie de un anillo en m². */
export function ringAreaM2(ring: number[][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  const lng0 = ring[0][0];
  const lat0 = ring[0][1];
  const kx = mLng(lat0);
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = (ring[i][0] - lng0) * kx;
    const y1 = (ring[i][1] - lat0) * M_LAT;
    const x2 = (ring[j][0] - lng0) * kx;
    const y2 = (ring[j][1] - lat0) * M_LAT;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Centroide ponderado por área (puede quedar fuera de polígonos cóncavos: ver `interiorPoint`). */
export function ringCentroid(ring: number[][]): LL {
  const n = ring.length;
  const lng0 = ring[0][0];
  const lat0 = ring[0][1];
  const kx = mLng(lat0);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = (ring[i][0] - lng0) * kx;
    const y1 = (ring[i][1] - lat0) * M_LAT;
    const x2 = (ring[j][0] - lng0) * kx;
    const y2 = (ring[j][1] - lat0) * M_LAT;
    const cr = x1 * y2 - x2 * y1;
    a += cr;
    cx += (x1 + x2) * cr;
    cy += (y1 + y2) * cr;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0];
      sy += p[1];
    }
    return [sx / n, sy / n];
  }
  const area6 = 3 * a;
  return [lng0 + cx / area6 / kx, lat0 + cy / area6 / M_LAT];
}

/** Punto que está DENTRO del anillo y lo más cerca posible de su centroide. */
export function interiorPoint(ring: number[][]): LL {
  const c = ringCentroid(ring);
  if (pointInRing(c[0], c[1], ring)) return c;
  const b = ringBounds(ring);
  let best: LL | null = null;
  let bestD = Infinity;
  const N = 12;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const lng = b.west + ((i + 0.5) / N) * (b.east - b.west);
      const lat = b.south + ((j + 0.5) / N) * (b.north - b.south);
      if (!pointInRing(lng, lat, ring)) continue;
      const d = distanceMeters(c[0], c[1], lng, lat);
      if (d < bestD) {
        bestD = d;
        best = [lng, lat];
      }
    }
  }
  return best ?? c;
}

export interface PolygonSampling {
  areaPerPointM2: number;
  minPoints: number;
  maxPoints: number;
  minSpacingM: number;
}

/**
 * Puntos repartidos DENTRO de un polígono (rejilla de celdas centradas). El número depende de la
 * superficie: un parque grande se muestrea más que una plazoleta. Siempre devuelve al menos uno.
 */
export function samplePolygon(ring: number[][], opts: PolygonSampling): LL[] {
  const area = ringAreaM2(ring);
  const target = clamp(Math.round(area / opts.areaPerPointM2), opts.minPoints, opts.maxPoints);
  if (target <= 1) return [interiorPoint(ring)];

  const b = ringBounds(ring);
  const kx = mLng((b.north + b.south) / 2);
  const wM = (b.east - b.west) * kx;
  const hM = (b.north - b.south) * M_LAT;
  let spacing = Math.max(opts.minSpacingM, Math.sqrt(area / target));
  let pts: LL[] = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    pts = [];
    const nx = Math.max(1, Math.ceil(wM / spacing));
    const ny = Math.max(1, Math.ceil(hM / spacing));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const lng = b.west + ((i + 0.5) / nx) * (b.east - b.west);
        const lat = b.south + ((j + 0.5) / ny) * (b.north - b.south);
        if (pointInRing(lng, lat, ring)) pts.push([lng, lat]);
      }
    }
    if (pts.length >= Math.max(1, Math.floor(target * 0.5))) break;
    if (spacing <= opts.minSpacingM) break;
    spacing = Math.max(opts.minSpacingM, spacing * 0.7);
  }

  if (pts.length === 0) return [interiorPoint(ring)];
  if (pts.length > opts.maxPoints) {
    const stride = pts.length / opts.maxPoints;
    const picked: LL[] = [];
    for (let k = 0; k < opts.maxPoints; k++) picked.push(pts[Math.floor(k * stride)]);
    return picked;
  }
  return pts;
}

export function pathLengthM(path: number[][]): number {
  let len = 0;
  for (let i = 0; i < path.length - 1; i++) {
    len += distanceMeters(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
  }
  return len;
}

/** Punto situado a `distanceM` metros desde el inicio de una línea. */
export function pointAtDistance(path: number[][], distanceM: number): LL {
  if (path.length === 1) return [path[0][0], path[0][1]];
  let left = Math.max(0, distanceM);
  for (let i = 0; i < path.length - 1; i++) {
    const seg = distanceMeters(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    if (left <= seg || i === path.length - 2) {
      const f = seg > 0 ? clamp(left / seg, 0, 1) : 0;
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * f,
        path[i][1] + (path[i + 1][1] - path[i][1]) * f,
      ];
    }
    left -= seg;
  }
  const last = path[path.length - 1];
  return [last[0], last[1]];
}

/** Puntos equiespaciados a lo largo de una línea (extremos incluidos). */
export function samplePath(path: number[][], spacingM: number, maxPoints: number): LL[] {
  const len = pathLengthM(path);
  const n = clamp(Math.ceil(len / spacingM) + 1, 1, maxPoints);
  if (n === 1) return [pointAtDistance(path, len / 2)];
  const out: LL[] = [];
  for (let k = 0; k < n; k++) out.push(pointAtDistance(path, (k * len) / (n - 1)));
  return out;
}

/** `n` puntos en un círculo de `radiusM` metros alrededor de un punto. */
export function ringAround(lng: number, lat: number, radiusM: number, n: number): LL[] {
  const kx = mLng(lat);
  const out: LL[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    out.push([lng + (radiusM * Math.sin(a)) / kx, lat + (radiusM * Math.cos(a)) / M_LAT]);
  }
  return out;
}

const same = (a: LL, b: LL) => a[0] === b[0] && a[1] === b[1];

/**
 * Une líneas abiertas en anillos cerrados (los límites de una relación multipolígono de OSM llegan
 * troceados en varias vías). Las vías que no cierran se descartan.
 */
export function stitchRings(ways: LL[][]): LL[][] {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings: LL[][] = [];
  const closed = (r: LL[]) => r.length >= 4 && same(r[0], r[r.length - 1]);

  while (pool.length > 0) {
    let cur = pool.pop() as LL[];
    let progress = true;
    while (!closed(cur) && progress) {
      progress = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        const head = cur[0];
        const tail = cur[cur.length - 1];
        if (same(tail, w[0])) cur = cur.concat(w.slice(1));
        else if (same(tail, w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else if (same(head, w[w.length - 1])) cur = w.slice(0, -1).concat(cur);
        else if (same(head, w[0])) cur = w.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}
