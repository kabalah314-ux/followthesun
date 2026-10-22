import { PLACES_CONFIG } from "../config";
import { TtlCache } from "../lib/cache";
import { distanceMeters } from "../lib/coordinates";
import { settlePair } from "../lib/net";
import { PLACE_TYPE_ORDER } from "../lib/placeTypes";
import type {
  GeoBounds,
  SunPlace,
  TerraceCertainty,
  Venue,
  VenueCategory,
  VenueProvider,
  VenueProviderInfo,
} from "../types";
import { OPEN_DATA_CONFIG } from "./openData/config";
import { openDataService } from "./openData/openDataService";
import { mergeLicensedTerraces, terraceRank } from "./openData/terraceMatching";
import { overpass } from "./overpass";
import { isFreshStatic, loadStatic, type PackedVenue, type StaticVenuesFile } from "./staticData";
import { tr } from "../i18n";

/**
 * venueService — negocios con terraza (cafeterías, bares, restaurantes).
 *
 * Existe como capa separada de `placeService` (parques, playas, plazas…) porque los negocios tienen
 * un problema distinto: **saber si el local tiene terraza es un dato que casi ninguna fuente
 * documenta bien**, y las que lo hacen (Google Places) no dejan usarlo como necesitamos.
 *
 * Reglas de este servicio:
 *  1. **Nunca inventar una terraza.** Si no se sabe, se dice `unknown` y la búsqueda lo avisa.
 *  2. **Proveedores intercambiables.** Cualquier fuente nueva es un `VenueProvider`.
 *  3. **Lo que confirma la persona manda.** El feedback del usuario tiene más peso que cualquier
 *     heurística, y se guarda en el dispositivo.
 */

/* -------------------------------------------------------------------------- */
/*  Certeza combinada: fuente externa + feedback de la gente                   */
/* -------------------------------------------------------------------------- */

const RANK: Record<TerraceCertainty, number> = { none: 0, unknown: 1, likely: 2, confirmed: 3 };

export function combineTerrace(
  fromSource: TerraceCertainty,
  fromFeedback?: TerraceCertainty
): TerraceCertainty {
  if (!fromFeedback) return fromSource;
  if (fromFeedback === "none") return "none";
  return RANK[fromFeedback] > RANK[fromSource] ? fromFeedback : fromSource;
}

/* -------------------------------------------------------------------------- */
/*  Proveedor OSM (activo)                                                     */
/* -------------------------------------------------------------------------- */

const CAFE_CATEGORIES: VenueCategory[] = [
  "cafe",
  "bar",
  "restaurant",
  "pub",
  "ice_cream",
  "biergarten",
];

const RE =
  /^(cafe|bar|restaurant|pub|ice_cream|biergarten)$/;

/**
 * Overpass con tiempo máximo por servidor y cortacircuitos (un servidor que acaba de fallar no se
 * vuelve a esperar en la misma sesión). Ver `services/overpass.ts`.
 */
function overpassAnyEndpoint(query: string, timeoutMs: number): Promise<OvNode[]> {
  return overpass<OvNode>(query, { timeoutMs });
}

export interface OvNode {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

/**
 * OpenStreetMap vía Overpass.
 *
 * Trae DOS grupos, que se tratan de forma muy distinta:
 *  · `outdoor_seating=yes` → terraza **confirmada** por la comunidad (pocos, pero fiables).
 *  · locales en planta baja sin esa etiqueta → terraza **posible** (`likely`). En Barcelona la
 *    etiqueta está poco rellena, así que sin este grupo no habría suficientes negocios que mirar;
 *    pero se marca como posible y la búsqueda lo dice, no lo da por hecho.
 */
export function buildVenueQuery(bounds: GeoBounds, limit: number | null = 600, serverTimeoutS = 60): string {
  const box = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const amenity = `["amenity"~"${RE.source}"]`;
  const seating = `${amenity}["outdoor_seating"="yes"]${box};`;
  // Planta baja: sin `building:levels` o con 1-2. Es una heurística, no un hecho.
  const ground = `${amenity}["!outdoor_seating"]${box};`;
  return [
    `[out:json][timeout:${serverTimeoutS}];`,
    "(",
    `nwr${seating}`,
    `nwr${ground}`,
    ");",
    limit === null ? "out center;" : `out center ${limit};`,
  ].join("");
}

/** Etiquetas de OSM que usa `ovToVenue` (lo demás no se guarda en el inventario precalculado). */
const VENUE_TAGS = ["name", "amenity", "outdoor_seating", "building:levels", "opening_hours", "internet_access", "dog", "wheelchair"] as const;

/** Elemento de Overpass → forma compacta del inventario precalculado (`public/data/venues.json`). */
export function packVenueElement(el: OvNode): PackedVenue | null {
  if (!ovToVenue(el)) return null;
  const p = venuePoint(el);
  if (!p) return null;
  const tags: Record<string, string> = {};
  for (const k of VENUE_TAGS) {
    const v = el.tags?.[k];
    if (v) tags[k] = v;
  }
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  return [`${el.type}/${el.id}`, r5(p.lat), r5(p.lng), tags];
}

/** Forma compacta → negocio, con la misma clasificación que los datos en vivo. */
export function unpackVenue([ref, lat, lon, tags]: PackedVenue): Venue | null {
  const [type, id] = ref.split("/");
  if ((type !== "node" && type !== "way" && type !== "relation") || !id) return null;
  return ovToVenue({ type, id: Number(id), lat, lon, tags });
}

const containsBounds = (outer: GeoBounds, inner: GeoBounds) =>
  outer.south <= inner.south && outer.west <= inner.west && outer.north >= inner.north && outer.east >= inner.east;

function venuesFromStatic(file: StaticVenuesFile, bounds: GeoBounds): Venue[] {
  const out: Venue[] = [];
  for (const p of file.venues) {
    const v = unpackVenue(p);
    if (v && v.latitude >= bounds.south && v.latitude <= bounds.north && v.longitude >= bounds.west && v.longitude <= bounds.east) {
      out.push(v);
    }
  }
  return out;
}

/** Negocios de OSM ya descargados, por zona: una semana, y hasta dos meses como respaldo. */
const osmVenueCache = new TtlCache<Venue[]>({
  namespace: "fts:venues:osm",
  ttlMs: PLACES_CONFIG.ttlMs,
  maxStaleMs: PLACES_CONFIG.maxStaleMs,
  version: 1,
  persist: true,
});

/** El inventario precalculado de negocios está cargado y es reciente: no hace falta Overpass. */
let staticVenuesReady = false;

/** Coordenadas del elemento (nodo, o centro de vía/relación). */
function venuePoint(el: OvNode): { lat: number; lng: number } | null {
  if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.geometry && el.geometry.length > 0) {
    // Punto medio del trazado: sirve como referencia del local.
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    return { lat: mid.lat, lng: mid.lon };
  }
  const any = el as unknown as { center?: { lat: number; lon: number } };
  if (any.center) return { lat: any.center.lat, lng: any.center.lon };
  return null;
}

export function ovToVenue(el: OvNode): Venue | null {
  const tags = el.tags;
  if (!tags?.name) return null;
  const category = tags.amenity as VenueCategory;
  if (!CAFE_CATEGORIES.includes(category)) return null;
  const p = venuePoint(el);
  if (!p) return null;

  const levels = Number(tags["building:levels"]);
  const lowRise = !Number.isFinite(levels) || levels <= 2;
  const terrace: TerraceCertainty =
    tags.outdoor_seating === "yes"
      ? "confirmed"
      : tags.outdoor_seating === "no"
        ? "none"
        : lowRise
          ? "likely"
          : "unknown";

  return {
    id: `osm:${el.type}/${el.id}`,
    name: tags.name,
    category,
    latitude: p.lat,
    longitude: p.lng,
    terrace,
    terraceSource:
      terrace === "confirmed"
        ? "OpenStreetMap (outdoor_seating=yes)"
        : terrace === "likely"
          ? tr("venueService.candidato_local_en_planta_baja")
          : "OpenStreetMap",
    openingHours: tags.opening_hours,
    metadata: {
      amenity: category,
      levels: tags["building:levels"],
      // Para los filtros de Explorar (wifi, perros, accesible): solo si OSM lo dice.
      ...(tags.internet_access ? { wifi: tags.internet_access } : {}),
      ...(tags.dog ? { dog: tags.dog } : {}),
      ...(tags.wheelchair ? { wheelchair: tags.wheelchair } : {}),
    },
  };
}

export const osmVenueProvider: VenueProvider = {
  info: {
    id: "osm",
    label: "OpenStreetMap · Overpass",
    available: true,
    costPerThousand: 0,
    allowsCaching: true,
    allowsThirdPartyMap: true,
    license: "ODbL · © OpenStreetMap contributors",
  },
  /** Precalculado reciente → caché del dispositivo → Overpass → caché caducada → precalculado antiguo. */
  async loadVenues(bounds) {
    const st = await loadStatic("venues");
    const usable = st && containsBounds(st.bbox, bounds) && st.venues.length > 0 ? st : null;
    if (usable && isFreshStatic(usable)) {
      staticVenuesReady = true;
      return venuesFromStatic(usable, bounds);
    }
    const key = `${bounds.west},${bounds.east},${bounds.south},${bounds.north}`;
    const hit = osmVenueCache.get(key);
    if (hit) return hit.value;
    try {
      const elements = await overpassAnyEndpoint(buildVenueQuery(bounds), PLACES_CONFIG.venueTimeoutMs);
      const out: Venue[] = [];
      for (const el of elements) {
        const v = ovToVenue(el);
        if (v) out.push(v);
      }
      if (out.length > 0) osmVenueCache.set(key, out);
      return out;
    } catch (e) {
      const old = osmVenueCache.getAllowStale(key);
      if (old) return old.value;
      if (usable) return venuesFromStatic(usable, bounds);
      throw e;
    }
  },
};

/* -------------------------------------------------------------------------- */
/*  Proveedor Google Places — PREPARADO PERO NO USABLE                          */
/* -------------------------------------------------------------------------- */

/**
 * Se deja escrito para que conectarlo sea un cambio de una línea, **pero está bloqueado a propósito**.
 * No es pereza: es que los términos de Google Maps Platform lo prohíben en esta app.
 *
 * Verificado en los términos vigentes (cloud.google.com/maps-platform/terms):
 *
 *  · **Cláusula 14.2 — «No use with a non-Google map»**: «Customer must not use Google Maps Content
 *    from the Places API in conjunction with a non-Google map.»
 *    Follow the Sun muestra sus datos sobre Mapbox / MapLibre → **incumplimiento directo**.
 *  · **Cláusula 14.3 — «Caching»**: solo se pueden guardar el `place_id` (para siempre) y las
 *    coordenadas (30 días). El nombre, el horario o la valoración **no se pueden guardar**: habría
 *    que volver a pagar en cada visita de cada persona.
 *  · **Precio**: Nearby Search $32–40 por 1.000 consultas, Place Details $17–25. El crédito gratuito
 *    de $200/mes se retiró. Sin caché, el coste crece con el tráfico y no se puede amortizar.
 *
 * Qué habría que hacer para usarlo legalmente: (a) mostrar el mapa de Google en lugar de Mapbox /
 * MapLibre, o (b) negociar una licencia enterprise. Ninguna de las dos encaja con este producto.
 */
export const googlePlacesProvider: VenueProvider = {
  info: {
    id: "google-places",
    label: "Google Places API",
    available: false,
    reason:
      "Los términos de Google prohíben usar datos de Places sobre un mapa que no sea de Google " +
      "(cláusula 14.2) y no permiten guardar los datos más que 30 días (14.3). Con Mapbox/MapLibre " +
      "no es viable legalmente, y sin caché el coste no se amortiza.",
    costPerThousand: 35,
    allowsCaching: false,
    allowsThirdPartyMap: false,
    license: "Google Maps Platform Terms (propietario)",
  },
  async loadVenues() {
    throw new Error(googlePlacesProvider.info.reason);
  },
};

/* -------------------------------------------------------------------------- */
/*  Servicio                                                                   */
/* -------------------------------------------------------------------------- */

const providers: VenueProvider[] = [osmVenueProvider, googlePlacesProvider];
const cache = new Map<string, Promise<Venue[]>>();

export interface VenueLoadResult {
  venues: Venue[];
  provider: VenueProvider;
  /** true si venían de una consulta ya hecha. */
  cached: boolean;
  /** Se cruzaron con las licencias municipales de terraza (Open Data BCN). */
  licensed: boolean;
}

const inBounds = (b: GeoBounds, lat: number, lng: number) =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;

export const venueService = {
  /** Proveedores y por qué sí o no se pueden usar (para la pantalla «Acerca de»). */
  listProviders(): VenueProviderInfo[] {
    return providers.map((p) => p.info);
  },

  register(p: VenueProvider) {
    if (!providers.some((x) => x.info.id === p.info.id)) providers.push(p);
  },

  /**
   * Locales con terraza de una zona: OpenStreetMap cruzado con las licencias municipales de
   * terraza (Open Data BCN). Basta con que responda una de las dos fuentes: cuando llega bien la
   * primera, la otra tiene `PLACES_CONFIG.venueGraceMs` más; si no llega, se sigue sin ella y
   * termina en segundo plano (queda en su caché para la próxima búsqueda). Cachea por zona
   * mientras dure la sesión.
   */
  async loadVenues(bounds: GeoBounds, force = false): Promise<VenueLoadResult> {
    const key = `${bounds.west},${bounds.east},${bounds.south},${bounds.north}`;
    const active = providers.find((p) => p.info.available);
    if (!active) throw new Error("Sin proveedor de negocios disponible");

    if (force) cache.delete(key);
    let p = cache.get(key);
    if (!p) {
      p = (async () => {
        const osmP = active.loadVenues(bounds);
        const licP = openDataService.loadTerraces(force);
        const [osm, lic] = await settlePair(osmP, licP, PLACES_CONFIG.venueGraceMs);
        if (osm?.status !== "fulfilled" && lic?.status !== "fulfilled") {
          throw osm?.status === "rejected"
            ? osm.reason
            : lic?.status === "rejected"
              ? lic.reason
              : new Error("Sin datos de negocios");
        }
        // Lo que siga pendiente terminará en segundo plano: la próxima búsqueda lo incluye.
        if (osm === null) osmP.then(() => cache.delete(key), () => undefined);
        if (lic === null) licP.then(() => cache.delete(key), () => undefined);
        const osmVenues = osm?.status === "fulfilled" ? osm.value : [];
        const terraces =
          lic?.status === "fulfilled"
            ? lic.value.value.filter((t) => inBounds(bounds, t.latitude, t.longitude))
            : null;
        licensedByKey.set(key, terraces !== null);
        return mergeLicensedTerraces(osmVenues, terraces);
      })().catch((e) => {
        cache.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    const venues = await p;
    return { venues, provider: active, cached: !force, licensed: licensedByKey.get(key) ?? false };
  },

  /** Nombre del local de las terrazas con licencia que no casaron con OSM (solo resultados). */
  resolveTerraceNames,
};

const licensedByKey = new Map<string, boolean>();

/* -------------------------------------------------------------------------- */
/*  Nombre de una terraza con licencia: consulta pequeña a Overpass            */
/* -------------------------------------------------------------------------- */

export interface ResolvedTerraceName {
  /** Nombre del local (vacío si no hay ningún local de OSM cerca). */
  n?: string;
  /** amenity de OSM (cafe, bar…). */
  c?: string;
  /** opening_hours. */
  h?: string;
  /** Elemento de OSM («node/123»). */
  o?: string;
}

const terraceNameCache = new TtlCache<ResolvedTerraceName>({
  namespace: "fts:terrace-names",
  ttlMs: 30 * 24 * 3_600_000,
  maxStaleMs: 90 * 24 * 3_600_000,
  version: 1,
  persist: true,
});

/** Como mucho estas terrazas por consulta (son los resultados que se van a enseñar). */
const NAME_BATCH = 8;

/**
 * Las terrazas con licencia no traen el nombre del negocio. Para los pocos resultados que se van a
 * enseñar se busca el local de OSM más cercano (≤ 15 m) con una consulta pequeña. Lo encontrado
 * (y lo no encontrado) se guarda un mes; si Overpass falla, no se guarda nada y se reintenta otro día.
 */
async function resolveTerraceNames(places: SunPlace[], timeoutMs = 6000): Promise<Map<string, ResolvedTerraceName>> {
  const out = new Map<string, ResolvedTerraceName>();
  const pending: SunPlace[] = [];
  for (const p of places) {
    const hit = terraceNameCache.get(p.id);
    if (hit) {
      if (hit.value.n) out.set(p.id, hit.value);
    } else if (!pending.some((x) => x.id === p.id)) {
      pending.push(p);
    }
  }
  const batch = pending.slice(0, NAME_BATCH);
  // Con el inventario precalculado completo, las licencias ya se cruzaron con todos los locales de
  // OSM: si no casó ninguno a ≤ 15 m, Overpass tampoco lo encontrará.
  if (batch.length === 0 || staticVenuesReady) return out;

  const R: number = OPEN_DATA_CONFIG.terraceMatchRadiusM;
  const amenity = `["amenity"~"${RE.source}"]["name"]`;
  const parts = batch.map((p) => `nwr(around:${R},${p.latitude},${p.longitude})${amenity};`).join("");
  const elements = await overpassAnyEndpoint(`[out:json][timeout:15];(${parts});out center tags;`, timeoutMs);

  for (const p of batch) {
    let best: OvNode | null = null;
    let bestD = R;
    for (const el of elements) {
      const pt = venuePoint(el);
      if (!pt || !el.tags?.name) continue;
      const d = distanceMeters(p.longitude, p.latitude, pt.lng, pt.lat);
      if (d <= bestD) {
        best = el;
        bestD = d;
      }
    }
    const value: ResolvedTerraceName = best?.tags
      ? { n: best.tags.name, c: best.tags.amenity, h: best.tags.opening_hours, o: `${best.type}/${best.id}` }
      : {};
    terraceNameCache.set(p.id, value);
    if (value.n) out.set(p.id, value);
  }
  return out;
}

/** El lugar con el nombre del local encontrado (sin perder el sello de la licencia). */
export function withResolvedName(place: SunPlace, found: ResolvedTerraceName): SunPlace {
  if (!found.n) return place;
  const meta = place.metadata ?? {};
  return {
    ...place,
    name: found.n,
    metadata: {
      ...meta,
      named: true,
      ...(found.c ? { category: found.c } : {}),
      ...(found.h ? { openingHours: found.h } : {}),
      ...(found.o ? { osm: found.o } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Adaptador al motor de búsqueda                                            */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un negocio en un `SunPlace` para que `findBestSunPlaces` lo analice sin cambios.
 * Una terraza se muestrea como un anillo alrededor del local (no se sabe dónde están las mesas).
 */
export function venueToSunPlace(v: Venue): SunPlace {
  const m = v.metadata ?? {};
  const licensed = m.licensed ?? null;
  return {
    id: v.id,
    name: v.name,
    type: "terrace",
    latitude: v.latitude,
    longitude: v.longitude,
    source: v.terraceSource,
    metadata: {
      venue: true,
      category: v.category,
      terrace: v.terrace,
      openingHours: v.openingHours,
      terraceRank: typeof m.terraceRank === "number" ? m.terraceRank : terraceRank(v.terrace, !!licensed),
      ...(licensed ? { licensed } : {}),
      ...(typeof m.named === "boolean" ? { named: m.named } : {}),
      ...(typeof m.address === "string" ? { address: m.address } : {}),
      ...(m.wifi !== undefined ? { wifi: m.wifi } : {}),
      ...(m.dog !== undefined ? { dog: m.dog } : {}),
      ...(m.wheelchair !== undefined ? { wheelchair: m.wheelchair } : {}),
    },
  };
}

/** Categorías que la app considera «ir a tomar algo». */
export const VENUE_CATEGORIES = CAFE_CATEGORIES;
export const PLACE_TYPES_WITH_VENUES = PLACE_TYPE_ORDER;
