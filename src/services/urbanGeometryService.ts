import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { OPEN_TILES, SEARCH_CONFIG } from "../config";
import { latToMy, lngToMx, metersPerMercatorUnit } from "../lib/coordinates";
import { buildBuildingSet, type BuildingSet } from "./buildingService";

/**
 * urbanGeometryService — edificios de CUALQUIER zona de Barcelona, para calcular sombras urbanas
 * en los lugares candidatos aunque no estén en pantalla.
 *
 * La capa del mapa solo conoce los edificios visibles. Aquí se descargan las teselas vectoriales
 * de OpenFreeMap (OpenStreetMap, nivel 14) de las zonas que hacen falta y se decodifican con
 * `@mapbox/vector-tile`. Es la MISMA fuente de datos que usa el mapa, sin token.
 *
 *  · Solo se descargan las teselas que rodean a los puntos analizados (radio de sombra incluido).
 *  · Las teselas se guardan en memoria durante la sesión; un fallo no se recuerda (se reintenta).
 *  · Un punto solo cuenta con «edificios conocidos» si TODAS sus teselas se cargaron: nunca se
 *    confunde «no se pudo descargar» con «no hay edificios».
 *  · Los edificios que cruzan el borde de una tesela aparecen recortados en las dos; no afecta al
 *    cálculo de sombras (solo se comprueba si un rayo cruza un contorno).
 */

const Z = 14;

interface TileResult {
  ok: boolean;
  set: BuildingSet | null;
}

type LooseFeatures = Parameters<typeof buildBuildingSet>[0];

function decodeTile(buffer: ArrayBuffer, x: number, y: number): BuildingSet {
  const tile = new VectorTile(new Pbf(buffer));
  const layer = tile.layers["building"];
  const features: LooseFeatures = [];
  if (layer) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3) continue;
      // Partes elevadas (voladizos, torres sobre una base): se omiten para no crear sombras flotantes.
      const minHeight = Number(f.properties.render_min_height ?? 0);
      if (minHeight > 0) continue;
      features.push(f.toGeoJSON(x, y, Z) as unknown as LooseFeatures[number]);
    }
  }
  const n = 2 ** Z;
  return buildBuildingSet(
    features,
    { minX: x / n, maxX: (x + 1) / n, minY: y / n, maxY: (y + 1) / n },
    "openfreemap-z14"
  );
}

/** Teselas que cubren un cuadrado de `radiusM` metros alrededor de un punto. */
function tileRange(lng: number, lat: number, radiusM: number): Array<{ x: number; y: number }> {
  const n = 2 ** Z;
  const d = radiusM / metersPerMercatorUnit(lat);
  const mx = lngToMx(lng);
  const my = latToMy(lat);
  const x0 = Math.floor((mx - d) * n);
  const x1 = Math.floor((mx + d) * n);
  const y0 = Math.floor((my - d) * n);
  const y1 = Math.floor((my + d) * n);
  const out: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
}

/** Une varios conjuntos en uno (arrays tipados concatenados). */
function mergeSets(sets: BuildingSet[]): BuildingSet {
  let count = 0;
  let verts = 0;
  for (const s of sets) {
    count += s.count;
    verts += s.coords.length / 2;
  }
  const coords = new Float64Array(verts * 2);
  const offsets = new Uint32Array(count + 1);
  const heights = new Float32Array(count);
  const renderHeights = new Float32Array(count);
  const orientation = new Float32Array(count);
  const bbox = new Float64Array(count * 4);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let ci = 0;
  let vi = 0;
  for (const s of sets) {
    coords.set(s.coords, vi * 2);
    for (let i = 0; i < s.count; i++) {
      offsets[ci + i] = vi + s.offsets[i];
      heights[ci + i] = s.heights[i];
      renderHeights[ci + i] = s.renderHeights[i];
      orientation[ci + i] = s.orientation[i];
    }
    bbox.set(s.bbox, ci * 4);
    minX = Math.min(minX, s.coverage.minX);
    minY = Math.min(minY, s.coverage.minY);
    maxX = Math.max(maxX, s.coverage.maxX);
    maxY = Math.max(maxY, s.coverage.maxY);
    vi += s.coords.length / 2;
    ci += s.count;
  }
  offsets[count] = vi;

  return {
    count,
    coords,
    offsets,
    heights,
    renderHeights,
    orientation,
    bbox,
    // Los cubos por altura solo los usa el dibujo del mapa; el cálculo de sombras no.
    buckets: [new Uint32Array(0)],
    coverage: { minX, minY, maxX, maxY },
    source: "openfreemap-z14",
  };
}

export interface UrbanGeometry {
  buildings: BuildingSet | null;
  /** ¿Se cargaron todas las teselas necesarias alrededor del punto? */
  known(lng: number, lat: number): boolean;
  stats: { tiles: number; loaded: number; failed: number; buildings: number };
}

export interface UrbanLoadHooks {
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
}

const abortError = () => new DOMException("Búsqueda cancelada", "AbortError");

class UrbanGeometryService {
  private template: Promise<string> | null = null;
  private readonly tiles = new Map<string, Promise<TileResult>>();
  private merged: { key: string; set: BuildingSet } | null = null;

  /** La URL de las teselas lleva una versión que cambia: se lee siempre del TileJSON. */
  private getTemplate(): Promise<string> {
    if (!this.template) {
      this.template = fetch(OPEN_TILES.vectorSource)
        .then((r) => {
          if (!r.ok) throw new Error(`TileJSON HTTP ${r.status}`);
          return r.json() as Promise<{ tiles?: unknown }>;
        })
        .then((j) => {
          const t = Array.isArray(j.tiles) ? j.tiles[0] : null;
          if (typeof t !== "string") throw new Error("TileJSON sin teselas");
          return t;
        })
        .catch((e) => {
          this.template = null;
          throw e;
        });
    }
    return this.template;
  }

  private async fetchTile(x: number, y: number): Promise<TileResult> {
    try {
      const template = await this.getTemplate();
      const url = template
        .replace("{z}", String(Z))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      const res = await fetch(url);
      // Sin datos en esa tesela (p. ej. mar abierto): es un resultado válido, no un fallo.
      if (res.status === 404 || res.status === 204) return { ok: true, set: null };
      if (!res.ok) return { ok: false, set: null };
      return { ok: true, set: decodeTile(await res.arrayBuffer(), x, y) };
    } catch {
      return { ok: false, set: null };
    }
  }

  private loadTile(x: number, y: number): Promise<TileResult> {
    const key = `${x}/${y}`;
    let p = this.tiles.get(key);
    if (!p) {
      p = this.fetchTile(x, y).then((r) => {
        if (!r.ok) this.tiles.delete(key); // los fallos no se recuerdan
        return r;
      });
      this.tiles.set(key, p);
    }
    return p;
  }

  /**
   * Carga los edificios necesarios para analizar `points` con sombras de hasta `radiusM` metros.
   * Las descargas ya hechas no se repiten.
   */
  async load(
    points: ReadonlyArray<{ lng: number; lat: number }>,
    radiusM: number,
    hooks: UrbanLoadHooks = {}
  ): Promise<UrbanGeometry> {
    const need = new Map<string, { x: number; y: number }>();
    for (const p of points) {
      for (const t of tileRange(p.lng, p.lat, radiusM)) need.set(`${t.x}/${t.y}`, t);
    }
    const list = [...need.values()];
    const results = new Map<string, TileResult>();
    let done = 0;
    let next = 0;
    hooks.onProgress?.(0, list.length);

    const worker = async () => {
      while (next < list.length) {
        if (hooks.signal?.aborted) return;
        const t = list[next++];
        const r = await this.loadTile(t.x, t.y);
        results.set(`${t.x}/${t.y}`, r);
        done++;
        hooks.onProgress?.(done, list.length);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SEARCH_CONFIG.tileConcurrency, list.length) }, worker)
    );
    if (hooks.signal?.aborted) throw abortError();

    const okKeys = [...results.entries()].filter(([, r]) => r.ok).map(([k]) => k).sort();
    const key = okKeys.join(",");
    let set: BuildingSet | null = null;
    if (this.merged && this.merged.key === key) {
      set = this.merged.set;
    } else {
      const sets = [...results.values()]
        .filter((r): r is TileResult & { set: BuildingSet } => r.ok && r.set !== null)
        .map((r) => r.set);
      if (sets.length > 0) {
        set = mergeSets(sets);
        this.merged = { key, set };
      }
    }

    const failed = list.length - okKeys.length;
    return {
      buildings: set,
      known: (lng, lat) =>
        set !== null &&
        tileRange(lng, lat, radiusM).every((t) => results.get(`${t.x}/${t.y}`)?.ok === true),
      stats: {
        tiles: list.length,
        loaded: okKeys.length,
        failed,
        buildings: set ? set.count : 0,
      },
    };
  }
}

export const urbanGeometryService = new UrbanGeometryService();
