import { DEG, smoothstep } from "../lib/coordinates";
import { SUN_UP_RAD } from "../lib/solarCalculations";

/**
 * terrainService — relieve que bloquea el sol en el horizonte (Collserola, Montjuïc, el Carmel…).
 *
 * MVP: modelo de relieve aproximado (crestas y colinas gaussianas) rasterizado a 200 m.
 * Para precisión real basta con reemplazar `buildDem()` por teselas DEM (p. ej. Terrarium)
 * manteniendo `elevation`, `horizonAngle` y `createTerrainField`.
 */

const REGION = { west: 1.98, east: 2.3, south: 41.3, north: 41.52 };
const CELL = 200;
const LAT_REF = 41.39;
const M_LAT = 111_194;
const M_LNG = 111_320 * Math.cos(LAT_REF * DEG);

/** [lat, lng, elevación m] — espina de la sierra de Collserola. */
const RIDGE: Array<[number, number, number]> = [
  [41.383, 2.048, 330],
  [41.3905, 2.063, 420],
  [41.399, 2.079, 450],
  [41.406, 2.095, 470],
  [41.414, 2.108, 490],
  [41.4225, 2.119, 512], // Tibidabo
  [41.431, 2.129, 450],
  [41.439, 2.14, 400],
  [41.447, 2.15, 340],
  [41.456, 2.16, 280],
];

/** [lat, lng, elevación m, sigma m] */
const PEAKS: Array<[number, number, number, number]> = [
  [41.364, 2.156, 173, 800], // Montjuïc
  [41.419, 2.164, 261, 600], // Turó de la Rovira / Carmel
  [41.409, 2.137, 181, 420], // Turó del Putxet
  [41.435, 2.176, 138, 450], // Turó de la Peira
  [41.46, 2.235, 250, 1400], // Serralada de Marina
  [41.45, 2.262, 200, 1100],
];

interface Hill {
  x: number;
  y: number;
  h: number;
  inv2s2: number;
  cutoff2: number;
}

let dem: Float32Array | null = null;
let cols = 0;
let rows = 0;

function toXY(lng: number, lat: number): [number, number] {
  return [(lng - REGION.west) * M_LNG, (lat - REGION.south) * M_LAT];
}

function buildHills(): Hill[] {
  const hills: Hill[] = [];
  const add = (x: number, y: number, h: number, sigma: number) => {
    hills.push({ x, y, h, inv2s2: 1 / (2 * sigma * sigma), cutoff2: 9 * sigma * sigma });
  };

  for (let i = 0; i < RIDGE.length - 1; i++) {
    const [ax, ay] = toXY(RIDGE[i][1], RIDGE[i][0]);
    const [bx, by] = toXY(RIDGE[i + 1][1], RIDGE[i + 1][0]);
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len / 350));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const h = RIDGE[i][2] + (RIDGE[i + 1][2] - RIDGE[i][2]) * t;
      add(ax + (bx - ax) * t, ay + (by - ay) * t, h, 1500);
    }
  }
  for (const [lat, lng, h, sigma] of PEAKS) {
    const [x, y] = toXY(lng, lat);
    add(x, y, h, sigma);
  }
  return hills;
}

function buildDem() {
  cols = Math.ceil(((REGION.east - REGION.west) * M_LNG) / CELL);
  rows = Math.ceil(((REGION.north - REGION.south) * M_LAT) / CELL);
  dem = new Float32Array(cols * rows);
  const hills = buildHills();
  for (let j = 0; j < rows; j++) {
    const y = j * CELL;
    for (let i = 0; i < cols; i++) {
      const x = i * CELL;
      let best = 0;
      for (let k = 0; k < hills.length; k++) {
        const hl = hills[k];
        const dx = x - hl.x;
        const dy = y - hl.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > hl.cutoff2) continue;
        const v = hl.h * Math.exp(-d2 * hl.inv2s2);
        if (v > best) best = v;
      }
      dem[j * cols + i] = best;
    }
  }
}

export function elevation(lng: number, lat: number): number {
  if (!dem) buildDem();
  const gx = ((lng - REGION.west) * M_LNG) / CELL;
  const gy = ((lat - REGION.south) * M_LAT) / CELL;
  if (gx < 0 || gy < 0 || gx >= cols - 1 || gy >= rows - 1) return 0;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const fx = gx - i;
  const fy = gy - j;
  const d = dem!;
  const a = d[j * cols + i];
  const b = d[j * cols + i + 1];
  const c = d[(j + 1) * cols + i];
  const e = d[(j + 1) * cols + i + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
}

const DISTANCES = [200, 400, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6200, 7500, 9000, 11000];

/** Ángulo (rad) del horizonte natural en una dirección (azimut de brújula). */
export function horizonAngle(lng: number, lat: number, azimuth: number): number {
  const h0 = elevation(lng, lat) + 2;
  const se = Math.sin(azimuth);
  const cn = Math.cos(azimuth);
  let best = 0;
  for (let k = 0; k < DISTANCES.length; k++) {
    const d = DISTANCES[k];
    const h = elevation(lng + (d * se) / M_LNG, lat + (d * cn) / M_LAT);
    const a = Math.atan2(h - h0, d);
    if (a > best) best = a;
  }
  return best;
}

/** Visibilidad solar (0-1) de un punto dado el azimut y la altitud del sol. */
export function sunVisibility(lng: number, lat: number, azimuth: number, altitude: number) {
  if (altitude < SUN_UP_RAD) return 0;
  const h = horizonAngle(lng, lat, azimuth);
  return smoothstep(h - 0.0035, h + 0.012, altitude);
}

export interface TerrainField {
  update(azimuth: number, altitude: number): void;
  sample(lng: number, lat: number): number;
}

/** Campo regular de visibilidad solar sobre la ciudad, para pintar el mapa a bajo coste. */
export function createTerrainField(): TerrainField {
  const F = { west: 2.02, east: 2.26, south: 41.31, north: 41.5, cols: 96, rows: 80 };
  const data = new Float32Array(F.cols * F.rows).fill(1);
  let key = "";

  return {
    update(azimuth, altitude) {
      const k = `${(azimuth / DEG).toFixed(2)}|${(altitude / DEG).toFixed(2)}`;
      if (k === key) return;
      key = k;
      if (altitude < SUN_UP_RAD) {
        data.fill(0);
        return;
      }
      for (let j = 0; j < F.rows; j++) {
        const lat = F.south + (j / (F.rows - 1)) * (F.north - F.south);
        for (let i = 0; i < F.cols; i++) {
          const lng = F.west + (i / (F.cols - 1)) * (F.east - F.west);
          const h = horizonAngle(lng, lat, azimuth);
          data[j * F.cols + i] = smoothstep(h - 0.0035, h + 0.012, altitude);
        }
      }
    },
    sample(lng, lat) {
      const gx = ((lng - F.west) / (F.east - F.west)) * (F.cols - 1);
      const gy = ((lat - F.south) / (F.north - F.south)) * (F.rows - 1);
      if (gx < 0 || gy < 0 || gx >= F.cols - 1 || gy >= F.rows - 1) {
        // Fuera del campo: visibilidad del borde más cercano.
        const ci = Math.min(F.cols - 1, Math.max(0, Math.round(gx)));
        const cj = Math.min(F.rows - 1, Math.max(0, Math.round(gy)));
        return data[cj * F.cols + ci];
      }
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      const fx = gx - i;
      const fy = gy - j;
      const a = data[j * F.cols + i];
      const b = data[j * F.cols + i + 1];
      const c = data[(j + 1) * F.cols + i];
      const e = data[(j + 1) * F.cols + i + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
    },
  };
}

export const terrainService = {
  elevation,
  horizonAngle,
  sunVisibility,
  createField: createTerrainField,
};
