import { DEG, latToMy, lngToMx } from "../../lib/coordinates";
import type { Bounds2D } from "../../types";

/**
 * Alturas del Catastro para los edificios que OpenStreetMap deja sin altura (guía 2, Fase C1).
 *
 * Medido en las teselas de OpenFreeMap (octubre de 2026, 20 teselas z14 del centro): el 24,7 % de
 * las huellas (el 31,8 % de la superficie construida) no tiene ni altura ni plantas en OSM y el
 * mapa las levanta a 5 m (Eixample 21 % · Gràcia 19 % · Ciutat Vella 16 % · Sants 33 %). Hasta
 * ahora su sombra se estimaba por el área (3, 6 o 9 m).
 *
 * El Catastro sí tiene las plantas sobre rasante de cada parte de edificio (INSPIRE Buildings,
 * `BuildingPart.numberOfFloorsAboveGround`). Con ellas se calcula la altura de esas huellas para
 * las SOMBRAS (suelo, cálculo de un punto); el 3D del mapa sigue con la altura de sus teselas.
 *
 *   altura ≈ plantas × 3 m + 1 m  (planta baja más alta y pretil; los mismos 3 m por planta que
 *                                   OpenMapTiles usa con `building:levels`)
 *
 * Fuente: Dirección General del Catastro · INSPIRE Buildings (BU), municipio 08900 (Barcelona).
 * Reutilización libre citando la fuente. El ETL (`scripts/etl/build-heights.ts`) la convierte en
 * teselas z14 compactas: por parte, posición del centroide, plantas y área.
 */

export const CATASTRO = {
  /** Descarga ATOM del municipio de Barcelona (08900). */
  zipUrl: "https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/08/08900-BARCELONA/A.ES.SDGC.BU.08900.zip",
  source: "Dirección General del Catastro · INSPIRE Buildings (BU) · Barcelona (08900)",
  floorM: 3,
  extraM: 1,
  /** Las teselas se piden desde este zoom (a escala de calle; antes la sombra es textura). */
  minZoom: 14.8,
} as const;

export const HEIGHT_TILE_ZOOM = 14;
const STEPS = 4096;
const FIELDS = 4;
const GRID = 64;

export function heightFromFloors(floors: number): number {
  return floors * CATASTRO.floorM + CATASTRO.extraM;
}

/* -------------------------------------------------------------------------- */
/*  UTM (ETRS89 ≈ WGS84, elipsoide GRS80)                                      */
/* -------------------------------------------------------------------------- */

const A = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

/** UTM (hemisferio norte) → [lng, lat] en grados. Error < 1 cm cerca del meridiano central. */
export function utmToLngLat(easting: number, northing: number, zone: number): [number, number] {
  const x = easting - 500000;
  const m = northing / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const t = Math.tan(phi1);
  const n1 = A / Math.sqrt(1 - E2 * s * s);
  const t1 = t * t;
  const c1 = EP2 * c * c;
  const r1 = (A * (1 - E2)) / Math.pow(1 - E2 * s * s, 1.5);
  const d = x / (n1 * K0);
  const lat =
    phi1 -
    ((n1 * t) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon0 = (zone - 1) * 6 - 180 + 3;
  const lon =
    lon0 * DEG +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / c;
  return [lon / DEG, lat / DEG];
}

/** [lng, lat] → UTM (hemisferio norte). La inversa de la anterior (pruebas y utilidades). */
export function lngLatToUtm(lng: number, lat: number, zone: number): [number, number] {
  const phi = lat * DEG;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const t = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * s * s);
  const tt = t * t;
  const cc = EP2 * c * c;
  const a = c * (lng * DEG - lon0);
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));
  const easting =
    K0 * n * (a + ((1 - tt + cc) * a ** 3) / 6 + ((5 - 18 * tt + tt * tt + 72 * cc - 58 * EP2) * a ** 5) / 120) + 500000;
  const northing =
    K0 *
    (m +
      n *
        t *
        ((a * a) / 2 +
          ((5 - tt + 9 * cc + 4 * cc * cc) * a ** 4) / 24 +
          ((61 - 58 * tt + tt * tt + 600 * cc - 330 * EP2) * a ** 6) / 720));
  return [easting, northing];
}

/* -------------------------------------------------------------------------- */
/*  Lectura del GML de partes de edificio (ETL)                                 */
/* -------------------------------------------------------------------------- */

export interface BuildingPartRecord {
  lng: number;
  lat: number;
  floors: number;
  areaM2: number;
}

/** Huso UTM del GML (srsName EPSG:258NN), o null si no aparece en este trozo. */
export function zoneFromGml(xml: string): number | null {
  const m = /srsName="[^"]*?EPSG:{1,2}(258\d\d)"/.exec(xml);
  return m ? Number(m[1]) - 25800 : null;
}

const PART_OPEN = /<(?:[\w-]+:)?BuildingPart[\s>]/g;
const PART_CLOSE = /<\/(?:[\w-]+:)?BuildingPart>/g;
const FLOORS = /<(?:[\w-]+:)?numberOfFloorsAboveGround[^>]*>\s*(\d+)\s*</;
const EXTERIOR = /<(?:[\w-]+:)?exterior[\s>]/;
const POSLIST = /<(?:[\w-]+:)?posList([^>]*)>([^<]+)</;

/**
 * Lee las partes de edificio COMPLETAS de un trozo de GML y devuelve lo que sobra (el principio
 * de la siguiente, para unirlo al trozo que venga). Sin plantas sobre rasante, se descarta.
 */
export function parseBuildingParts(xml: string, zone: number): { parts: BuildingPartRecord[]; rest: string } {
  const parts: BuildingPartRecord[] = [];
  let from = 0;
  PART_CLOSE.lastIndex = 0;
  for (;;) {
    const close = PART_CLOSE.exec(xml);
    if (!close) break;
    // Apertura de esta parte: la última antes del cierre.
    PART_OPEN.lastIndex = from;
    let open = -1;
    for (let m = PART_OPEN.exec(xml); m && m.index < close.index; m = PART_OPEN.exec(xml)) open = m.index;
    from = close.index + close[0].length;
    PART_CLOSE.lastIndex = from;
    if (open < 0) continue;
    const chunk = xml.slice(open, close.index);
    const fl = FLOORS.exec(chunk);
    if (!fl) continue;
    const floors = Number(fl[1]);
    if (!(floors >= 1)) continue;
    const ext = EXTERIOR.exec(chunk);
    if (!ext) continue;
    const pl = POSLIST.exec(chunk.slice(ext.index));
    if (!pl) continue;
    const dim = Number(/srsDimension="(\d)"/.exec(pl[1])?.[1] ?? 2) || 2;
    const nums = pl[2].trim().split(/\s+/).map(Number);
    const n = Math.floor(nums.length / dim);
    if (n < 3) continue;
    // Área y centroide del anillo (m, UTM), relativos al primer vértice para no perder precisión.
    const x0 = nums[0];
    const y0 = nums[1];
    let a2 = 0;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const ax = nums[k * dim] - x0;
      const ay = nums[k * dim + 1] - y0;
      const bx = nums[k2 * dim] - x0;
      const by = nums[k2 * dim + 1] - y0;
      const cr = ax * by - bx * ay;
      a2 += cr;
      cx += (ax + bx) * cr;
      cy += (ay + by) * cr;
    }
    if (!Number.isFinite(a2) || Math.abs(a2) < 1e-6) continue;
    const area = Math.abs(a2) / 2;
    const [lng, lat] = utmToLngLat(x0 + cx / (3 * a2), y0 + cy / (3 * a2), zone);
    parts.push({ lng, lat, floors, areaM2: area });
  }
  return { parts, rest: xml.slice(from) };
}

/* -------------------------------------------------------------------------- */
/*  Teselas                                                                     */
/* -------------------------------------------------------------------------- */

export interface HeightTileFile {
  v: 1;
  z: number;
  x: number;
  y: number;
  n: number;
  /** Por parte: x, y (0–4095 dentro de la tesela), plantas, área (m²). */
  t: number[];
}

export interface HeightIndexFile {
  v: 1;
  kind: "heights";
  generatedAt: string;
  z: number;
  tiles: string[];
  count: number;
  source: string;
  floorM: number;
  extraM: number;
}

export function encodeHeightTiles(parts: readonly BuildingPartRecord[], z = HEIGHT_TILE_ZOOM): Map<string, HeightTileFile> {
  const scale = 2 ** z;
  const by = new Map<string, number[][]>();
  for (const p of parts) {
    const fx = lngToMx(p.lng) * scale;
    const fy = latToMy(p.lat) * scale;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const key = `${x}/${y}`;
    const rec = [
      Math.min(STEPS - 1, Math.floor((fx - x) * STEPS)),
      Math.min(STEPS - 1, Math.floor((fy - y) * STEPS)),
      Math.min(255, Math.round(p.floors)),
      Math.max(1, Math.round(p.areaM2)),
    ];
    const list = by.get(key);
    if (list) list.push(rec);
    else by.set(key, [rec]);
  }
  const out = new Map<string, HeightTileFile>();
  for (const key of [...by.keys()].sort()) {
    const [x, y] = key.split("/").map(Number);
    const recs = by.get(key)!.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    out.set(key, { v: 1, z, x, y, n: recs.length, t: recs.flat() });
  }
  return out;
}

export interface DecodedHeightTile {
  key: string;
  count: number;
  /** Centroides en Mercator normalizado. */
  mx: Float64Array;
  my: Float64Array;
  floors: Uint8Array;
  area: Float32Array;
  /** Rejilla 64×64 de la tesela: inicio de cada celda en `items` (64·64 + 1 entradas). */
  cells: Uint32Array;
  items: Uint32Array;
  x0: number;
  y0: number;
  size: number;
}

export function decodeHeightTile(file: HeightTileFile): DecodedHeightTile | null {
  if (!file || file.v !== 1 || !Array.isArray(file.t) || file.t.length % FIELDS !== 0) return null;
  const n = file.t.length / FIELDS;
  const scale = 2 ** file.z;
  const mx = new Float64Array(n);
  const my = new Float64Array(n);
  const floors = new Uint8Array(n);
  const area = new Float32Array(n);
  const cellOf = new Uint32Array(n);
  const counts = new Uint32Array(GRID * GRID + 1);
  for (let i = 0; i < n; i++) {
    const qx = file.t[i * FIELDS];
    const qy = file.t[i * FIELDS + 1];
    mx[i] = (file.x + (qx + 0.5) / STEPS) / scale;
    my[i] = (file.y + (qy + 0.5) / STEPS) / scale;
    floors[i] = file.t[i * FIELDS + 2];
    area[i] = file.t[i * FIELDS + 3];
    const c = Math.floor((qy * GRID) / STEPS) * GRID + Math.floor((qx * GRID) / STEPS);
    cellOf[i] = c;
    counts[c + 1]++;
  }
  for (let c = 1; c < counts.length; c++) counts[c] += counts[c - 1];
  const fill = counts.slice(0, GRID * GRID);
  const items = new Uint32Array(n);
  for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;
  return { key: `${file.x}/${file.y}`, count: n, mx, my, floors, area, cells: counts, items, x0: file.x / scale, y0: file.y / scale, size: 1 / scale };
}

/** Teselas (z14) que toca un rectángulo en Mercator normalizado. */
export function heightTilesForRect(r: Bounds2D, z = HEIGHT_TILE_ZOOM): string[] {
  const scale = 2 ** z;
  const keys: string[] = [];
  for (let x = Math.floor(r.minX * scale); x <= Math.floor(r.maxX * scale); x++)
    for (let y = Math.floor(r.minY * scale); y <= Math.floor(r.maxY * scale); y++) keys.push(`${x}/${y}`);
  return keys;
}

/** ¿Está (x, y) dentro del anillo de `n` vértices que empieza en `coords[start]`? (pares x, y) */
function insideRing(coords: ArrayLike<number>, start: number, n: number, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = coords[start + 2 * i];
    const yi = coords[start + 2 * i + 1];
    const xj = coords[start + 2 * j];
    const yj = coords[start + 2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Altura (m) de una huella según las partes del Catastro cuyo centroide cae dentro: las plantas
 * de la parte más alta entre las que pesan (≥ 12 % del área de todas). Null si no hay ninguna.
 * Las coordenadas son pares x, y en Mercator normalizado (como en `BuildingSet`).
 */
export function heightForFootprint(
  tiles: Iterable<DecodedHeightTile>,
  coords: ArrayLike<number>,
  start: number,
  n: number,
  bbox: Bounds2D
): number | null {
  const found: Array<[number, number]> = [];
  let total = 0;
  for (const t of tiles) {
    if (bbox.maxX < t.x0 || bbox.minX > t.x0 + t.size || bbox.maxY < t.y0 || bbox.minY > t.y0 + t.size) continue;
    const c0 = Math.max(0, Math.floor(((bbox.minX - t.x0) / t.size) * GRID));
    const c1 = Math.min(GRID - 1, Math.floor(((bbox.maxX - t.x0) / t.size) * GRID));
    const r0 = Math.max(0, Math.floor(((bbox.minY - t.y0) / t.size) * GRID));
    const r1 = Math.min(GRID - 1, Math.floor(((bbox.maxY - t.y0) / t.size) * GRID));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * GRID + c;
        for (let k = t.cells[cell]; k < t.cells[cell + 1]; k++) {
          const i = t.items[k];
          const x = t.mx[i];
          const y = t.my[i];
          if (x < bbox.minX || x > bbox.maxX || y < bbox.minY || y > bbox.maxY) continue;
          if (!insideRing(coords, start, n, x, y)) continue;
          found.push([t.floors[i], t.area[i]]);
          total += t.area[i];
        }
      }
    }
  }
  if (found.length === 0) return null;
  let floors = 0;
  for (const [f, a] of found) if (a >= 0.12 * total && f > floors) floors = f;
  return floors > 0 ? heightFromFloors(floors) : null;
}

/* -------------------------------------------------------------------------- */
/*  Carga bajo demanda                                                          */
/* -------------------------------------------------------------------------- */

/** Altura sugerida para una huella sin altura en el mapa (null = no se sabe). */
export type HeightHint = (coords: ArrayLike<number>, start: number, n: number, bbox: Bounds2D) => number | null;

const MAX_TILES_IN_MEMORY = 24;

export class CatastroHeightStore {
  private index: Promise<Set<string> | null> | null = null;
  private tiles = new Map<string, DecodedHeightTile>();
  private pending = new Set<string>();
  private listeners = new Set<() => void>();
  private fetchImpl: typeof fetch;
  private base: string;

  constructor(opts: { fetchImpl?: typeof fetch; base?: string } = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.base = opts.base ?? "/data/heights";
  }

  /** Índice de teselas publicadas. Sin datos (404 o no es el índice) no se vuelve a pedir. */
  private loadIndex(): Promise<Set<string> | null> {
    this.index ??= this.fetchImpl(`${this.base}/index.json`).then(
      async (r) => {
        if (!r.ok) return null;
        try {
          const j = (await r.json()) as HeightIndexFile;
          return j && j.v === 1 && Array.isArray(j.tiles) ? new Set(j.tiles) : null;
        } catch {
          return null;
        }
      },
      () => {
        this.index = null;
        return null;
      }
    );
    return this.index;
  }

  /** Pide las teselas de la zona (Mercator normalizado); avisa a los suscritos cuando llegan. */
  ensure(rect: Bounds2D) {
    void this.loadIndex().then((index) => {
      if (!index) return;
      for (const key of heightTilesForRect(rect)) {
        if (!index.has(key) || this.tiles.has(key) || this.pending.has(key)) continue;
        this.pending.add(key);
        this.fetchImpl(`${this.base}/${HEIGHT_TILE_ZOOM}/${key}.json`)
          .then((r) => (r.ok ? (r.json() as Promise<HeightTileFile>) : null))
          .then((j) => (j ? decodeHeightTile(j) : null))
          .catch(() => null)
          .then((t) => {
            this.pending.delete(key);
            if (!t) return;
            this.tiles.set(key, t);
            while (this.tiles.size > MAX_TILES_IN_MEMORY) this.tiles.delete(this.tiles.keys().next().value as string);
            this.listeners.forEach((fn) => fn());
          });
      }
    });
  }

  /** Sugerencia síncrona con lo ya cargado (null si aún no hay nada). */
  hint(): HeightHint | null {
    if (this.tiles.size === 0) return null;
    const tiles = [...this.tiles.values()];
    return (coords, start, n, bbox) => heightForFootprint(tiles, coords, start, n, bbox);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const catastroHeights = new CatastroHeightStore();
