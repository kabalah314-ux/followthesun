import { DEG, distanceMeters, pointInRing } from "../../lib/coordinates";
import type { MapLike } from "./types";

/**
 * Nombres de calles, parques y barrios leídos de las teselas ya cargadas (sin red).
 * Cada esquema vectorial tiene sus capas y campos; el resto de la app solo ve `getPlaceName`.
 */

interface Feat {
  geometry?: { type: string; coordinates: any } | null;
  properties?: Record<string, any> | null;
}

function query(map: MapLike, sourceId: string, sourceLayer: string, filter?: unknown): Feat[] {
  try {
    return map.querySourceFeatures(sourceId, { sourceLayer, filter }) as Feat[];
  } catch {
    return [];
  }
}

function distToSegmentM(lng: number, lat: number, a: number[], b: number[], cosLat: number): number {
  const k = 111_320;
  const px = (lng - a[0]) * cosLat * k;
  const py = (lat - a[1]) * k;
  const bx = (b[0] - a[0]) * cosLat * k;
  const by = (b[1] - a[1]) * k;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - bx * t, py - by * t);
}

function nearestStreet(
  map: MapLike,
  sourceId: string,
  sourceLayer: string,
  lng: number,
  lat: number,
  nameOf: (p: Record<string, any>) => string | undefined
): { name: string; dist: number } | null {
  const cosLat = Math.cos(lat * DEG);
  let best = "";
  let bestD = Infinity;
  for (const f of query(map, sourceId, sourceLayer, ["has", "name"])) {
    const g = f.geometry;
    const name = f.properties ? nameOf(f.properties) : undefined;
    if (!g || !name) continue;
    const lines: number[][][] =
      g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const d = distToSegmentM(lng, lat, line[i], line[i + 1], cosLat);
        if (d < bestD) {
          bestD = d;
          best = name;
        }
      }
    }
  }
  return best ? { name: best, dist: bestD } : null;
}

function nearestPoint(
  map: MapLike,
  sourceId: string,
  sourceLayer: string,
  filter: unknown,
  lng: number,
  lat: number,
  maxM: number,
  nameOf: (p: Record<string, any>) => string | undefined
): string | null {
  let best: string | null = null;
  let bestD = maxM;
  for (const f of query(map, sourceId, sourceLayer, filter)) {
    const g = f.geometry;
    const name = f.properties ? nameOf(f.properties) : undefined;
    if (!g || g.type !== "Point" || !name) continue;
    const d = distanceMeters(lng, lat, g.coordinates[0], g.coordinates[1]);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/* ------------------------------ OpenMapTiles ------------------------------ */

const OMT = "openmaptiles";
const omtName = (p: Record<string, any>) => (p["name:latin"] ?? p.name) as string | undefined;

function omtNeighbourhood(map: MapLike, lng: number, lat: number, maxM: number) {
  return nearestPoint(
    map,
    OMT,
    "place",
    ["match", ["get", "class"], ["suburb", "neighbourhood", "quarter"], true, false],
    lng,
    lat,
    maxM,
    omtName
  );
}

export function openMapTilesPlaceName(map: MapLike, lng: number, lat: number): string {
  // 1. Parque con nombre que contenga el punto.
  for (const f of query(map, OMT, "park", ["has", "name"])) {
    const g = f.geometry;
    const name = f.properties?.name as string | undefined;
    if (!g || !name) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      if (poly[0] && pointInRing(lng, lat, poly[0])) return name;
    }
  }
  // 2. Calle cercana.
  const street = nearestStreet(map, OMT, "transportation_name", lng, lat, omtName);
  if (street && street.dist < 60) return street.name;
  // 3. Barrio.
  return omtNeighbourhood(map, lng, lat, 2500) ?? "Barcelona";
}

export function openMapTilesAreaName(map: MapLike, lng: number, lat: number, zoom: number): string {
  if (zoom < 14.4) return "Barcelona";
  return omtNeighbourhood(map, lng, lat, 1800) ?? "Barcelona";
}

/* ------------------------------ Mapbox Streets ------------------------------ */

const MB = "composite";
const mbName = (p: Record<string, any>) => p.name as string | undefined;

function mbNeighbourhood(map: MapLike, lng: number, lat: number, maxM: number) {
  return nearestPoint(
    map,
    MB,
    "place_label",
    ["==", ["get", "class"], "settlement_subdivision"],
    lng,
    lat,
    maxM,
    mbName
  );
}

export function mapboxPlaceName(map: MapLike, lng: number, lat: number): string {
  const street = nearestStreet(map, MB, "road", lng, lat, mbName);
  // Pulsar sobre una calle manda; en una plaza o parque, el nombre del parque.
  if (street && street.dist < 22) return street.name;
  const park = nearestPoint(
    map,
    MB,
    "poi_label",
    ["==", ["get", "class"], "park_like"],
    lng,
    lat,
    240,
    mbName
  );
  if (park) return park;
  if (street && street.dist < 60) return street.name;
  return mbNeighbourhood(map, lng, lat, 2500) ?? "Barcelona";
}

export function mapboxAreaName(map: MapLike, lng: number, lat: number, zoom: number): string {
  if (zoom < 14.4) return "Barcelona";
  return mbNeighbourhood(map, lng, lat, 1800) ?? "Barcelona";
}
