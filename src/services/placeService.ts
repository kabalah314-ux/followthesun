import { PLACES_CONFIG } from "../config";
import { TtlCache } from "../lib/cache";
import { distanceMeters } from "../lib/coordinates";
import {
  interiorPoint,
  pathLengthM,
  pointAtDistance,
  ringAreaM2,
  stitchRings,
  type LL,
} from "../lib/geometry";
import { PLACE_TYPE_ORDER } from "../lib/placeTypes";
import { BARCELONA_PLACES } from "../data/barcelonaPlaces";
import type { PlaceInventoryStatus, SunPlace, SunPlaceType } from "../types";

/**
 * placeService — inventario de lugares candidatos. Siempre de una fuente REAL.
 *
 * Fuente: OpenStreetMap, a través de la API Overpass (datos abiertos, ODbL). No hay lugares
 * escritos a mano ni «exposiciones» inventadas: si no se consigue el inventario, la búsqueda lo
 * dice («lugares no disponibles») en lugar de devolver resultados falsos.
 *
 * Qué se pide (todo con nombre, para poder mostrarlo):
 *   playa      natural=beach
 *   parque     leisure=park · leisure=garden
 *   plaza      place=square
 *   mirador    tourism=viewpoint
 *   espacio    leisure=common · landuse=recreation_ground · zonas peatonales (highway=pedestrian + area=yes)
 *   terraza    cafés, bares, restaurantes… con outdoor_seating=yes   (un punto: se desconoce dónde están las mesas)
 *
 * El inventario se descarga una vez por semana y navegador (caché en localStorage). Las categorías
 * sin datos reales no se ofrecen en la interfaz.
 */

/* -------------------------------------------------------------------------- */
/*  Formato Overpass (documentado)                                             */
/* -------------------------------------------------------------------------- */

interface OvPoint {
  lat: number;
  lon: number;
}

interface OvMember {
  type: string;
  ref: number;
  role: string;
  geometry?: OvPoint[];
}

export interface OvElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OvPoint[];
  members?: OvMember[];
}

const TERRACE_AMENITIES = new Set(["cafe", "bar", "restaurant", "pub", "ice_cream", "biergarten"]);
const AREA_TYPES: SunPlaceType[] = ["beach", "park", "square", "open_space"];

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const toLL = (g: OvPoint[]): LL[] => g.map((p) => [p.lon, p.lat]);
const isClosed = (r: LL[]) => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

export function buildOverpassQuery(): string {
  const b = PLACES_CONFIG.bbox;
  const box = `(${b.south},${b.west},${b.north},${b.east})`;
  const terrace =
    '["amenity"~"^(cafe|bar|restaurant|pub|ice_cream|biergarten)$"]["outdoor_seating"="yes"]';
  return [
    "[out:json][timeout:60];",
    "(",
    `nwr["natural"="beach"]${box};`,
    `nwr["leisure"="park"]${box};`,
    `nwr["leisure"="garden"]["name"]${box};`,
    `nwr["place"="square"]${box};`,
    `way["highway"="pedestrian"]["area"="yes"]["name"]${box};`,
    `nwr["leisure"="common"]${box};`,
    `nwr["landuse"="recreation_ground"]["name"]${box};`,
    `nwr["tourism"="viewpoint"]${box};`,
    `nwr${terrace}${box};`,
    ");",
    "out geom;",
  ].join("");
}

export function classifyTags(t: Record<string, string>): SunPlaceType | null {
  if (t.natural === "beach") return "beach";
  if (t.place === "square") return "square";
  if (t.leisure === "park" || t.leisure === "garden") return "park";
  if (t.tourism === "viewpoint") return "viewpoint";
  if (
    t.leisure === "common" ||
    t.landuse === "recreation_ground" ||
    (t.highway === "pedestrian" && t.area === "yes")
  )
    return "open_space";
  if (t.amenity && TERRACE_AMENITIES.has(t.amenity) && t.outdoor_seating === "yes") return "terrace";
  return null;
}

/** Convierte un elemento de Overpass en un lugar, o null si no sirve (sin nombre, demasiado pequeño…). */
export function elementToPlace(el: OvElement): SunPlace | null {
  const tags = el.tags;
  if (!tags) return null;
  const type = classifyTags(tags);
  if (!type) return null;
  const name = (tags.name ?? tags["name:ca"] ?? tags["name:es"] ?? tags["name:en"] ?? "").trim();
  if (!name) return null;

  const id = `osm:${el.type}/${el.id}`;
  const metadata: Record<string, unknown> = { osm: `${el.type}/${el.id}` };
  if (tags.amenity) metadata.amenity = tags.amenity;
  if (tags.opening_hours) metadata.openingHours = tags.opening_hours;

  // Nodos: solo terrazas y miradores son puntos legítimos.
  if (el.type === "node") {
    if ((type !== "terrace" && type !== "viewpoint") || el.lat === undefined || el.lon === undefined) {
      return null;
    }
    if (type === "terrace") metadata.locationApproximate = true;
    return {
      id,
      name,
      type,
      latitude: r5(el.lat),
      longitude: r5(el.lon),
      source: "osm",
      metadata,
    };
  }

  let rings: LL[][] = [];
  let path: LL[] | null = null;
  if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
    const ll = toLL(el.geometry);
    if (isClosed(ll)) rings = [ll];
    else path = ll;
  } else if (el.type === "relation" && el.members) {
    const outers = el.members
      .filter((m) => m.type === "way" && m.role !== "inner" && m.geometry && m.geometry.length >= 2)
      .map((m) => toLL(m.geometry as OvPoint[]));
    rings = stitchRings(outers);
  }

  if (rings.length > 0) {
    let best = rings[0];
    let bestArea = ringAreaM2(best);
    for (let i = 1; i < rings.length; i++) {
      const a = ringAreaM2(rings[i]);
      if (a > bestArea) {
        best = rings[i];
        bestArea = a;
      }
    }
    const isArea = AREA_TYPES.includes(type);
    if (isArea) {
      const min = PLACES_CONFIG.minAreaM2[type as "beach" | "park" | "square" | "open_space"];
      if (bestArea < min) return null;
    }
    const [lng, lat] = interiorPoint(best);
    if (type === "terrace") metadata.locationApproximate = true;
    return {
      id,
      name,
      type,
      latitude: r5(lat),
      longitude: r5(lng),
      polygon: isArea
        ? { type: "Polygon", coordinates: [best.map(([x, y]) => [r5(x), r5(y)])] }
        : undefined,
      areaM2: Math.round(bestArea),
      source: "osm",
      metadata,
    };
  }

  // Playas o espacios mapeados como línea abierta: se analizan a lo largo del trazado.
  if (path && (type === "beach" || type === "open_space")) {
    const length = pathLengthM(path);
    if (length < 80) return null;
    const [lng, lat] = pointAtDistance(path, length / 2);
    return {
      id,
      name,
      type,
      latitude: r5(lat),
      longitude: r5(lng),
      path: path.map(([x, y]) => [r5(x), r5(y)]),
      source: "osm",
      metadata: { ...metadata, lengthM: Math.round(length) },
    };
  }

  return null;
}

/** Una misma entidad mapeada dos veces (relación y vía exterior): se conserva la mayor. */
function dedupe(places: SunPlace[]): SunPlace[] {
  const sorted = [...places].sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0));
  const kept: SunPlace[] = [];
  for (const p of sorted) {
    const dup = kept.some(
      (k) =>
        k.type === p.type &&
        k.name === p.name &&
        distanceMeters(k.longitude, k.latitude, p.longitude, p.latitude) < 40
    );
    if (!dup) kept.push(p);
  }
  return kept;
}

export function normalizeOverpass(elements: OvElement[]): SunPlace[] {
  const out: SunPlace[] = [];
  for (const el of elements) {
    const p = elementToPlace(el);
    if (p) out.push(p);
  }
  return dedupe(out);
}

export function countByType(places: SunPlace[]): Record<SunPlaceType, number> {
  const counts = Object.fromEntries(PLACE_TYPE_ORDER.map((t) => [t, 0])) as Record<SunPlaceType, number>;
  for (const p of places) counts[p.type]++;
  return counts;
}

/** Un punto exacto como lugar (arquitectura para muestreo en rejilla, bancos, árboles, etc.). */
export function createCoordinatePlace(
  latitude: number,
  longitude: number,
  name = "Punto soleado",
  type: SunPlaceType = "open_space"
): SunPlace {
  return {
    id: `point:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    name,
    type,
    latitude,
    longitude,
    source: "coordinate",
    metadata: { generated: true },
  };
}

/* -------------------------------------------------------------------------- */
/*  Red                                                                        */
/* -------------------------------------------------------------------------- */

async function postOverpass(url: string, query: string): Promise<OvElement[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PLACES_CONFIG.timeoutMs);
  try {
    // Cuerpo `application/x-www-form-urlencoded`: es una petición «simple» (sin preflight CORS).
    const res = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OvElement[]; remark?: string };
    if (!json || !Array.isArray(json.elements)) throw new Error("Overpass: respuesta inesperada");
    // Overpass responde 200 con un `remark` cuando se queda sin tiempo o memoria (datos parciales).
    if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
      throw new Error("Overpass: consulta incompleta");
    }
    return json.elements;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchElements(): Promise<OvElement[]> {
  const query = buildOverpassQuery();
  let lastError: unknown = new Error("Sin servidor Overpass");
  for (const url of PLACES_CONFIG.endpoints) {
    try {
      return await postOverpass(url, query);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/* -------------------------------------------------------------------------- */
/*  Servicio                                                                   */
/* -------------------------------------------------------------------------- */

const placeCache = new TtlCache<SunPlace[]>({
  namespace: "fts:places",
  ttlMs: PLACES_CONFIG.ttlMs,
  maxStaleMs: PLACES_CONFIG.maxStaleMs,
  version: 1,
  persist: true,
});

const CACHE_KEY = () => {
  const b = PLACES_CONFIG.bbox;
  return `${b.south},${b.west},${b.north},${b.east}`;
};

/** Tras un fallo con respaldo caducado no se vuelve a insistir antes de este tiempo. */
const RETRY_AFTER_MS = 5 * 60_000;

export interface PlaceInventory {
  places: SunPlace[];
  /** true: la red falló y se usa el último inventario guardado (caducado). */
  stale: boolean;
  fetchedAt: number;
}

class PlaceService {
  private places: SunPlace[] | null = null;
  private fetchedAt: number | null = null;
  private stale = false;
  private loading = false;
  private failed = false;
  private nextRetryAt = 0;
  private version = 0;
  private promise: Promise<PlaceInventory> | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private set(places: SunPlace[], at: number, stale: boolean) {
    this.places = places;
    this.fetchedAt = at;
    this.stale = stale;
    this.failed = false;
    this.nextRetryAt = stale ? Date.now() + RETRY_AFTER_MS : 0;
  }

  getPlaces(): SunPlace[] | null {
    return this.places;
  }

  getStatus(): PlaceInventoryStatus {
    const places = this.places;
    return {
      state: places
        ? this.stale
          ? "stale"
          : "ready"
        : this.failed && !this.loading
          ? "unavailable"
          : "loading",
      counts: countByType(places ?? []),
      total: places ? places.length : 0,
      fetchedAt: this.fetchedAt,
      attribution: PLACES_CONFIG.attribution,
    };
  }

  /**
   * Inventario de lugares. Orden: memoria → caché fresca → red → caché caducada → error.
   * Las llamadas simultáneas comparten la misma petición.
   */
  load(force = false): Promise<PlaceInventory> {
    const current = this.places;
    if (current && !force && (!this.stale || Date.now() < this.nextRetryAt)) {
      return Promise.resolve({ places: current, stale: this.stale, fetchedAt: this.fetchedAt ?? Date.now() });
    }
    if (this.promise) return this.promise;

    this.loading = true;
    this.failed = false;
    this.emit();

    this.promise = (async (): Promise<PlaceInventory> => {
      try {
        // Selección revisada incluida en la app: instantánea y sin depender de Overpass.
        if (PLACES_CONFIG.source === "curated") {
          this.set(BARCELONA_PLACES, Date.now(), false);
        } else {
          await this.loadFromOverpass(force);
        }
        return {
          places: this.places as SunPlace[],
          stale: this.stale,
          fetchedAt: this.fetchedAt ?? Date.now(),
        };
      } finally {
        this.loading = false;
        this.promise = null;
        this.emit();
      }
    })();
    return this.promise;
  }

  /** Inventario desde OpenStreetMap (opcional, con `VITE_PLACES_SOURCE=osm`). */
  private async loadFromOverpass(force: boolean) {
    const key = CACHE_KEY();
    const hit = force ? null : placeCache.get(key);
    if (hit) {
      this.set(hit.value, hit.storedAt, false);
      return;
    }
    try {
      const places = normalizeOverpass(await fetchElements());
      if (places.length === 0) throw new Error("Inventario vacío");
      const now = Date.now();
      placeCache.set(key, places, now);
      this.set(places, now, false);
    } catch (err) {
      const old = placeCache.getAllowStale(key);
      if (!old) {
        this.failed = true;
        throw err;
      }
      this.set(old.value, old.storedAt, true);
    }
  }
}

export const placeService = new PlaceService();
