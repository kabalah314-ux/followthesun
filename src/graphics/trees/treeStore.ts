import { latToMy, lngToMx, metersPerMercatorUnit } from "../../lib/coordinates";
import {
  crownShape,
  decodeTreeTile,
  tilesForBounds,
  type DecodedTreeTile,
  type TreeIndexFile,
  type TreeTileFile,
} from "./treeTiles";

/**
 * Carga bajo demanda de las teselas del arbolado (`/data/trees/`) y las prepara para la GPU.
 *
 * Solo se piden las teselas que existen (según `index.json`) y que toca la vista; se guardan las
 * últimas en memoria (el service worker las guarda además en caché). Los árboles se devuelven en
 * metros locales desde un origen cercano (x = este, y = sur), como la geometría de los edificios.
 */

/** Por árbol: x, y (m locales), altura total (m), radio horizontal de copa (m), tipo, semilla. */
export const TREE_INSTANCE_STRIDE = 6;

export interface TreeBatch {
  /** Origen (Mercator normalizado) y metros por unidad Mercator en él. */
  ox: number;
  oy: number;
  mpu: number;
  count: number;
  instances: Float32Array;
  /** Altura máxima de copa (m): acota la sombra. */
  maxHeight: number;
  /** Cambia con cada lote (para saber si hay que subirlo a la GPU). */
  version: number;
}

export interface TreeBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const BASE = "/data/trees";
const MAX_TILES_IN_MEMORY = 48;

let versionSeq = 1;

/** Semilla estable por árbol (0–1) para variar la forma sin guardar nada. */
function seedOf(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export class TreeStore {
  private index: Promise<Set<string> | null> | null = null;
  private tiles = new Map<string, Promise<DecodedTreeTile | null>>();
  private fetchImpl: typeof fetch;
  private base: string;

  constructor(opts: { fetchImpl?: typeof fetch; base?: string } = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.base = opts.base ?? BASE;
  }

  /**
   * Teselas disponibles (null si aún no hay datos de arbolado publicados). Sin datos (404 o una
   * respuesta que no es el índice) no se vuelve a pedir en la sesión; sin red, sí.
   */
  loadIndex(): Promise<Set<string> | null> {
    this.index ??= this.fetchImpl(`${this.base}/index.json`).then(
      async (r) => {
        if (!r.ok) return null;
        try {
          const j = (await r.json()) as TreeIndexFile;
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

  private tile(key: string): Promise<DecodedTreeTile | null> {
    const hit = this.tiles.get(key);
    if (hit) {
      // Al final de la cola: es la más reciente.
      this.tiles.delete(key);
      this.tiles.set(key, hit);
      return hit;
    }
    const p = this.fetchImpl(`${this.base}/14/${key}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TreeTileFile>) : null))
      .then((j) => (j ? decodeTreeTile(j) : null))
      .catch(() => {
        this.tiles.delete(key);
        return null;
      });
    this.tiles.set(key, p);
    while (this.tiles.size > MAX_TILES_IN_MEMORY) {
      const oldest = this.tiles.keys().next().value as string;
      this.tiles.delete(oldest);
    }
    return p;
  }

  /**
   * Árboles dentro de `bounds`, los más cercanos a `center` primero y como mucho `maxTrees`.
   * Devuelve null si todavía no hay datos de arbolado.
   */
  async batchFor(bounds: TreeBounds, center: { lng: number; lat: number }, maxTrees: number): Promise<TreeBatch | null> {
    const index = await this.loadIndex();
    if (!index) return null;
    const keys = tilesForBounds(bounds).filter((k) => index.has(k));
    const tiles = (await Promise.all(keys.map((k) => this.tile(k)))).filter((t): t is DecodedTreeTile => t !== null);
    return buildTreeBatch(tiles, bounds, center, maxTrees);
  }
}

/** Pura: junta las teselas, recorta a la caja, ordena por distancia y pasa a metros locales. */
export function buildTreeBatch(
  tiles: readonly DecodedTreeTile[],
  bounds: TreeBounds,
  center: { lng: number; lat: number },
  maxTrees: number
): TreeBatch {
  const ox = lngToMx(center.lng);
  const oy = latToMy(center.lat);
  const mpu = metersPerMercatorUnit(center.lat);
  const minX = lngToMx(bounds.west);
  const maxX = lngToMx(bounds.east);
  const minY = latToMy(bounds.north);
  const maxY = latToMy(bounds.south);

  const pick: Array<{ t: DecodedTreeTile; i: number; d: number }> = [];
  for (const t of tiles) {
    for (let i = 0; i < t.count; i++) {
      const x = t.coords[2 * i];
      const y = t.coords[2 * i + 1];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const dx = (x - ox) * mpu;
      const dy = (y - oy) * mpu;
      pick.push({ t, i, d: dx * dx + dy * dy });
    }
  }
  if (pick.length > maxTrees) {
    pick.sort((a, b) => a.d - b.d);
    pick.length = maxTrees;
  }
  const instances = new Float32Array(pick.length * TREE_INSTANCE_STRIDE);
  let maxHeight = 0;
  for (let k = 0; k < pick.length; k++) {
    const { t, i } = pick[k];
    const x = (t.coords[2 * i] - ox) * mpu;
    const y = (t.coords[2 * i + 1] - oy) * mpu;
    const h = t.heightM[i];
    const o = k * TREE_INSTANCE_STRIDE;
    instances[o] = x;
    instances[o + 1] = y;
    instances[o + 2] = h;
    instances[o + 3] = crownShape(t.kind[i], h, t.crownM[i]).rh;
    instances[o + 4] = t.kind[i];
    instances[o + 5] = seedOf(t.coords[2 * i] * 1e5, t.coords[2 * i + 1] * 1e5);
    if (h > maxHeight) maxHeight = h;
  }
  return { ox, oy, mpu, count: pick.length, instances, maxHeight, version: versionSeq++ };
}

export const treeStore = new TreeStore();
