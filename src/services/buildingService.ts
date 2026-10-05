import { DEG, EARTH_CIRC, distanceToLine, latToMy, lngToMx } from "../lib/coordinates";
import type { Bounds2D } from "../types";
import type { MapLike } from "./map/types";

/**
 * buildingService — huellas, alturas y orientación de edificios.
 *
 * MVP: se leen de las teselas vectoriales visibles (OpenStreetMap / Mapbox Streets).
 *  · Mapbox Streets v8: propiedad `height`
 *  · OpenMapTiles:      propiedad `render_height`
 * Para conectar catastro/LiDAR basta con implementar `BuildingProvider` y devolver un `BuildingSet`.
 */

/** Capa invisible del estilo que mantiene los edificios consultables aunque se oculten. */
export const BUILDINGS_QUERY_LAYER = "buildings-query";

/** Límites (m) de las clases de altura: se dibujan de menor a mayor para que las sombras altas cubran tejados bajos. */
export const HEIGHT_BUCKETS = [7, 12, 18, 26, 40];

export type Rect = Bounds2D;

export interface BuildingSet {
  count: number;
  /** Pares x,y (Mercator normalizado) de los anillos exteriores concatenados, orientación homogénea. */
  coords: Float64Array;
  /** Índice de vértice inicial de cada edificio (count + 1 entradas). */
  offsets: Uint32Array;
  /** Altura en metros. */
  heights: Float32Array;
  /** Orientación del lado mayor en grados desde el norte (0-180). */
  orientation: Float32Array;
  /** minX, minY, maxX, maxY por edificio. */
  bbox: Float64Array;
  /** Índices de edificios agrupados por clase de altura. */
  buckets: Uint32Array[];
  /** Zona del mapa que se consultó (para saber si un punto tiene datos a su alrededor). */
  coverage: Rect;
  source: string;
}

export interface BuildingProvider {
  id: string;
  extract(map: MapLike): BuildingSet | null;
}

interface LooseFeature {
  geometry?: { type: string; coordinates: any } | null;
  properties?: Record<string, any> | null;
}

function estimateHeight(raw: number, areaM2: number) {
  let h = raw;
  if (!isFinite(h) || h <= 0) h = 5;
  // ≈5 m es el valor por defecto cuando OSM no tiene altura ni plantas.
  if (h <= 5.01) {
    if (areaM2 < 45) return 3;
    if (areaM2 < 120) return 6;
    return 9;
  }
  return h;
}

export function buildBuildingSet(
  features: LooseFeature[],
  coverage: Rect,
  source: string
): BuildingSet {
  const coords: number[] = [];
  const offsets: number[] = [0];
  const heights: number[] = [];
  const orientation: number[] = [];
  const bbox: number[] = [];
  const buckets: number[][] = HEIGHT_BUCKETS.map(() => []);
  buckets.push([]);
  let count = 0;

  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const polys =
      g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
    if (!polys) continue;
    const props = f.properties ?? {};
    const rawH = Number(props.height ?? props.render_height);

    for (const poly of polys) {
      const ring: number[][] | undefined = poly?.[0];
      if (!ring || ring.length < 4) continue;
      let n = ring.length;
      if (ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
      if (n < 3) continue;

      const start = coords.length;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < n; k++) {
        const mx = lngToMx(ring[k][0]);
        const my = latToMy(ring[k][1]);
        coords.push(mx, my);
        if (mx < minX) minX = mx;
        if (mx > maxX) maxX = mx;
        if (my < minY) minY = my;
        if (my > maxY) maxY = my;
      }

      // Área con signo relativa al primer vértice (evita pérdida de precisión).
      const x0 = coords[start];
      const y0 = coords[start + 1];
      let area2 = 0;
      for (let k = 0; k < n; k++) {
        const k2 = k + 1 === n ? 0 : k + 1;
        const ax = coords[start + 2 * k] - x0;
        const ay = coords[start + 2 * k + 1] - y0;
        const bx = coords[start + 2 * k2] - x0;
        const by = coords[start + 2 * k2 + 1] - y0;
        area2 += ax * by - bx * ay;
      }

      const mpu = EARTH_CIRC * Math.cos(ring[0][1] * DEG);
      const areaM2 = (Math.abs(area2) / 2) * mpu * mpu;
      if (areaM2 < 6) {
        coords.length = start;
        continue;
      }

      // Orientación homogénea (área positiva) para poder unir sombras con regla nonzero.
      if (area2 < 0) {
        for (let a = 0, b = n - 1; a < b; a++, b--) {
          const tx = coords[start + 2 * a];
          const ty = coords[start + 2 * a + 1];
          coords[start + 2 * a] = coords[start + 2 * b];
          coords[start + 2 * a + 1] = coords[start + 2 * b + 1];
          coords[start + 2 * b] = tx;
          coords[start + 2 * b + 1] = ty;
        }
      }

      // Orientación: azimut del lado más largo (módulo 180°).
      let longest = 0;
      let angle = 0;
      for (let k = 0; k < n; k++) {
        const k2 = k + 1 === n ? 0 : k + 1;
        const dx = coords[start + 2 * k2] - coords[start + 2 * k];
        const dy = coords[start + 2 * k2 + 1] - coords[start + 2 * k + 1];
        const len = dx * dx + dy * dy;
        if (len > longest) {
          longest = len;
          angle = Math.atan2(dx, -dy) / DEG;
        }
      }
      angle = ((angle % 180) + 180) % 180;

      const h = estimateHeight(rawH, areaM2);
      let bucket = HEIGHT_BUCKETS.length;
      for (let b = 0; b < HEIGHT_BUCKETS.length; b++) {
        if (h < HEIGHT_BUCKETS[b]) {
          bucket = b;
          break;
        }
      }
      buckets[bucket].push(count);
      heights.push(h);
      orientation.push(angle);
      bbox.push(minX, minY, maxX, maxY);
      offsets.push(coords.length / 2);
      count++;
    }
  }

  return {
    count,
    coords: Float64Array.from(coords),
    offsets: Uint32Array.from(offsets),
    heights: Float32Array.from(heights),
    orientation: Float32Array.from(orientation),
    bbox: Float64Array.from(bbox),
    buckets: buckets.map((b) => Uint32Array.from(b)),
    coverage,
    source,
  };
}

/** ¿Hay datos de edificios en un radio razonable alrededor del punto? */
export function buildingsCover(set: BuildingSet | null, lng: number, lat: number, marginM = 350) {
  if (!set || set.count === 0) return false;
  const mx = lngToMx(lng);
  const my = latToMy(lat);
  const m = marginM / (EARTH_CIRC * Math.cos(lat * DEG));
  const c = set.coverage;
  return mx - m >= c.minX && mx + m <= c.maxX && my - m >= c.minY && my + m <= c.maxY;
}

/**
 * Cuadrado centrado en la vista y contenido dentro de la zona consultada.
 * Es conservador: con rotación o inclinación la zona consultada es un trapecio.
 */
function inscribedCoverage(map: MapLike, w: number, h: number, padX: number, padY: number): Rect {
  const c = map.unproject([w / 2, h / 2]);
  const cx = lngToMx(c.lng);
  const cy = latToMy(c.lat);
  const corners: Array<[number, number]> = [
    [-padX, -padY],
    [w + padX, -padY],
    [w + padX, h + padY],
    [-padX, h + padY],
  ].map(([x, y]) => {
    const g = map.unproject([x, y]);
    return [lngToMx(g.lng), latToMy(g.lat)] as [number, number];
  });
  let r = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    r = Math.min(r, distanceToLine(cx, cy, a[0], a[1], b[0], b[1]));
  }
  return { minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r };
}

export const vectorTileBuildings: BuildingProvider = {
  id: "vector-tiles",
  extract(map) {
    const el = map.getContainer();
    const w = el.clientWidth;
    const h = el.clientHeight;
    const padX = w * 0.35;
    const padY = h * 0.35;
    const feats = map.queryRenderedFeatures(
      [
        [-padX, -padY],
        [w + padX, h + padY],
      ],
      { layers: [BUILDINGS_QUERY_LAYER] }
    );
    const coverage = inscribedCoverage(map, w, h, padX, padY);
    return buildBuildingSet(feats as LooseFeature[], coverage, "vector-tiles");
  },
};

export const buildingService = {
  provider: vectorTileBuildings,
  extract: (map: MapLike) => vectorTileBuildings.extract(map),
};
