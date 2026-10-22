import { pointInRing } from "../../lib/coordinates";
import { ringBounds, type LLBounds } from "../../lib/geometry";

/**
 * Barrios de Barcelona a partir de las «Unitats administratives» de Open Data BCN (CC BY 4.0):
 * polígonos en WKT (WGS84) → índice para saber en qué barrio cae un punto.
 *
 * Lo usa el ETL (scripts/etl/build-inventory.ts) para añadir `metadata.neighborhood` y
 * `metadata.district` a cada lugar de `public/data/places.json`; con ese dato, el prerender genera
 * las páginas /barrio/<slug>. Puro y sin red: la descarga la hace el ETL.
 */

/** Campos del recurso «BarcelonaCiutat_Barris.csv» del conjunto 20170706-districtes-barris. */
export interface NeighborhoodRecord {
  codi_barri?: string | number;
  nom_barri?: string;
  codi_districte?: string | number;
  nom_districte?: string;
  geometria_wgs84?: string;
}

export const NEIGHBORHOOD_FIELDS = ["codi_barri", "nom_barri", "codi_districte", "nom_districte", "geometria_wgs84"] as const;

export interface Neighborhood {
  code: string;
  name: string;
  districtCode: string;
  district: string;
  /** Polígonos → anillos (el primero, el exterior; los demás, huecos) → [lng, lat]. */
  polygons: number[][][][];
  bounds: LLBounds;
}

const parseRing = (txt: string): number[][] =>
  txt
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));

/** "(x y, …), (x y, …)" → anillos con al menos 4 puntos. */
function parsePolygonBody(txt: string): number[][][] {
  const rings: number[][][] = [];
  const re = /\(([^()]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const ring = parseRing(m[1]);
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** WKT `POLYGON` o `MULTIPOLYGON` (2D; se ignora Z/M) → polígonos → anillos → [lng, lat]. */
export function parseWktPolygons(wkt: string): number[][][][] {
  const m = /^\s*(MULTIPOLYGON|POLYGON)\s*(?:ZM|Z|M)?\s*\(([\s\S]*)\)\s*$/i.exec(wkt ?? "");
  if (!m) return [];
  const body = m[2];
  if (m[1].toUpperCase() === "POLYGON") {
    const rings = parsePolygonBody(body);
    return rings.length ? [rings] : [];
  }
  const polygons: number[][][][] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        const rings = parsePolygonBody(body.slice(start + 1, i));
        if (rings.length) polygons.push(rings);
        start = -1;
      }
    }
  }
  return polygons;
}

/** Dentro del exterior y fuera de todos los huecos. */
export function pointInPolygonRings(lng: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(lng, lat, rings[i])) return false;
  return true;
}

function mergeBounds(a: LLBounds, b: LLBounds): LLBounds {
  return {
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
    south: Math.min(a.south, b.south),
    north: Math.max(a.north, b.north),
  };
}

/** Registros del datastore → barrios con geometría válida (los que no la traen se descartan). */
export function toNeighborhoods(records: readonly NeighborhoodRecord[]): Neighborhood[] {
  const out: Neighborhood[] = [];
  for (const r of records) {
    const name = String(r.nom_barri ?? "").trim();
    const polygons = parseWktPolygons(String(r.geometria_wgs84 ?? ""));
    if (!name || polygons.length === 0) continue;
    const bounds = polygons.map((p) => ringBounds(p[0])).reduce(mergeBounds);
    out.push({
      code: String(r.codi_barri ?? "").trim(),
      name,
      districtCode: String(r.codi_districte ?? "").trim(),
      district: String(r.nom_districte ?? "").trim(),
      polygons,
      bounds,
    });
  }
  return out;
}

export interface NeighborhoodHit {
  name: string;
  district: string;
  code: string;
}

/** Índice simple con prefiltro por caja: 73 barrios, miles de puntos en milisegundos. */
export function createNeighborhoodIndex(list: readonly Neighborhood[]) {
  return {
    size: list.length,
    locate(lat: number, lng: number): NeighborhoodHit | null {
      for (const n of list) {
        const b = n.bounds;
        if (lng < b.west || lng > b.east || lat < b.south || lat > b.north) continue;
        if (n.polygons.some((rings) => pointInPolygonRings(lng, lat, rings))) {
          return { name: n.name, district: n.district, code: n.code };
        }
      }
      return null;
    },
  };
}

/** Divide una caja en `rows × cols` teselas (para consultas a Overpass más ligeras). */
export function splitBounds<B extends { south: number; west: number; north: number; east: number }>(
  b: B,
  rows: number,
  cols: number
): Array<{ south: number; west: number; north: number; east: number }> {
  const out: Array<{ south: number; west: number; north: number; east: number }> = [];
  const dLat = (b.north - b.south) / rows;
  const dLng = (b.east - b.west) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        south: b.south + r * dLat,
        north: r === rows - 1 ? b.north : b.south + (r + 1) * dLat,
        west: b.west + c * dLng,
        east: c === cols - 1 ? b.east : b.west + (c + 1) * dLng,
      });
    }
  }
  return out;
}
