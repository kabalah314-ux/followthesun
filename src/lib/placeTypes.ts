import type {
  ReservedPlaceType,
  SunIntent,
  SunPlaceType,
  SunPreference,
  WhenPreset,
} from "../types";

/**
 * Catálogo de tipos de lugar y de intenciones.
 *
 * Solo se ofrecen en la interfaz los tipos para los que hay datos reales cargados (ver
 * `placeService`): no se muestran categorías que no se puedan respaldar.
 */

export const PLACE_TYPE_LABEL: Record<SunPlaceType, { singular: string; plural: string }> = {
  beach: { singular: "Playa", plural: "Playas" },
  park: { singular: "Parque", plural: "Parques" },
  square: { singular: "Plaza", plural: "Plazas" },
  terrace: { singular: "Terraza", plural: "Terrazas" },
  viewpoint: { singular: "Mirador", plural: "Miradores" },
  open_space: { singular: "Espacio abierto", plural: "Espacios abiertos" },
};

/** Orden en el que se ofrecen en la interfaz. */
export const PLACE_TYPE_ORDER: SunPlaceType[] = [
  "beach",
  "park",
  "square",
  "terrace",
  "viewpoint",
  "open_space",
];

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
 * Intenciones. «Sombra» (buscar un sitio sin sol) NO está: es una función futura (Find Shade) que
 * invertirá la puntuación; el motor ya recibe `intent`, así que se podrá añadir sin cambiar nada más.
 */
export const SUN_INTENTS: Record<SunIntent, IntentDef> = {
  sun: {
    label: "Sol",
    hint: "El máximo sol posible",
    types: PUBLIC_PLACE_TYPES,
    preference: "maximum_sun",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  shade: {
    label: "Sombra",
    hint: "Un sitio fresco, sin sol directo",
    types: ["park", "square", "open_space", "terrace"],
    preference: "maximum_sun",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  coffee: {
    label: "Terraza",
    hint: "Una terraza al sol",
    types: ["terrace"],
    preference: "balanced",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
  read: {
    label: "Leer",
    hint: "Un rincón agradable",
    types: ["park", "square", "open_space"],
    preference: "balanced",
    defaultDurationMinutes: 120,
    defaultWhen: "afternoon",
  },
  beach: {
    label: "Playa",
    hint: "Arena y sol",
    types: ["beach"],
    preference: "maximum_sun",
    defaultDurationMinutes: 120,
    defaultWhen: "afternoon",
  },
  sunset: {
    label: "Atardecer",
    hint: "Ver caer el sol",
    types: ["viewpoint", "beach", "open_space", "park"],
    preference: "maximum_sun",
    defaultDurationMinutes: 30,
    defaultWhen: "sunset",
  },
  walk: {
    label: "Pasear",
    hint: "Caminar al sol",
    types: ["park", "open_space", "beach"],
    preference: "balanced",
    defaultDurationMinutes: 60,
    defaultWhen: "now",
  },
};

export const INTENT_ORDER: SunIntent[] = ["sun", "shade", "coffee", "beach", "sunset", "read", "walk"];
