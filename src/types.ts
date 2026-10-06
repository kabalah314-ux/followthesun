/**
 * Tipos centralizados de Follow the Sun.
 *
 * Cadena de luz, cada eslabón con su propio resultado:
 *   SolarPosition → ShadowResult → (CloudCoverage ⟷ SatelliteRadiation) → LightFusion → SunlightResult
 *
 * Y sobre ella, el producto:
 *   SunSearchRequest → candidatos (SunPlace) → ventanas de sol → Sun Score → SunSearchResult
 */

export type Theme = "day" | "night";

/**
 * Estado visual de luz en un punto (glifos, línea de tiempo del día).
 *  · sun sol directo · partial parcial/incierto · cloud limitado por nubes · shade sombra geométrica
 */
export type SunState = "sun" | "partial" | "cloud" | "shade";

export interface LngLat {
  lng: number;
  lat: number;
}

export interface GeoBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface SelectedPoint extends LngLat {
  id: number;
  name: string;
}

/* -------------------------------------------------------------------------- */
/*  Origen del dato                                                            */
/* -------------------------------------------------------------------------- */

/**
 * De dónde procede un dato y cómo se obtuvo. Son conceptos distintos y no se mezclan:
 *  · observed      medido por un satélite en ese instante
 *  · forecast      salida de un modelo numérico
 *  · interpolated  entre dos observaciones (estimación, no medida)
 *  · estimated     persistencia de la última observación o mezcla sin ganador claro
 *  · stale         observación antigua
 *  · unavailable   sin datos
 */
export type DataOrigin =
  | "observed"
  | "forecast"
  | "interpolated"
  | "estimated"
  | "stale"
  | "unavailable";

/** Familia de evidencia que domina el resultado final. */
export type SunlightOrigin = "observed" | "forecast" | "estimated";

/** Calidad del dato: alta confianza · estimado · desactualizado · sin datos. */
export type DataQuality = "high" | "estimated" | "outdated" | "unavailable";

/* -------------------------------------------------------------------------- */
/*  1 · Sol astronómico                                                        */
/* -------------------------------------------------------------------------- */

/** Azimut (desde el norte, hacia el este) y altitud del sol, en radianes y en grados. */
export interface SolarPosition {
  azimuth: number;
  altitude: number;
  azimuthDeg: number;
  altitudeDeg: number;
}

/* -------------------------------------------------------------------------- */
/*  2 · Sombra (edificios y relieve)                                           */
/* -------------------------------------------------------------------------- */

export interface ShadowResult {
  /** Un edificio bloquea el sol en este punto. */
  urbanShadow: boolean;
  /** El relieve (Collserola, Montjuïc…) bloquea el sol en el horizonte. */
  terrainShadow: boolean;
  /**
   * false cuando no había edificios cargados alrededor del punto: no se puede afirmar nada
   * sobre la sombra urbana (no equivale a "sin sombra").
   */
  buildingsKnown: boolean;
  /** 0-1 · fiabilidad de la geometría usada. */
  confidence: number;
  source: string;
}

/* -------------------------------------------------------------------------- */
/*  3a · Meteorología modelada                                                 */
/* -------------------------------------------------------------------------- */

export interface CloudCoverage {
  latitude: number;
  longitude: number;

  /** Instante al que se refiere la estimación. */
  timestamp: Date;

  /** 0 = cielo despejado · 1 = completamente cubierto (fracción de cielo, NO radiación). */
  cloudCover: number;

  lowCloudCover?: number;
  mediumCloudCover?: number;
  highCloudCover?: number;

  /** Metros. AROME/ARPEGE no lo publican: queda sin definir. */
  visibility?: number;

  /** 0-1 · cuánto fiarse de esta estimación del modelo. */
  confidence: number;

  source: string;

  /** Cuándo se consultó el dato a la fuente. */
  updatedAt: Date;

  /**
   * Fracción de la hora con sol directo según el modelo. `sunshine_duration` es una cantidad
   * DERIVADA (umbral de DNI sobre una descomposición del GHI): se trata como ESTIMADA.
   */
  sunshineFraction?: number;
  /** DNI y GHI instantáneas del modelo (W/m²), interpoladas en el tiempo. */
  modelDni?: number;
  modelGhi?: number;
  /** Señales con las que se estimó la transmisión (cada una 0-1). */
  transmissionSignals?: { radiation?: number; layers?: number; sunshine?: number };
  /** 0-1 · coherencia entre las señales del modelo. */
  signalConsistency?: number;
  /** 0-1 · probabilidad estimada de que el haz solar directo atraviese las nubes (según el modelo). */
  directBeamTransmission: number;
  /** 0-1 · acuerdo entre AROME y ARPEGE (1 = coinciden). */
  modelAgreement?: number;
  /** 0-1 · soporte espacial de la interpolación. */
  spatialCoverage: number;
  /** Tamaño de celda del modelo que respalda el dato, en km. */
  resolutionKm: number;
  quality: DataQuality;
  simulated: boolean;
}

export type WeatherState = "loading" | "ready" | "partial" | "stale" | "unavailable";

export interface WeatherStatus {
  state: WeatherState;
  quality: DataQuality;
  source: string | null;
  attribution: string | null;
  resolutionKm: number | null;
  updatedAt: number | null;
  ageMs: number | null;
  confidence: number | null;
  simulated: boolean;
  /** 0-1 · fracción de la rejilla con datos. */
  coverage: number;
  refreshing: boolean;
}

/* -------------------------------------------------------------------------- */
/*  3b · Observación satelital                                                 */
/* -------------------------------------------------------------------------- */

export interface SatelliteRadiation {
  latitude: number;
  longitude: number;

  /** Instante consultado. */
  timestamp: Date;

  /** W/m². GHI = directa horizontal + difusa. */
  shortwaveRadiation?: number;
  directRadiation?: number;
  diffuseRadiation?: number;
  directNormalIrradiance?: number;
  /** GHI de cielo despejado de la propia fuente (W/m²). */
  clearSkyShortwave?: number;

  source: string;
  /** Ej. "2,5 km · 10 min". */
  nativeResolution?: string;

  /** true solo si hay una muestra real en ese instante (no interpolada ni persistida). */
  observed: boolean;
  /** Retraso medido entre la última muestra y su descarga (min). */
  delayMinutes?: number;
  /** 0-1 · calidad intrínseca de esta muestra. */
  confidence: number;
  /** Cuándo se consultó el dato a la fuente. */
  updatedAt: Date;

  /** observed · interpolated · estimated (persistencia) · stale. */
  origin: DataOrigin;
  /** Instante de la observación en la que se basa el valor. */
  sampleTime: Date;
  /** Minutos entre la observación y el instante consultado (persistencia). 0 si hay muestra o interpolación. */
  leadMinutes: number;
  /** DNI / DNI de cielo despejado (0-1): cuánto del sol directo parece llegar. null si no se puede calcular (sol bajo). */
  directTransmission: number | null;
  /** GHI / GHI de cielo despejado. */
  clearSkyIndex: number | null;
  /** 0-1 · coherencia entre la directa y el índice de GHI. null si no se puede comprobar. */
  consistency: number | null;
  resolutionKm: number;
  temporalResolutionMinutes: number;
  /** 0-1 · soporte espacial de la interpolación. */
  spatialCoverage: number;
}

export type SatelliteState = "loading" | "ready" | "stale" | "unavailable";

export interface SatelliteStatus {
  state: SatelliteState;
  quality: DataQuality;
  origin: DataOrigin;
  source: string | null;
  attribution: string | null;
  resolutionKm: number | null;
  temporalResolutionMinutes: number | null;
  lastObservationAt: number | null;
  /** Retraso medido al descargar (min). */
  latencyMinutes: number | null;
  /** Edad de la última observación respecto a "ahora". */
  ageMs: number | null;
  fetchedAt: number | null;
  refreshing: boolean;
  /** Factor de calibración del cielo despejado calculado con el del satélite. */
  calibration: { factor: number; source: "satellite" | "none" };
}

/** Radiación de cielo despejado: referencia con la que se normaliza la radiación observada. */
export interface ClearSkyRadiation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  ghi: number;
  dni: number;
  dhi: number;
  /**
   * satellite-calibrated: cálculo propio escalado por el GHI de cielo despejado del satélite
   * calculated: solo cálculo astronómico/atmosférico propio (Meinel + Haurwitz). NO es un dato observado.
   */
  source: "satellite-calibrated" | "calculated";
  calibrationFactor: number;
}

/* -------------------------------------------------------------------------- */
/*  4 · Fusión modelo ⟷ observación                                            */
/* -------------------------------------------------------------------------- */

export interface FusionSourceReport {
  /** Transmisión del haz directo (0-1) según esta fuente. */
  transmission: number | null;
  /** Peso de calidad (0-1) que obtuvo esta fuente. */
  weight: number;
  origin: DataOrigin;
  /** Factores que componen el peso (cada uno 0-1). */
  factors: Record<string, number>;
  explanation: string;
  confidence: number;
}

export type FusionWinner = "satellite" | "model" | "blend" | "none";

export interface LightFusion {
  /** Hay al menos una fuente utilizable. */
  available: boolean;
  /** Transmisión del haz directo fusionada (0-1). null si no hay datos. */
  directTransmission: number | null;
  /** 1 − transmisión (0 si no hay datos). */
  cloudInfluence: number;
  origin: SunlightOrigin | null;
  /** Cómo se obtuvo el dato dominante. */
  dataOrigin: DataOrigin;
  winner: FusionWinner;
  /** Cuota del satélite en el resultado (0-1). */
  satelliteShare: number;
  conflict: boolean;
  /** |satélite − modelo|. */
  conflictMagnitude: number;
  satellite: FusionSourceReport | null;
  model: FusionSourceReport | null;
  confidence: { satellite: number; model: number; weather: number };
  /** Instante dentro de la ventana de "presente". */
  inCurrentWindow: boolean;
  minutesSinceObservation: number | null;
  /** Registro legible de por qué se llegó a esta conclusión (debug). */
  decision: string[];
}

export type LightSourceMode = "fused" | "model" | "satellite";

export type LightSourceKind = "loading" | "observed" | "forecast" | "estimated" | "stale" | "unavailable";

/** Qué fuente respalda un instante, a nivel de ciudad (para la interfaz). */
export interface LightSourceSummary {
  kind: LightSourceKind;
  /** observed: edad de la observación · forecast: edad de la última descarga del modelo. */
  ageMs: number | null;
  satellite: {
    source: string;
    resolutionKm: number;
    temporalResolutionMinutes: number;
    latencyMinutes: number | null;
    lastObservationAt: number | null;
  } | null;
  model: {
    source: string;
    resolutionKm: number | null;
    updatedAt: number | null;
  } | null;
}

/** Zonas de la línea de tiempo según el origen del dato. */
export interface TimeZones {
  /** Hasta aquí hay observaciones reales. null si no hay satélite. */
  observedUntil: number | null;
  /** Hasta aquí se considera "presente" (la observación manda). */
  presentUntil: number | null;
}

/* -------------------------------------------------------------------------- */
/*  5 · Luz solar efectiva                                                     */
/* -------------------------------------------------------------------------- */

export type SunlightState =
  | "night"
  | "direct"
  | "partial"
  | "urban_shadow"
  | "terrain_shadow"
  | "cloud_blocked"
  | "urban_shadow_cloud"
  | "possible"
  | "uncertain";

export type SunlightLimiter = "night" | "terrain" | "urban_shadow" | "cloud_cover";

/** Confianza desglosada por eslabón. `final` es el eslabón más débil de la cadena que importa. */
export interface ConfidenceBreakdown {
  solar: number;
  geometry: number;
  weather: number;
  satellite: number;
  final: number;
}

export interface SunlightResult {
  /** Instante evaluado (ms). */
  time: number;
  state: SunlightState;
  /** Estado visual simplificado (glifos y línea de tiempo del día). */
  visual: SunState | "night";
  /** Más probable que no que llegue sol directo (puntuación ≥ 0,5). */
  directSun: boolean;
  /** Un edificio tapa el sol. */
  urbanShadow: boolean;
  /** Sombra del relieve en el horizonte. */
  terrainShadow: boolean;
  /** Las nubes probablemente bloquean el haz directo (transmisión < 0,5). */
  cloudBlocked: boolean;
  /** 0-1 · cuánto del sol directo atenúan las nubes (0 si no hay datos). */
  cloudInfluence: number;
  /** 0-1 · transmisión del haz directo (1 si no hay datos: ver `weatherAvailable`). */
  directTransmission: number;
  /** 0 → 1 continuo. */
  sunlightScore: number;
  /** = `confidenceBreakdown.final`. */
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  /** Familia de evidencia dominante: observación · previsión · estimación. */
  origin: SunlightOrigin;
  /** Cómo se obtuvo el dato dominante (observed, interpolated, estimated, stale, forecast…). */
  dataOrigin: DataOrigin;
  /** Satélite y modelo discrepan de forma apreciable. */
  conflict: boolean;
  weatherQuality: DataQuality;
  /** Qué limita la luz: puede haber varios a la vez ("sombra urbana + nubes"). */
  limitedBy: SunlightLimiter[];
  sunAboveHorizon: boolean;
  buildingsKnown: boolean;
  /** Hay al menos una fuente de nubes utilizable. */
  weatherAvailable: boolean;
  cloud: CloudCoverage | null;
  satellite: SatelliteRadiation | null;
  fusion: LightFusion | null;
  /** La geometría urbana es de edificio; la meteorología, de varios kilómetros. */
  spatial: { geometryScaleMeters: number; weatherScaleKm: number | null };
  source: {
    solar: string;
    geometry: string;
    satellite?: string;
    weatherModel?: string;
  };
}

/* -------------------------------------------------------------------------- */
/*  Capa solar y vista                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Unidad de dato solar. Es el contrato de la capa solar: cualquier fuente
 * (simulada hoy, API real mañana) entrega una lista de estos puntos y la capa los pinta.
 */
export type SolarPoint = {
  latitude: number;
  longitude: number;
  /** 0-1 · luz solar directa que llega al suelo (sin contar la elevación del sol). */
  sunlight: number;
  /** 0-1 · fracción en sombra (relieve, edificios). */
  shadow: number;
  /** 0-1 · densidad de nubes sobre el punto. */
  cloudCoverage: number;
};

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Vista del mapa lista para dibujar sobre el suelo, con cualquier rotación e inclinación.
 * El suelo se expresa en (u, v) = píxeles planos desde el centro: u = (mx − cx)·ws, v = (my − cy)·ws.
 * `H` lleva (u, v) a píxeles de pantalla; `Hi` hace el camino inverso.
 */
export interface View {
  cx: number;
  cy: number;
  /** Tamaño del mundo en píxeles CSS (512 · 2^zoom). */
  ws: number;
  w: number;
  h: number;
  /** Píxeles planos por metro en el centro de la vista. */
  ppm: number;
  zoom: number;
  bearing: number;
  pitch: number;
  H: Float64Array;
  Hi: Float64Array;
  /** Caja Mercator del terreno visible (con margen). */
  bounds: Bounds2D;
  /**
   * Posición de la cámara en las mismas coordenadas (u, v en píxeles planos; z = altura en píxeles).
   * Permite proyectar puntos elevados (tejados) igual que el mapa dibuja los edificios en 3D.
   */
  camera: { x: number; y: number; z: number } | null;
}

export interface CameraState {
  bearing: number;
  pitch: number;
}

export interface TimelineInterval {
  state: SunState;
  start: number;
  end: number;
}

export interface PointTimeline {
  lng: number;
  lat: number;
  dayStart: number;
  intervals: TimelineInterval[];
  sunMs: number;
  partialMs: number;
  cloudMs: number;
  shadeMs: number;
  /** false cuando no había edificios cargados alrededor del punto. */
  hasBuildings: boolean;
  /** false cuando no hay datos de nubes: el resultado es solo geometría. */
  weatherAvailable: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Línea de tiempo de luz de un punto                                         */
/* -------------------------------------------------------------------------- */

export interface SunlightTimelineRange {
  start: number;
  end: number;
  stepMinutes?: number;
}

export interface SunlightTimelineSample {
  time: number;
  score: number;
  state: SunlightState;
  visual: SunState | "night";
  directTransmission: number;
  confidence: number;
  origin: SunlightOrigin;
  dataOrigin: DataOrigin;
  urbanShadow: boolean;
  directSun: boolean;
}

export interface SunlightTimelineResult {
  samples: SunlightTimelineSample[];
  intervals: TimelineInterval[];
  /** Minutos con sol directo (puntuación ≥ 0,5). */
  directSunMinutes: number;
  /** Σ puntuación × paso: minutos de sol "esperados". */
  expectedSunMinutes: number;
  /** Minutos del rango cubiertos por observación / por previsión. */
  observedMinutes: number;
  forecastMinutes: number;
  meanConfidence: number;
  minConfidence: number;
  weatherAvailable: boolean;
  buildingsKnown: boolean;
}

export type CityDirection =
  | "everywhere"
  | "none"
  | "scattered"
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export interface CityStats {
  /** % del área visible con sol directo efectivo (geometría + sombras + nubes). */
  sunPercent: number;
  shadePercent: number;
  /** % medio del haz directo que bloquean las nubes en el área visible. */
  cloudPercent: number;
  direction: CityDirection;
  altitudeDeg: number;
  azimuthDeg: number;
  area: string;
  zoom: number;
}

export interface Highlight {
  id: string;
  lng: number;
  lat: number;
  /** 0-1 · intensidad del halo en el mapa. */
  score: number;
  rank: number;
  name: string;
  /** Texto corto bajo el marcador (p. ej. la puntuación). */
  label?: string;
  /** El resultado principal destaca; el resto se atenúa. */
  primary?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  FIND THE SUN · lugares                                                     */
/* -------------------------------------------------------------------------- */

export type SunPlaceType = "beach" | "park" | "square" | "terrace" | "viewpoint" | "open_space";

/**
 * Categorías RESERVADAS: previstas pero sin datos reales detrás todavía (bancos, cafés y
 * restaurantes como lugares propios). No se ofrecen en la interfaz hasta tener una fuente.
 */
export type ReservedPlaceType = "bench" | "cafe" | "restaurant";

/** Compatible con GeoJSON.Polygon (coordenadas [lng, lat]). */
export interface GeoPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

/* -------------------------------------------------------------------------- */
/*  Negocios (cafeterías, bares, restaurantes con terraza)                     */
/* -------------------------------------------------------------------------- */

/** Categoría de negocio. Ampliable sin tocar el motor. */
export type VenueCategory = "cafe" | "bar" | "restaurant" | "ice_cream" | "pub" | "biergarten";

/**
 * Certeza sobre si el negocio tiene terraza:
 *  · confirmed  alguien lo ha documentado (OSM `outdoor_seating=yes`, o una persona desde la app)
 *  · likely     candidato por heurística (planta baja, acera ancha…): NO es un hecho
 *  · unknown    no se sabe
 *  · none       se sabe que no tiene
 */
export type TerraceCertainty = "confirmed" | "likely" | "unknown" | "none";

/** Un negocio candidato a tener sol en su terraza. */
export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  terrace: TerraceCertainty;
  /** Quién afirma que hay terraza (para poder explicarlo). */
  terraceSource: string;
  /** Horario de apertura si se conoce. */
  openingHours?: string;
  metadata?: Record<string, unknown>;
}

export interface VenueProviderInfo {
  id: string;
  label: string;
  /** ¿Se puede usar en este proyecto? */
  available: boolean;
  /** Por qué no, cuando `available` es false. */
  reason?: string;
  /** Coste orientativo por 1.000 consultas (null = gratis). */
  costPerThousand: number | null;
  /** ¿Deja guardar los datos en el dispositivo? Clave para no pagar en cada visita. */
  allowsCaching: boolean;
  /** ¿Deja mostrar los datos sobre un mapa que no es suyo? */
  allowsThirdPartyMap: boolean;
  license: string;
}

export interface VenueProvider {
  info: VenueProviderInfo;
  loadVenues(area: GeoBounds): Promise<Venue[]>;
}

/** Confirmación de una persona: «aquí sí hay terraza al sol». */
export interface VenueFeedback {
  venueId: string;
  venueName: string;
  latitude: number;
  longitude: number;
  /** La persona dice que en ese momento había mesas al sol. */
  hasTerrace: boolean;
  sunAtMoment: boolean;
  confirmedAt: number;
}

/** Un lugar candidato. Siempre procede de una fuente real (hoy: OpenStreetMap). */
export interface SunPlace {
  id: string;
  name: string;
  type: SunPlaceType;
  /** Punto representativo (interior para áreas, el propio punto para nodos). */
  latitude: number;
  longitude: number;
  polygon?: GeoPolygon;
  /** Lugares lineales (p. ej. una playa mapeada como línea). */
  path?: number[][];
  areaM2?: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export type PlaceInventoryState = "loading" | "ready" | "stale" | "unavailable";

export interface PlaceInventoryStatus {
  state: PlaceInventoryState;
  counts: Record<SunPlaceType, number>;
  total: number;
  fetchedAt: number | null;
  attribution: string;
}

/* -------------------------------------------------------------------------- */
/*  FIND THE SUN · petición                                                    */
/* -------------------------------------------------------------------------- */

/** Qué quiere hacer la persona (traduce la intención a tipos de lugar y prioridades). */
export type SunIntent = "sun" | "shade" | "coffee" | "read" | "beach" | "sunset" | "walk";

/**
 * Prioridad de la búsqueda:
 *  · maximum_sun  el máximo sol directo
 *  · balanced     sol + confort (calor y viento)
 *  · comfort      RESERVADO: confort por encima del sol (sin implementar)
 */
export type SunPreference = "maximum_sun" | "balanced" | "comfort";

export type LocationTypeFilter = "any" | SunPlaceType;

export type WhenPreset = "now" | "in30" | "in60" | "afternoon" | "sunset" | "tomorrow" | "custom";

export interface SunSearchRequest {
  /** Inicio y fin de la franja (ms epoch). */
  startTime: number;
  endTime: number;
  /** Duración que se quiere disfrutar: se busca la mejor ventana de esta duración dentro de la franja. */
  minimumSunlightMinutes: number;
  /** Tiempo máximo a pie. Solo se aplica si hay `origin`. */
  maximumWalkingMinutes?: number;
  /** Ubicación de la persona (si la comparte). Sin ella no hay filtro de distancia. */
  origin?: LngLat | null;
  locationType?: LocationTypeFilter;
  intent?: SunIntent;
  preference?: SunPreference;
  avoidClouds?: boolean;
  preferShadeBreaks?: boolean;
  limit?: number;
}

export interface NormalizedSunRequest extends SunSearchRequest {
  locationType: LocationTypeFilter;
  preference: SunPreference;
  limit: number;
  stepMs: number;
}

/* -------------------------------------------------------------------------- */
/*  FIND THE SUN · ventanas y puntuación                                       */
/* -------------------------------------------------------------------------- */

/**
 *  sun        sol directo
 *  partial    sol parcial (nubes finas o sol débil)
 *  shadow     sombra de edificios o relieve
 *  cloud      las nubes tapan el sol
 *  uncertain  fuentes en conflicto o confianza meteorológica muy baja
 *  night      sin sol
 */
export type SunWindowKind = "sun" | "partial" | "shadow" | "cloud" | "uncertain" | "night";

export interface SunWindow {
  kind: SunWindowKind;
  start: number;
  end: number;
  /** Sin datos de nubes: el "sol" es solo posible, no confirmado. */
  unverified?: boolean;
}

/** Una muestra de luz de un punto en un instante (extracto de `SunlightResult`). */
export interface SunSample {
  time: number;
  kind: SunWindowKind;
  /** 0-1 · puntuación de luz efectiva. */
  score: number;
  urbanShadow: boolean;
  terrainShadow: boolean;
  cloudInfluence: number;
  confidence: number;
  geometryConfidence: number;
  weatherConfidence: number;
  unverified: boolean;
  origin: SunlightOrigin;
  elevationDeg: number;
}

export interface NarrativeEvent {
  time: number;
  kind: SunWindowKind | "best";
  label: string;
}

export interface SunScoreComponent {
  key: string;
  label: string;
  /** 0-1 */
  value: number;
  weight: number;
  /** Puntos (0-100) que aporta al Sun Score. */
  contribution: number;
}

export interface SunScoreAdjustment {
  key: string;
  label: string;
  /** Puntos (0-100) que suma o resta. */
  delta: number;
}

export interface SunScore {
  /** 0-100 */
  score: number;
  components: SunScoreComponent[];
  adjustments: SunScoreAdjustment[];
}

export interface RankingDetail {
  score: number;
  confidenceAdjustment: number;
  distanceAdjustment: number;
  value: number;
}

export interface ResultReason {
  tone: "plus" | "minus" | "neutral";
  text: string;
}

export interface WalkingEstimate {
  distanceMeters: number;
  durationMinutes: number;
  /** false: estimación en línea recta con factor de rodeo, no una ruta real. */
  exact: boolean;
  method: "straight_line_estimate" | "network";
}

export interface ConfidenceSummary {
  /** Geometría: posición del sol y edificios. */
  geometry: number;
  /** Meteorología: observación satelital y previsión (escala de barrio). */
  weather: number;
  overall: number;
}

export interface ComfortSummary {
  meanTemperatureC: number;
  meanApparentC: number;
  maxWindKmh: number;
  source: string;
}

export interface SunSearchResult {
  rank: number;
  placeId: string;
  place: SunPlace;
  locationType: SunPlaceType;
  /** Mejor punto del lugar (donde sentarse). */
  spot: { latitude: number; longitude: number; offsetMeters: number };
  /** 0-100 · puntuación de sol (explicable: ver `scoreDetail`). */
  score: number;
  scoreDetail: SunScore;
  /** Valor de ordenación: puntuación ajustada por confianza y distancia. */
  rankingValue: number;
  rankingDetail: RankingDetail;

  requestedMinutes: number;
  /** Minutos de sol directo dentro de la mejor ventana de la duración pedida. */
  sunlightMinutes: number;
  partialMinutes: number;
  urbanShadowMinutes: number;
  cloudMinutes: number;
  uncertainMinutes: number;
  longestSunRunMinutes: number;
  /** sunlightMinutes / requestedMinutes · 100 */
  directSunPercentage: number;
  /** 0-1 · cuánto del sol directo atenúan las nubes (media en la ventana). */
  cloudInfluence: number;
  meanElevationDeg: number;
  /** Fracción de puntos del lugar con sol comparable al mejor (null si hay pocos puntos). */
  areaSunShare: number | null;
  sampledPoints: number;

  confidence: number;
  confidenceDetail: ConfidenceSummary;
  origin: SunlightOrigin;

  /** Ventana de la duración pedida con más sol. */
  searchWindow: { start: number; end: number };
  /** Tramo de sol directo dentro de esa ventana (recortado). null si no hay sol directo. */
  bestWindow: { start: number; end: number } | null;
  /** Estados a lo largo de toda la franja pedida, en el mejor punto. */
  windows: SunWindow[];
  narrative: NarrativeEvent[];

  walking?: WalkingEstimate;
  comfort?: ComfortSummary;

  meetsRequest: boolean;
  /** false: no hay datos de nubes; el "sol" es posible, no confirmado. */
  weatherAvailable: boolean;
  /** false: no había edificios cargados; la sombra urbana no está verificada. */
  buildingsKnown: boolean;
  reasons: ResultReason[];
}

export type SearchPhase = "places" | "buildings" | "sun" | "ranking";

export interface SearchProgress {
  phase: SearchPhase;
  done: number;
  total: number;
}

export type SearchStatus =
  | "idle"
  | "searching"
  | "results"
  | "no_results"
  | "partial_data"
  | "weather_unavailable"
  | "places_unavailable";

export type SearchNoticeCode =
  | "weather_unavailable"
  | "weather_stale"
  | "weather_partial"
  | "beyond_forecast"
  | "buildings_partial"
  | "buildings_unavailable"
  | "places_stale"
  | "comfort_unavailable"
  | "no_location";

export type NoSunReason = "night" | "clouds" | "shade" | "no_places" | "none";

export interface SunSearchOutcome {
  status: Exclude<SearchStatus, "idle" | "searching">;
  request: NormalizedSunRequest;
  /** Lugares que cumplen la petición completa. */
  results: SunSearchResult[];
  /** Si ninguno la cumple entera: lo mejor disponible. */
  bestAvailable: SunSearchResult[];
  notices: SearchNoticeCode[];
  noSunReason: NoSunReason | null;
  meta: {
    candidates: number;
    analyzedSpots: number;
    /** 0-1 · puntos con edificios cargados alrededor. */
    buildingsKnownFraction: number;
    requestedMinutes: number;
    bestAvailableMinutes: number;
    sunsetAt: number | null;
    computedAt: number;
    elapsedMs: number;
  };
}

export interface SunSearchOptions {
  /** Candidatos propios (p. ej. puntos exactos). Por defecto, el inventario de OpenStreetMap. */
  places?: SunPlace[];
  signal?: AbortSignal;
  now?: number;
  onProgress?: (p: SearchProgress) => void;
}

/* -------------------------------------------------------------------------- */
/*  Guardar y compartir                                                        */
/* -------------------------------------------------------------------------- */

export interface SavedPlace {
  id: string;
  name: string;
  type: SunPlaceType;
  latitude: number;
  longitude: number;
  savedAt: number;
}

export interface ShareablePlan {
  title: string;
  text: string;
  url: string;
}

/* -------------------------------------------------------------------------- */
/*  Calibración futura con sensores (SIN implementar)                          */
/* -------------------------------------------------------------------------- */

/**
 * Medición de luz de referencia (la verdad del terreno). Hoy no se usa: existe para que algún día
 * se pueda comparar lo previsto con lo observado y calibrar los pesos de `LIGHT_MODEL_CONFIG`.
 */
export interface LightObservation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  /** W/m² */
  directRadiation?: number;
  globalRadiation?: number;
  directNormalIrradiance?: number;
  source: string;
  kind: "weather_station" | "public_station" | "phone_sensor" | "ground_truth";
}

export interface LightObservationProvider {
  id: string;
  getObservations(area: GeoBounds, range: { start: number; end: number }): Promise<LightObservation[]>;
}
