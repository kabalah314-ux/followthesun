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
import { ALL_PLACE_TYPES } from "../lib/placeTypes";
import type { PlaceInventoryStatus, SunPlace, SunPlaceType } from "../types";
import { OPEN_DATA_CONFIG } from "./openData/config";
import { openDataService } from "./openData/openDataService";
import { overpass } from "./overpass";
import { generatedAtMs, isFreshStatic, loadStatic, type StaticPlacesFile } from "./staticData";
import { tr } from "../i18n";

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
  // Para los filtros de Explorar: solo lo que OpenStreetMap dice (nunca se supone).
  if (tags.internet_access) metadata.wifi = tags.internet_access;
  if (tags.dog) metadata.dog = tags.dog;
  if (tags.wheelchair) metadata.wheelchair = tags.wheelchair;

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
  const counts = Object.fromEntries(ALL_PLACE_TYPES.map((t) => [t, 0])) as Record<SunPlaceType, number>;
  for (const p of places) counts[p.type] = (counts[p.type] ?? 0) + 1;
  return counts;
}

/**
 * Inventario completo = OpenStreetMap + Open Data BCN (áreas de juego, refugios, fuentes,
 * lavabos y miradores). Un mirador del Ajuntament que ya está en OSM no se duplica.
 */
export function mergeOpenDataPlaces(osm: SunPlace[], open: SunPlace[]): SunPlace[] {
  if (open.length === 0) return osm;
  const osmViewpoints = osm.filter((p) => p.type === "viewpoint");
  const extra = open.filter(
    (p) =>
      p.type !== "viewpoint" ||
      !osmViewpoints.some(
        (v) => distanceMeters(v.longitude, v.latitude, p.longitude, p.latitude) < OPEN_DATA_CONFIG.viewpointDedupeM
      )
  );
  return [...osm, ...extra];
}

/** Un punto exacto como lugar (arquitectura para muestreo en rejilla, bancos, árboles, etc.). */
export function createCoordinatePlace(
  latitude: number,
  longitude: number,
  name = tr("placeService.punto_soleado"),
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

/**
 * Overpass en vivo: los servidores se prueban en orden con su tiempo máximo, y uno que acaba de
 * fallar no se vuelve a esperar en 10 min (ver `services/overpass.ts`).
 */
async function fetchElements(): Promise<OvElement[]> {
  return overpass<OvElement>(buildOverpassQuery(), { timeoutMs: PLACES_CONFIG.timeoutMs });
}

const sameBbox = (a: StaticPlacesFile["bbox"] | undefined) => {
  const b = PLACES_CONFIG.bbox;
  return !!a && a.south === b.south && a.west === b.west && a.north === b.north && a.east === b.east;
};

/** Inventario precalculado (`public/data/places.json`) si existe y es de esta zona. */
async function staticPlaces(): Promise<StaticPlacesFile | null> {
  const st = await loadStatic("places");
  return st && sameBbox(st.bbox) && st.places.length > 0 ? st : null;
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
/** Lo que se espera a Open Data BCN cuando OSM ya está listo; si tarda más, llega después. */
const OPEN_DATA_WAIT_MS = 3000;

export interface PlaceInventory {
  places: SunPlace[];
  /** true: la red falló y se usa el último inventario guardado (caducado). */
  stale: boolean;
  fetchedAt: number;
}

class PlaceService {
  private places: SunPlace[] | null = null;
  /** Lugares de OpenStreetMap (lo que se guarda en la caché del inventario). */
  private osm: SunPlace[] | null = null;
  /** Lugares de Open Data BCN (cada conjunto con su propia caché). */
  private open: SunPlace[] = [];
  private openPromise: Promise<void> | null = null;
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
    this.osm = places;
    this.places = mergeOpenDataPlaces(places, this.open);
    this.fetchedAt = at;
    this.stale = stale;
    this.failed = false;
    this.nextRetryAt = stale ? Date.now() + RETRY_AFTER_MS : 0;
  }

  /** Open Data BCN en paralelo a OSM. Nunca falla: un conjunto caído solo no aporta lugares. */
  private startOpenData(force: boolean): Promise<void> {
    if (!this.openPromise || force) {
      this.openPromise = openDataService
        .loadPlaces(undefined, force)
        .then((r) => {
          this.open = r.places;
          if (this.osm) {
            this.places = mergeOpenDataPlaces(this.osm, this.open);
            this.emit();
          }
        })
        .catch(() => undefined);
    }
    return this.openPromise;
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
   * Inventario de lugares. Orden: memoria → caché fresca → inventario precalculado reciente →
   * Overpass en vivo → caché caducada → inventario precalculado antiguo → error.
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
      const openData = this.startOpenData(force);
      try {
        const key = CACHE_KEY();
        const hit = force ? null : placeCache.get(key);
        if (hit) {
          this.set(hit.value, hit.storedAt, false);
        } else {
          const st = await staticPlaces();
          if (st && isFreshStatic(st)) {
            // Precalculado en GitHub Actions: llega al momento desde la CDN.
            placeCache.set(key, st.places, Date.now());
            this.set(st.places, generatedAtMs(st), false);
          } else {
            try {
              const places = normalizeOverpass(await fetchElements());
              if (places.length === 0) throw new Error("Inventario vacío");
              const now = Date.now();
              placeCache.set(key, places, now);
              this.set(places, now, false);
            } catch (err) {
              const old = placeCache.getAllowStale(key);
              if (old) this.set(old.value, old.storedAt, true);
              else if (st) this.set(st.places, generatedAtMs(st), true);
              else {
                this.failed = true;
                throw err;
              }
            }
          }
        }
        // Si Open Data BCN ya está (o llega enseguida) entra en este mismo inventario.
        await Promise.race([openData, new Promise((r) => setTimeout(r, OPEN_DATA_WAIT_MS))]);
        this.places = mergeOpenDataPlaces(this.osm ?? [], this.open);
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
}

export const placeService = new PlaceService();
