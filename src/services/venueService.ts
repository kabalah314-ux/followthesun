import { PLACES_CONFIG } from "../config";
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
function buildVenueQuery(bounds: GeoBounds): string {
  const box = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const amenity = `["amenity"~"${RE.source}"]`;
  const seating = `${amenity}["outdoor_seating"="yes"]${box};`;
  // Planta baja: sin `building:levels` o con 1-2. Es una heurística, no un hecho.
  const ground = `${amenity}["!outdoor_seating"]${box};`;
  return [
    "[out:json][timeout:60];",
    "(",
    `nwr${seating}`,
    `nwr${ground}`,
    ");",
    "out center 600;",
  ].join("");
}

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
          ? "Candidato: local en planta baja (OpenStreetMap)"
          : "OpenStreetMap",
    openingHours: tags.opening_hours,
    metadata: { amenity: category, levels: tags["building:levels"] },
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
  async loadVenues(bounds) {
    const res = await fetch(PLACES_CONFIG.endpoints[0], {
      method: "POST",
      body: new URLSearchParams({ data: buildVenueQuery(bounds) }),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as { elements?: OvNode[] };
    const out: Venue[] = [];
    for (const el of json.elements ?? []) {
      const v = ovToVenue(el);
      if (v) out.push(v);
    }
    return out;
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
}

export const venueService = {
  /** Proveedores y por qué sí o no se pueden usar (para la pantalla «Acerca de»). */
  listProviders(): VenueProviderInfo[] {
    return providers.map((p) => p.info);
  },

  register(p: VenueProvider) {
    if (!providers.some((x) => x.info.id === p.info.id)) providers.push(p);
  },

  /** Locales con terraza de una zona. Cachea por zona mientras dure la sesión. */
  async loadVenues(bounds: GeoBounds, force = false): Promise<VenueLoadResult> {
    const key = `${bounds.west},${bounds.east},${bounds.south},${bounds.north}`;
    const active = providers.find((p) => p.info.available);
    if (!active) throw new Error("Sin proveedor de negocios disponible");

    if (force) cache.delete(key);
    let p = cache.get(key);
    if (!p) {
      p = active.loadVenues(bounds).catch((e) => {
        cache.delete(key);
        throw e;
      });
      cache.set(key, p);
    }
    const venues = await p;
    return { venues, provider: active, cached: !force };
  },
};

/* -------------------------------------------------------------------------- */
/*  Adaptador al motor de búsqueda                                            */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un negocio en un `SunPlace` para que `findBestSunPlaces` lo analice sin cambios.
 * Una terraza se muestrea como un anillo alrededor del local (no se sabe dónde están las mesas).
 */
export function venueToSunPlace(v: Venue): SunPlace {
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
    },
  };
}

/** Categorías que la app considera «ir a tomar algo». */
export const VENUE_CATEGORIES = CAFE_CATEGORIES;
export const PLACE_TYPES_WITH_VENUES = PLACE_TYPE_ORDER;
