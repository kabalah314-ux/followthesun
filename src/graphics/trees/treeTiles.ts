import type { TreeKind } from "./species";

/**
 * Teselas del arbolado (generadas por scripts/etl/build-trees.ts en public/data/trees/).
 *
 *   /data/trees/index.json           lista de teselas con árboles, recuento y fuentes
 *   /data/trees/14/{x}/{y}.json      árboles de una tesela z14 (~1,8 × 1,4 km en Barcelona)
 *
 * Cada árbol son 5 enteros: posición dentro de la tesela (0–4095, unos 30 cm), tipo de árbol,
 * altura y diámetro de copa en medios metros. Unos 20 bytes por árbol en JSON (comprimido, la
 * mitad), así que una tesela del centro pesa unas decenas de KB.
 */

export const TREE_TILE_ZOOM = 14;
export const TREE_TILE_STEPS = 4096;
export const TREE_FIELDS = 5;

export interface TreeTileFile {
  v: 1;
  z: number;
  x: number;
  y: number;
  /** Número de árboles. */
  n: number;
  /** [qx, qy, tipo, altura×2, copa×2] por árbol. */
  t: number[];
}

export interface TreeIndexFile {
  v: 1;
  kind: "trees";
  generatedAt: string;
  z: number;
  /** «x/y» de cada tesela con árboles. */
  tiles: string[];
  count: number;
  sources: Array<{ name: string; license: string; url: string }>;
}

export interface TreeRecord {
  lng: number;
  lat: number;
  kind: TreeKind;
  heightM: number;
  crownM: number;
}

/** Tesela (con decimales) de un punto: la parte entera es la tesela; la fraccionaria, la posición dentro. */
export function tileOf(lng: number, lat: number, z = TREE_TILE_ZOOM): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/** Agrupa árboles por tesela y los codifica (orden estable: por fila y columna dentro de la tesela). */
export function encodeTreeTiles(trees: readonly TreeRecord[], z = TREE_TILE_ZOOM): Map<string, TreeTileFile> {
  const byTile = new Map<string, number[][]>();
  for (const t of trees) {
    const p = tileOf(t.lng, t.lat, z);
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    const qx = Math.min(TREE_TILE_STEPS - 1, Math.max(0, Math.round((p.x - tx) * TREE_TILE_STEPS)));
    const qy = Math.min(TREE_TILE_STEPS - 1, Math.max(0, Math.round((p.y - ty) * TREE_TILE_STEPS)));
    const key = `${tx}/${ty}`;
    let list = byTile.get(key);
    if (!list) byTile.set(key, (list = []));
    list.push([qx, qy, t.kind, Math.round(t.heightM * 2), Math.round(t.crownM * 2)]);
  }
  const out = new Map<string, TreeTileFile>();
  for (const key of [...byTile.keys()].sort()) {
    const list = byTile.get(key)!;
    list.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2] || a[3] - b[3]);
    const [x, y] = key.split("/").map(Number);
    out.set(key, { v: 1, z, x, y, n: list.length, t: list.flat() });
  }
  return out;
}

/** Árboles de una tesela en coordenadas Mercator normalizadas (0–1), listos para la GPU. */
export interface DecodedTreeTile {
  key: string;
  count: number;
  /** Pares x, y Mercator normalizados. */
  coords: Float64Array;
  kind: Uint8Array;
  heightM: Float32Array;
  crownM: Float32Array;
}

export function decodeTreeTile(file: TreeTileFile): DecodedTreeTile | null {
  if (!file || file.v !== 1 || !Array.isArray(file.t) || file.t.length % TREE_FIELDS !== 0) return null;
  const n = file.t.length / TREE_FIELDS;
  const scale = 2 ** file.z;
  const coords = new Float64Array(n * 2);
  const kind = new Uint8Array(n);
  const heightM = new Float32Array(n);
  const crownM = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * TREE_FIELDS;
    coords[2 * i] = (file.x + file.t[o] / TREE_TILE_STEPS) / scale;
    coords[2 * i + 1] = (file.y + file.t[o + 1] / TREE_TILE_STEPS) / scale;
    kind[i] = Math.min(4, Math.max(0, file.t[o + 2] | 0));
    heightM[i] = file.t[o + 3] / 2;
    crownM[i] = file.t[o + 4] / 2;
  }
  return { key: `${file.x}/${file.y}`, count: n, coords, kind, heightM, crownM };
}

/** Teselas z14 que tocan una caja (en grados). */
export function tilesForBounds(b: { west: number; south: number; east: number; north: number }, z = TREE_TILE_ZOOM): string[] {
  const a = tileOf(b.west, b.north, z);
  const c = tileOf(b.east, b.south, z);
  const out: string[] = [];
  for (let y = Math.floor(a.y); y <= Math.floor(c.y); y++) {
    for (let x = Math.floor(a.x); x <= Math.floor(c.x); x++) out.push(`${x}/${y}`);
  }
  return out;
}

/**
 * Densidad de la copa (fracción de luz que tapa) por tipo de árbol en un día del año.
 * Los caducifolios pierden la hoja de diciembre a marzo; los semicaducifolios (tipuana,
 * jacarandá) aclaran a final del invierno. Índices: 0 perenne · 1 caducifolio · 2 palmera ·
 * 3 conífera · 4 semicaducifolio.
 */
export function leafDensities(date: Date): [number, number, number, number, number] {
  // Mes con decimales (0 = 1 de enero) para que el cambio sea gradual.
  const m = date.getUTCMonth() + (date.getUTCDate() - 1) / 31;
  const deciduous = interpolateMonthly(m, [0.22, 0.2, 0.28, 0.5, 0.74, 0.8, 0.8, 0.8, 0.78, 0.72, 0.5, 0.3]);
  const semi = interpolateMonthly(m, [0.66, 0.5, 0.45, 0.55, 0.72, 0.78, 0.78, 0.78, 0.78, 0.76, 0.74, 0.72]);
  return [0.82, deciduous, 0.55, 0.85, semi];
}

function interpolateMonthly(m: number, table: readonly number[]): number {
  const i = Math.floor(m) % 12;
  const f = m - Math.floor(m);
  const a = table[i];
  const b = table[(i + 1) % 12];
  return a + (b - a) * f;
}

/** Copa como elipsoide: radio horizontal, radio vertical y altura del centro (m). */
export function crownShape(kind: number, heightM: number, crownM: number): { rh: number; rv: number; hc: number } {
  const rh = crownM / 2;
  let rv = kind === 2 ? rh * 0.45 : kind === 3 ? rh * 1.25 : rh * 0.8;
  rv = Math.min(rv, heightM * 0.45);
  const hc = Math.max(heightM - rv, rv);
  return { rh, rv, hc };
}
