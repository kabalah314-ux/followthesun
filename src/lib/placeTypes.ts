import type {
  ReservedPlaceType,
  SunIntent,
  SunPlaceType,
  SunPreference,
  WhenPreset,
} from "../types";
import { tr } from "../i18n";

/**
 * Catálogo de tipos de lugar y de intenciones.
 *
 * Solo se ofrecen en la interfaz los tipos para los que hay datos reales cargados (ver
 * `placeService`): no se muestran categorías que no se puedan respaldar.
 */

export const PLACE_TYPE_LABEL: Record<SunPlaceType, { singular: string; plural: string }> = {
  beach: { singular: tr("findSunPanel.playa"), plural: tr("placeTypes.playas") },
  park: { singular: tr("findSunPanel.parque"), plural: tr("placeTypes.parques") },
  square: { singular: tr("placeTypes.plaza"), plural: tr("placeTypes.plazas") },
  terrace: { singular: tr("placeTypes.terraza"), plural: tr("placeTypes.terrazas") },
  viewpoint: { singular: tr("placeTypes.mirador"), plural: tr("placeTypes.miradores") },
  open_space: { singular: tr("placeTypes.espacio_abierto"), plural: tr("placeTypes.espacios_abiertos") },
  playground: { singular: tr("placeTypes.area_de_juego"), plural: tr("placeTypes.areas_de_juego") },
  climate_shelter: { singular: tr("placeTypes.refugio_climatico"), plural: tr("placeTypes.refugios_climaticos") },
  fountain: { singular: tr("placeTypes.fuente"), plural: tr("placeTypes.fuentes") },
  toilet: { singular: tr("placeTypes.lavabo_publico"), plural: tr("placeTypes.lavabos_publicos") },
};

/**
 * Destinos: sitios a los que se va a estar (se buscan por su sol o su sombra). Orden en el que se
 * ofrecen en la interfaz (Lugares, Recomendados, Planificar).
 */
export const PLACE_TYPE_ORDER: SunPlaceType[] = [
  "beach",
  "park",
  "square",
  "terrace",
  "viewpoint",
  "open_space",
  "playground",
];

/**
 * Servicios: no son un destino de sol, sino apoyo (agua, un sitio fresco, un aseo). No entran en
 * Lugares ni Recomendados; se buscan cuando se piden explícitamente, sobre todo en modo sombra.
 */
export const SERVICE_PLACE_TYPES: SunPlaceType[] = ["climate_shelter", "fountain", "toilet"];

/** Servicios que tiene sentido ofrecer al buscar sombra (contra el calor). */
export const SHADE_SERVICE_TYPES: SunPlaceType[] = ["climate_shelter", "fountain"];

export const ALL_PLACE_TYPES: SunPlaceType[] = [...PLACE_TYPE_ORDER, ...SERVICE_PLACE_TYPES];

/** Tipos que vienen de Open Data BCN (atribución CC BY 4.0). */
export const OPEN_DATA_PLACE_TYPES: SunPlaceType[] = ["playground", ...SERVICE_PLACE_TYPES];

/**
 * «Cualquier lugar» incluye espacios públicos abiertos. Las terrazas NO entran: en OpenStreetMap
 * son locales (un punto) y se desconoce dónde están las mesas, así que solo se analizan cuando la
 * persona las pide (tipo «Terraza» o intención «Café»).
 */
export const PUBLIC_PLACE_TYPES: SunPlaceType[] = ["beach", "park", "square", "viewpoint", "open_space"];

/**
 * Categorías previstas sin fuente de datos todavía. Para activarlas hará falta una fuente por
 * elemento (bancos: OSM `amenity=bench`; cafés y restaurantes: el mismo Overpass con otros filtros).
 */
export const RESERVED_PLACE_TYPES: ReservedPlaceType[] = ["bench", "cafe", "restaurant"];

export interface IntentDef {
  label: string;
  hint: string;
  /** Tipos de lugar que encajan con la intención. */
  types: SunPlaceType[];
  preference: SunPreference;
  defaultDurationMinutes: number;
  defaultWhen: WhenPreset;
}

/**
 * Intenciones. «Sombra» invierte la puntuación en `sunSearchService` (`invertForShade`): el mismo
 * motor busca la mejor ventana SIN sol directo, sin la noche contando como sombra útil.
 */
export const SUN_INTENTS: Record<SunIntent, IntentDef> = {
  sun: {
    label: tr("pointPanel.sol"),
    hint: tr("placeTypes.el_maximo_sol_posible"),
    types: PUBLIC_PLACE_TYPES,
    preference: "maximum_sun",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  shade: {
    label: tr("findSunPanel.sombra"),
    hint: tr("placeTypes.un_sitio_fresco_sin_sol"),
    types: ["park", "square", "open_space", "terrace"],
    preference: "maximum_sun",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  coffee: {
    label: tr("findSunPanel.cafe"),
    hint: tr("placeTypes.una_terraza_al_sol"),
    types: ["terrace"],
    preference: "balanced",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  read: {
    label: tr("findSunPanel.leer"),
    hint: tr("placeTypes.un_rincon_agradable"),
    types: ["park", "square", "open_space"],
    preference: "balanced",
    defaultDurationMinutes: 120,
    defaultWhen: "afternoon",
  },
  beach: {
    label: tr("findSunPanel.playa"),
    hint: tr("placeTypes.arena_y_sol"),
    types: ["beach"],
    preference: "maximum_sun",
    defaultDurationMinutes: 120,
    defaultWhen: "afternoon",
  },
  sunset: {
    label: tr("findSunPanel.atardecer"),
    hint: tr("placeTypes.ver_caer_el_sol"),
    types: ["viewpoint", "beach", "open_space", "park"],
    preference: "maximum_sun",
    defaultDurationMinutes: 30,
    defaultWhen: "sunset",
  },
  walk: {
    label: tr("placeTypes.pasear"),
    hint: tr("placeTypes.caminar_al_sol"),
    types: ["park", "open_space", "beach"],
    preference: "balanced",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
};

export const INTENT_ORDER: SunIntent[] = ["sun", "shade", "coffee", "read", "beach", "sunset", "walk"];
