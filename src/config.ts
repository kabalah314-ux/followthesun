/**
 * Follow the Sun — configuración central.
 * Todo lo que dependa de una fuente de datos externa vive aquí para poder
 * sustituirlo sin tocar la lógica de la aplicación.
 */

export const APP_NAME = "I Follow the Sun";
export const APP_VERSION = "0.7.0";

export const BARCELONA = {
  name: "Barcelona",
  lat: 41.3874,
  lng: 2.1686,
  timeZone: "Europe/Madrid",
} as const;

export const MAP_CONFIG = {
  center: [BARCELONA.lng, BARCELONA.lat] as [number, number],
  /** Zoom inicial; tras cargar, el mapa se acerca suavemente a `zoomDesktop` / `zoomMobile`. */
  introZoom: 12.5,
  zoomDesktop: 13.4,
  zoomMobile: 13.2,
  minZoom: 11.6,
  maxZoom: 18.4,
  maxPitch: 60,
  maxBounds: [
    [1.92, 41.27],
    [2.42, 41.57],
  ] as [[number, number], [number, number]],
  /** A partir de este zoom las teselas incluyen edificios. */
  buildingMinZoom: 13,
} as const;

/**
 * Relieve 3D: entre estos zooms los edificios crecen desde el suelo hasta su altura real (el mapa y
 * la capa solar usan exactamente la misma transición, para que siluetas y sombras coincidan).
 */
export const BUILDINGS_3D = {
  fromZoom: 14.9,
  fullZoom: 16.2,
  /** Inclinación automática al acercarse (si la persona no ha inclinado el mapa a mano). */
  autoTiltZoom: 15.35,
  autoTiltPitch: 38,
  /** Por debajo de este zoom se vuelve a la vista cenital (si la inclinación fue automática). */
  autoTiltResetZoom: 14.9,
} as const;

/** Teselas vectoriales abiertas (esquema OpenMapTiles) — mapa de respaldo, sin token. */
export const OPEN_TILES = {
  vectorSource: "https://tiles.openfreemap.org/planet",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
} as const;

/** Rectángulo de la ciudad para validar la ubicación del usuario. */
export const CITY_BOUNDS = {
  west: 2.02,
  east: 2.26,
  south: 41.31,
  north: 41.5,
} as const;

/** Rejilla donde la capa solar guarda sus datos (≈ 400 m por celda sobre toda el área navegable). */
export const SOLAR_FIELD = {
  bounds: {
    west: MAP_CONFIG.maxBounds[0][0],
    east: MAP_CONFIG.maxBounds[1][0],
    south: MAP_CONFIG.maxBounds[0][1],
    north: MAP_CONFIG.maxBounds[1][1],
  },
  cols: 104,
  rows: 84,
} as const;

/* -------------------------------------------------------------------------- */
/*  Meteorología                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Proveedor de datos meteorológicos.
 *  · "open-meteo"  datos reales (Météo-France AROME / ARPEGE vía Open-Meteo)
 *  · "demo"        datos sintéticos SOLO para desarrollo sin red (`?weather=demo`);
 *                  la interfaz los etiqueta como demostración.
 */
export const DATA_SOURCES = {
  weather: (() => {
    try {
      return new URLSearchParams(window.location.search).get("weather") === "demo"
        ? "demo"
        : "open-meteo";
    } catch {
      return "open-meteo";
    }
  })() as "open-meteo" | "demo",
};

/**
 * Rejilla meteorológica de Barcelona: 6 × 5 = 30 puntos separados 0,05° (≈ 4,2 km E-O, 5,6 km N-S).
 * AROME tiene celdas de 2,5 km, así que esta malla no añade resolución: solo permite interpolar
 * de forma suave entre las celdas del modelo.
 */
export const WEATHER_GRID = {
  bounds: { west: 2.03, east: 2.28, south: 41.31, north: 41.51 },
  cols: 6,
  rows: 5,
} as const;

/**
 * Tiempos de la caché meteorológica.
 *
 * Open-Meteo publica AROME France cada 3 h (y una versión de 15 min cada hora). Consultar con más
 * frecuencia que cada ~30 min devuelve los mismos datos, así que ese es el TTL.
 */
export const WEATHER_CONFIG = {
  /** Pasado este tiempo se vuelve a consultar. */
  ttlMs: 30 * 60_000,
  /** Hasta aquí el dato se considera "fresco" (sin penalización de confianza). */
  freshMs: 45 * 60_000,
  /** Más allá, el dato se marca como DESACTUALIZADO y la confianza baja. */
  outdatedMs: 150 * 60_000,
  /** Más allá, el dato se descarta por completo. */
  maxStaleMs: 8 * 3_600_000,
  /** Esperas entre reintentos tras un fallo (la última se repite). */
  retryMs: [20_000, 60_000, 180_000, 600_000],
  requestTimeoutMs: 12_000,
  /** Ventana pedida a la API: ayer + hoy + mañana (cubre cualquier posición del selector de tiempo). */
  pastDays: 1,
  forecastDays: 2,
} as const;

export const WEATHER_CACHE_TTL = WEATHER_CONFIG.ttlMs;

/**
 * Open-Meteo es gratis solo para uso NO comercial (< 10.000 llamadas/día). Para un producto
 * comercial hay que contratar una clave: `VITE_OPEN_METEO_API_KEY`. Una clave en el navegador es
 * pública; lo recomendable es un proxy propio y apuntar `VITE_OPEN_METEO_BASE_URL` a él.
 */
const meteoKey = (import.meta.env.VITE_OPEN_METEO_API_KEY as string | undefined)?.trim() ?? "";
const meteoBase = (import.meta.env.VITE_OPEN_METEO_BASE_URL as string | undefined)?.trim() ?? "";

export const WEATHER_API = {
  apiKey: meteoKey,
  baseUrl: meteoBase || (meteoKey ? "https://customer-api.open-meteo.com" : "https://api.open-meteo.com"),
} as const;

/* -------------------------------------------------------------------------- */
/*  Observación satelital                                                      */
/* -------------------------------------------------------------------------- */

/**
 * VENTANA DE "PRESENTE" — `CURRENT_OBSERVATION_WINDOW_MINUTES`.
 *
 * Se mide desde la ÚLTIMA observación satelital disponible, no desde el reloj. Para instantes
 * hasta ese tiempo después de la última observación, la observación manda y el modelo solo aporta
 * continuidad (como máximo `LIGHT_MODEL_CONFIG.FUSION.modelMaxShareInWindow`). Pasada la ventana,
 * la prioridad se desvanece en `FUSION.priorityFadeMinutes` y gobierna la calidad relativa de cada
 * fuente (el satélite, que solo puede "persistir", pierde peso con la vida media de persistencia).
 *
 * Por qué 60 min (heurística, NO calibrada con datos propios):
 *  · el satélite llega con ~20–30 min de retraso y cada escaneo cubre 10 min: con 60 min el
 *    "presente" abarca aproximadamente [última pasada … ahora + ~35 min];
 *  · los campos de nubes sobre un píxel de ~2,5 km se decorrelacionan en una escala de decenas de
 *    minutos a ~1–2 h (orden de magnitud); la persistencia del índice de cielo despejado
 *    ("smart persistence") es la referencia habitual y suele rivalizar con la previsión numérica
 *    durante la primera hora o dos.
 */
export const CURRENT_OBSERVATION_WINDOW_MINUTES = 60;

/**
 * Fuente: Open-Meteo Satellite Radiation API → EUMETSAT MTG vía DWD (rejilla 0,025° ≈ 2,5 km,
 * 10 min, ~20 min de retraso). Verificado contra la API real para Barcelona: con
 * `models=satellite_radiation_seamless` + `temporal_resolution=native` devuelve pasos de 10 min y
 * nodos alineados a 0,025° con GHI de cielo despejado; SIN `models` devuelve horario, otra rejilla
 * y sin cielo despejado (no usar).
 */
export const SATELLITE_CONFIG = {
  model: "satellite_radiation_seamless",
  nominalResolutionKm: 2.5,
  nativeStepMinutes: 10,
  nominalLatencyMinutes: 20,
  /** Caché: llega un escaneo nuevo cada 10 min. */
  ttlMs: 10 * 60_000,
  /** Nunca se consulta con menos separación que esta. */
  minRefreshMs: 3 * 60_000,
  /** Edad de la última observación hasta la que se considera "fresca". */
  freshMinutes: 45,
  /** Pasada esta edad, la persistencia se marca como "stale" (antigua). */
  staleMinutes: 90,
  /** Pasada esta edad la persistencia se descarta (las muestras pasadas siguen siendo hechos). */
  maxUsefulPersistenceMinutes: 240,
  /** Última observación conservada para fallback. */
  maxStaleMs: 6 * 3_600_000,
  retryMs: [30_000, 90_000, 240_000, 600_000],
  requestTimeoutMs: 15_000,
  /** Solo el día UTC actual: la luz diurna de Barcelona cae siempre dentro de un mismo día UTC. */
  pastDays: 0,
} as const;

const satBase =
  (import.meta.env.VITE_OPEN_METEO_SATELLITE_BASE_URL as string | undefined)?.trim() ?? "";

export const SATELLITE_API = {
  apiKey: meteoKey,
  baseUrl:
    satBase ||
    (meteoKey ? "https://customer-satellite-api.open-meteo.com" : "https://satellite-api.open-meteo.com"),
} as const;

/* -------------------------------------------------------------------------- */
/*  Modelo de luz: TODOS los pesos y umbrales calibrables, en un solo sitio    */
/* -------------------------------------------------------------------------- */

/**
 * Ningún peso vive enterrado en el código. Son juicios de ingeniería documentados, NO resultado de
 * una calibración contra mediciones; el modo `?debug=weather` existe para calibrarlos.
 */
export const LIGHT_MODEL_CONFIG = {
  /** Elevación solar (°) por debajo de la cual no hay sol directo (≈ orto/ocaso con refracción). */
  MIN_SUN_ELEVATION_DEG: -0.5,
  /** A partir de esta elevación el horizonte ya no atenúa el sol. */
  FULL_SUN_OPENING_DEG: 3,
  /** Por debajo, los cocientes radiación / cielo despejado son inestables (masa de aire alta). */
  LOW_SUN_ELEVATION_DEG: 8,

  /** Puntuación ≥ → "sol directo". */
  DIRECT_LIGHT_THRESHOLD: 0.625,
  /** Puntuación ≥ → "sol parcial"; por debajo, "nubes bloquean". */
  PARTIAL_LIGHT_THRESHOLD: 0.375,
  /** `directSun = puntuación ≥ este valor`. */
  DIRECT_SUN_BOOLEAN_THRESHOLD: 0.5,
  /** Transmisión del haz directo por debajo de la cual se dice que las nubes lo bloquean. */
  CLOUD_BLOCKED_TRANSMISSION: 0.5,
  /** Influencia de nubes (1 − transmisión): baja < low · moderada < high · alta. */
  CLOUD_INFLUENCE_LEVELS: { low: 0.25, high: 0.6 },

  /**
   * Opacidad de cada capa de nubes para el HAZ DIRECTO (0 transparente, 1 opaca). Los cirros
   * (capa alta) suelen ser finos: dejan pasar buena parte del sol directo aunque cubran el cielo.
   */
  CLOUD_OPACITY: { low: 1, mid: 0.9, high: 0.45 },

  /**
   * Cómo se combinan las tres señales del modelo para estimar la transmisión directa:
   *  · radiation  DNI instantánea del modelo / DNI de cielo despejado (la más directa)
   *  · layers     capas de nubes con la opacidad anterior
   *  · sunshine   `sunshine_duration` (suma de la hora precedente; DERIVADA, ver README) → peso bajo
   */
  MODEL_SIGNAL_WEIGHTS: { radiation: 0.5, layers: 0.4, sunshine: 0.1 },

  /** Referencia de cielo despejado calculada (Meinel para DNI, Haurwitz para GHI). */
  CLEAR_SKY: {
    /** Transmitancia atmosférica de Meinel (0,7 estándar; el Mediterráneo es algo más turbio). */
    transmittance: 0.7,
    /** DNI de cielo despejado mínima para calcular un cociente fiable (W/m²). */
    minClearDniWm2: 60,
    minClearGhiWm2: 50,
    /** Factor de calibración con el GHI de cielo despejado del satélite (se limita a este rango). */
    calibrationRange: [0.85, 1.15],
    /** Solo se calibra con muestras de GHI de cielo despejado mayores que esto (W/m²). */
    calibrationMinGhiWm2: 200,
  },

  /** Calidad intrínseca de cada fuente (ver `lib/sourceWeights.ts`). */
  SOURCE_QUALITY: {
    /** Observación vs. modelo: el satélite mide el presente; el modelo solo lo pronostica. */
    satelliteBase: 1,
    modelBase: 0.7,
    /** Muestra interpolada entre dos observaciones. */
    satelliteInterpolated: 0.92,
    /** Persistencia: calidad inicial y vida media (min) tras la última observación. */
    persistenceStartFactor: 0.9,
    persistenceHalfLifeMinutes: 75,
    /** Penalización extra si la última observación es antigua ("stale"). */
    satelliteStalePenalty: 0.5,
    /** Pérdida de calidad del modelo por hora de horizonte. */
    modelDecayPerHour: 0.035,
    modelMinHorizonFactor: 0.5,
    /** exp(−resolución / escala): 2,5 km → 0,84 · 11 km → 0,46. */
    spatialScaleKm: 14,
    spatialMinFactor: 0.3,
    /** Penalización por resolución temporal horaria frente a 10 min. */
    temporalPenaltyAtHourly: 0.12,
    /** Menor peso a elevaciones solares bajas (el satélite es más sensible). */
    elevation: {
      satellite: { from: 4, to: 18, floor: 0.3 },
      model: { from: 4, to: 18, floor: 0.65 },
    },
    agreementFloor: 0.6,
    unknownAgreement: 0.9,
    /** Por debajo de este peso, la fuente se ignora. */
    minUsableWeight: 0.08,
  },

  /** Fusión modelo ↔ satélite. */
  FUSION: {
    /** >1 acentúa a la fuente más fiable en lugar de promediar (2 = razón de cuotas al cuadrado). */
    sharpening: 2,
    /** Dentro de la ventana de presente el modelo aporta como máximo esta cuota (continuidad). */
    modelMaxShareInWindow: 0.3,
    /** Tras la ventana, la prioridad de la observación se desvanece en este tiempo. */
    priorityFadeMinutes: 60,
    /** Discrepancia |satélite − modelo| (en transmisión 0-1) a partir de la cual hay CONFLICTO. */
    conflictThreshold: 0.35,
    /** Reducción relativa de confianza cuando hay conflicto. */
    conflictConfidencePenalty: 0.45,
    /** Con cuota del satélite en esta banda no hay ganador claro (→ "incierto" si hay conflicto). */
    ambiguousShareBand: [0.35, 0.65],
    /** Cuota a partir de la cual se dice que un solo origen gana. */
    winnerShare: 0.65,
  },

  CONFIDENCE: {
    solar: 0.99,
    solarLowSun: 0.9,
    geometryWithBuildings: 0.85,
    geometryWithoutBuildings: 0.6,
    /** Techos: ni una observación de ~2,5 km ni una previsión llegan a certeza. */
    maxObserved: 0.9,
    maxForecast: 0.78,
    /** Sin datos de nubes, la confianza del resultado no pasa de aquí. */
    noWeather: 0.3,
    /** Con confianza meteorológica por debajo de esto → estado "incierto". */
    uncertainBelow: 0.25,
    high: 0.65,
    medium: 0.4,
  },
} as const;

/** Módulo de validación: `?debug=weather`. */
export const DEBUG = {
  weather: (() => {
    try {
      return new URLSearchParams(window.location.search).get("debug") === "weather";
    } catch {
      return false;
    }
  })(),
};

/* -------------------------------------------------------------------------- */
/*  FIND THE SUN · lugares, búsqueda y puntuación                              */
/* -------------------------------------------------------------------------- */

const overpassOverride = (import.meta.env.VITE_OVERPASS_URL as string | undefined)?.trim() ?? "";

/**
 * Inventario de lugares: OpenStreetMap a través de Overpass. NO hay lugares escritos a mano:
 * si no se consigue el inventario, la búsqueda lo dice en lugar de inventar resultados.
 */
export const PLACES_CONFIG = {
  /** Barcelona (término municipal, aproximado). */
  bbox: { south: 41.317, west: 2.052, north: 41.468, east: 2.229 },
  endpoints: [
    ...(overpassOverride ? [overpassOverride] : []),
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ] as readonly string[],
  /** OpenStreetMap cambia despacio: una semana de caché, y hasta dos meses como respaldo. */
  ttlMs: 7 * 24 * 3_600_000,
  maxStaleMs: 60 * 24 * 3_600_000,
  timeoutMs: 40_000,
  /** Superficie mínima (m²) para que un área sea un lugar donde quedarse. */
  minAreaM2: { beach: 3000, park: 2500, square: 600, open_space: 1500 },
  attribution: "© OpenStreetMap contributors (ODbL)",
} as const;

export const SEARCH_CONFIG = {
  /** Paso de análisis del sol dentro de la franja (franjas de más de `longRangeHours` usan el largo). */
  stepMinutes: 10,
  longRangeStepMinutes: 15,
  longRangeHours: 4,
  walking: {
    /** ≈ 4,8 km/h. */
    speedMetersPerMinute: 80,
    /** Una ruta real es más larga que la línea recta (calles, esquinas, manzanas). */
    detourFactor: 1.3,
  },
  /** Tope de lugares que se analizan (los más cercanos, o los más grandes si no hay ubicación). */
  maxCandidates: 450,
  /** Muestreo de puntos dentro de un lugar (un parque no tiene la misma luz en todas partes). */
  sampling: {
    areaPerPointM2: 2500,
    maxPoints: 12,
    minSpacingM: 18,
    /** Terrazas: se desconoce dónde están las mesas; se analiza un anillo alrededor del local. */
    ringRadiusM: 7,
    ringPoints: 8,
    pathSpacingM: 120,
    maxPathPoints: 8,
  },
  /** Radio de edificios que pueden dar sombra a un punto. */
  shadowRadiusM: 420,
  resultLimit: 3,
  /** Los resultados finales no pueden estar a menos de esta distancia entre sí. */
  minSeparationM: 300,
  /** Cumple la petición si tiene al menos esta fracción de los minutos de sol pedidos. */
  requestTolerance: 0.9,
  /** Por debajo de esta fracción de la duración pedida, no se considera un lugar soleado. */
  minUsefulSunFraction: 0.1,
  weatherWaitMs: 6000,
  tileConcurrency: 6,
  yieldEveryMs: 24,
  progressEveryMs: 120,
  /** Por debajo de esta fracción de puntos con edificios cargados, aviso de datos parciales. */
  buildingsPartialBelow: 0.9,
} as const;

/**
 * Sun Score: cada número está aquí y se explica. No son pesos aleatorios: la puntuación es una
 * combinación lineal de tres magnitudes que la persona puede leer en el resultado.
 */
export const SUN_SCORE_CONFIG = {
  weights: {
    /** Minutos de sol directo / minutos pedidos. */
    coverage: 0.7,
    /** Intensidad media de la luz efectiva (premia el sol pleno frente al parcial). */
    strength: 0.2,
    /** Tramo ininterrumpido más largo / minutos pedidos. */
    continuity: 0.1,
  },
  /**
   * Un lugar donde solo brilla un rincón es peor apuesta que uno iluminado en casi todo: se
   * multiplica por `floor + (1 − floor) · fracción de la zona con sol`.
   */
  spatial: { floor: 0.88 },
  /** Con «evitar nubes», se resta esta fracción de la influencia de las nubes. */
  avoidCloudsPenalty: 0.25,
  /** «Pausas de sombra»: la sombra urbana ideal está entre estos porcentajes del tiempo. */
  shadeBreaks: { minShare: 0.05, maxShare: 0.25 },
  /**
   * Ranking: lo que se ordena NO es el Sun Score a secas.
   *   valor = score − 20·(1 − confianza)·k − penalización por distancia
   * Un 95 con confianza baja no gana a un 91 con confianza alta, pero un 95 sí gana a un 70.
   */
  ranking: { confidencePenalty: 0.2, walkPenaltyPerMinute: 0.2, walkPenaltyCap: 8 },
  /** Modo equilibrado: el sol cuesta puntos cuando hace mucho calor o mucho viento. */
  comfort: { heatFrom: 26, heatTo: 34, heatFloor: 0.7, windFrom: 20, windTo: 40, windFloor: 0.8 },
  presets: {
    afternoonFromHour: 14,
    afternoonUntilHour: 21,
    afternoonPlanTo: 19,
    sunsetLeadMinutes: 45,
    sunsetDefaultDuration: 30,
  },
} as const;

/** Funciones preparadas pero apagadas. `?buildings3d=1` en la URL activa los edificios 3D. */
export const FEATURES = {
  buildings3D: (() => {
    try {
      return new URLSearchParams(window.location.search).get("buildings3d") === "1";
    } catch {
      return false;
    }
  })(),
};

/* -------------------------------------------------------------------------- */
/*  Mapbox                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DÓNDE PONER EL TOKEN DE MAPBOX                                          │
 * │                                                                          │
 * │  1. Copia `.env.example` a `.env` en la raíz del proyecto.               │
 * │  2. Rellena:  VITE_MAPBOX_TOKEN=pk.xxxxxxxxxxxxxxxx                      │
 * │  3. Reinicia el servidor / vuelve a ejecutar el build.                   │
 * │                                                                          │
 * │  (En Vite las variables públicas llevan el prefijo VITE_, equivalente    │
 * │   al NEXT_PUBLIC_ de Next.js. Usa un token público `pk.`; nunca `sk.`).  │
 * │                                                                          │
 * │  Sin token la app sigue funcionando con un mapa abierto equivalente.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TOKEN_STORAGE_KEY = "fts:mapbox-token";

export function getMapboxToken(): string | null {
  const valid = (t: string | null | undefined): t is string => !!t && /^pk\.[\w.-]+$/.test(t.trim());

  const fromEnv = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim();
  if (valid(fromEnv)) return fromEnv;

  // Alternativa para probar sin recompilar: ?mapbox_token=pk.… (se recuerda en este navegador).
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("mapbox_token");
    if (valid(fromUrl)) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, fromUrl.trim());
      return fromUrl.trim();
    }
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (valid(stored)) return stored.trim();
  } catch {
    /* almacenamiento no disponible */
  }
  return null;
}

export function forgetMapboxToken() {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
