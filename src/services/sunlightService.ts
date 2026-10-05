import { LIGHT_MODEL_CONFIG as C } from "../config";
import { clamp } from "../lib/coordinates";
import { horizonOpening } from "../lib/sunlightCalculations";
import type {
  CloudCoverage,
  ConfidenceBreakdown,
  DataQuality,
  LightFusion,
  PointTimeline,
  SatelliteRadiation,
  ShadowResult,
  SolarPosition,
  SunState,
  SunlightLimiter,
  SunlightResult,
  SunlightState,
  SunlightTimelineRange,
  SunlightTimelineResult,
  SunlightTimelineSample,
  TimelineInterval,
} from "../types";
import type { BuildingSet } from "./buildingService";
import { cloudService } from "./cloudService";
import { fuseLight, lightFusionService } from "./lightFusionService";
import { satelliteService } from "./satelliteService";
import { createShadowEvaluator } from "./shadowService";
import { solarService } from "./solarService";

/**
 * sunlightService — luz solar EFECTIVA. Solo COMBINA resultados; no calcula nubes ni sombras:
 *
 *   SOL ASTRONÓMICO  (solarService)
 *        ↓
 *   GEOMETRÍA URBANA (shadowService)         edificios y relieve
 *        ↓
 *   METEOROLOGÍA     (lightFusionService)    observación satelital ⟷ modelo, fusionadas
 *        ↓
 *   LUZ EFECTIVA     score = apertura del horizonte × (sin sombra) × transmisión del haz directo
 *
 * Cada capa conserva su resultado por separado (`urbanShadow`, `terrainShadow`, `cloudInfluence`) para
 * poder explicar "sombra urbana", "nubes" o "sombra urbana + nubes".
 *
 * Sin datos meteorológicos NO se inventan nubes: el estado es `possible` ("Sol posible"), nunca
 * `direct`, y la confianza se limita.
 */

const SOLAR_SOURCE = "Astronómico (NOAA / SunCalc)";
/** La geometría urbana tiene resolución de edificio (≈ decenas de metros). */
const GEOMETRY_SCALE_METERS = 10;

const VISUAL: Record<SunlightState, SunState | "night"> = {
  night: "night",
  direct: "sun",
  partial: "partial",
  urban_shadow: "shade",
  terrain_shadow: "shade",
  urban_shadow_cloud: "shade",
  cloud_blocked: "cloud",
  // Sin datos de nubes el sol no está verificado, pero la línea del día sigue mostrando la geometría.
  possible: "sun",
  uncertain: "partial",
};

/* -------------------------------------------------------------------------- */
/*  Resolución (función PURA: la usan los tests)                               */
/* -------------------------------------------------------------------------- */

export interface ResolveInputs {
  time: number;
  now: number;
  sun: SolarPosition;
  shadow: ShadowResult;
  satellite: SatelliteRadiation | null;
  model: CloudCoverage | null;
  lastObservationAt: number | null;
  /** Si ya se ha fusionado, se reutiliza. */
  fusion?: LightFusion;
}

function weatherQualityOf(
  f: LightFusion,
  sat: SatelliteRadiation | null,
  model: CloudCoverage | null
): DataQuality {
  if (!f.available) return "unavailable";
  if (f.satelliteShare >= 0.5 && sat) {
    if (sat.origin === "stale") return "outdated";
    return f.confidence.weather >= C.CONFIDENCE.high ? "high" : "estimated";
  }
  return model ? model.quality : "estimated";
}

export function resolveSunlight(i: ResolveInputs): SunlightResult {
  const { sun, shadow } = i;
  const geometryOnlySource = shadow.source;

  /* 1 · Sol astronómico: de noche no hay nada que combinar. */
  if (sun.altitudeDeg < C.MIN_SUN_ELEVATION_DEG) {
    return {
      time: i.time,
      state: "night",
      visual: "night",
      directSun: false,
      urbanShadow: false,
      terrainShadow: false,
      cloudBlocked: false,
      cloudInfluence: 0,
      directTransmission: 0,
      sunlightScore: 0,
      confidence: 1,
      confidenceBreakdown: { solar: C.CONFIDENCE.solar, geometry: 1, weather: 0, satellite: 0, final: 1 },
      origin: "estimated",
      dataOrigin: "unavailable",
      conflict: false,
      weatherQuality: "unavailable",
      limitedBy: ["night"],
      sunAboveHorizon: false,
      buildingsKnown: shadow.buildingsKnown,
      weatherAvailable: cloudService.hasData() || satelliteService.hasData(),
      cloud: null,
      satellite: null,
      fusion: null,
      spatial: { geometryScaleMeters: GEOMETRY_SCALE_METERS, weatherScaleKm: null },
      source: { solar: SOLAR_SOURCE, geometry: geometryOnlySource },
    };
  }

  /* 2 · Geometría (ya evaluada) y 3 · meteorología fusionada. */
  const fusion =
    i.fusion ??
    fuseLight({
      time: i.time,
      now: i.now,
      sun,
      satellite: i.satellite,
      model: i.model,
      lastObservationAt: i.lastObservationAt,
    });

  const T = fusion.directTransmission; // null si no hay datos
  const urban = shadow.urbanShadow;
  const terrain = shadow.terrainShadow;
  const shaded = urban || terrain;
  const cloudBlocked = T !== null && T < C.CLOUD_BLOCKED_TRANSMISSION;

  /* 4 · Luz efectiva. */
  const opening = horizonOpening(sun.altitudeDeg);
  const score = shaded ? 0 : clamp(opening * (T ?? 1), 0, 1);

  let state: SunlightState;
  if (urban) state = cloudBlocked ? "urban_shadow_cloud" : "urban_shadow";
  else if (terrain) state = "terrain_shadow";
  else if (!fusion.available) state = "possible";
  else if (
    (fusion.conflict && fusion.winner === "blend") ||
    fusion.confidence.weather < C.CONFIDENCE.uncertainBelow
  )
    state = "uncertain";
  else if (score >= C.DIRECT_LIGHT_THRESHOLD) state = "direct";
  else if (score >= C.PARTIAL_LIGHT_THRESHOLD || (T !== null && T >= C.CLOUD_BLOCKED_TRANSMISSION))
    state = "partial";
  else state = "cloud_blocked";

  const limitedBy: SunlightLimiter[] = [];
  if (terrain) limitedBy.push("terrain");
  if (urban) limitedBy.push("urban_shadow");
  if (cloudBlocked) limitedBy.push("cloud_cover");

  /* Confianza desglosada. `final` es el eslabón más débil de la cadena que importa. */
  const breakdown: ConfidenceBreakdown = {
    solar: sun.altitudeDeg < 3 ? C.CONFIDENCE.solarLowSun : C.CONFIDENCE.solar,
    geometry: shadow.confidence,
    weather: fusion.available ? fusion.confidence.weather : 0,
    satellite: fusion.confidence.satellite,
    final: 0,
  };
  if (urban) breakdown.final = Math.min(breakdown.solar, breakdown.geometry);
  else if (terrain) breakdown.final = Math.min(breakdown.solar, breakdown.geometry, 0.75);
  else if (fusion.available) {
    breakdown.final = Math.min(breakdown.solar, breakdown.geometry, breakdown.weather);
  } else {
    breakdown.final = Math.min(breakdown.solar, breakdown.geometry, C.CONFIDENCE.noWeather);
  }

  const satDominant = fusion.satelliteShare >= 0.5 && i.satellite !== null;
  const weatherScaleKm = !fusion.available
    ? null
    : satDominant
      ? i.satellite!.resolutionKm
      : (i.model?.resolutionKm ?? null);

  return {
    time: i.time,
    state,
    visual: VISUAL[state],
    directSun: score >= C.DIRECT_SUN_BOOLEAN_THRESHOLD,
    urbanShadow: urban,
    terrainShadow: terrain,
    cloudBlocked,
    cloudInfluence: fusion.cloudInfluence,
    directTransmission: T ?? 1,
    sunlightScore: score,
    confidence: breakdown.final,
    confidenceBreakdown: breakdown,
    origin: fusion.origin ?? "estimated",
    dataOrigin: fusion.dataOrigin,
    conflict: fusion.conflict,
    weatherQuality: weatherQualityOf(fusion, i.satellite, i.model),
    limitedBy,
    sunAboveHorizon: true,
    buildingsKnown: shadow.buildingsKnown,
    weatherAvailable: fusion.available,
    cloud: i.model,
    satellite: i.satellite,
    fusion,
    spatial: { geometryScaleMeters: GEOMETRY_SCALE_METERS, weatherScaleKm },
    source: {
      solar: SOLAR_SOURCE,
      geometry: shadow.source,
      satellite: i.satellite ? i.satellite.source : undefined,
      weatherModel: i.model ? i.model.source : undefined,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Evaluador de un punto                                                      */
/* -------------------------------------------------------------------------- */

export interface PointEvaluatorOptions {
  latitude: number;
  longitude: number;
  /** Edificios cargados (o null si no hay datos aquí). */
  buildings: BuildingSet | null;
}

export interface PointEvaluator {
  latitude: number;
  longitude: number;
  buildingsKnown: boolean;
  /** Luz efectiva en este punto para un instante. */
  evaluate(time: number | Date, now?: number): SunlightResult;
}

const NIGHT_SHADOW = (source: string, known: boolean): ShadowResult => ({
  urbanShadow: false,
  terrainShadow: false,
  buildingsKnown: known,
  confidence: 1,
  source,
});

/**
 * Evaluador reutilizable para un punto fijo (construye una sola vez la geometría y los muestreadores
 * de satélite y modelo; no hace red). Es la pieza base de la línea de tiempo del punto y de
 * `getSunlightTimeline` (futuro Find the Sun).
 */
function createPointEvaluator(opts: PointEvaluatorOptions): PointEvaluator {
  const { latitude, longitude } = opts;
  const shadow = createShadowEvaluator({ latitude, longitude, buildings: opts.buildings });
  const light = lightFusionService.pointSampler(latitude, longitude);
  const lastObservationAt = satelliteService.getLastObservationAt();

  return {
    latitude,
    longitude,
    buildingsKnown: shadow.buildingsKnown,

    evaluate(time, now = Date.now()) {
      const t = typeof time === "number" ? time : time.getTime();
      const sun = solarService.getPosition(t, latitude, longitude);

      if (sun.altitudeDeg < C.MIN_SUN_ELEVATION_DEG) {
        return resolveSunlight({
          time: t,
          now,
          sun,
          shadow: NIGHT_SHADOW(shadow.source, shadow.buildingsKnown),
          satellite: null,
          model: null,
          lastObservationAt,
        });
      }

      const sh = shadow.evaluate(sun);
      const pl = light(t, sun, now);
      return resolveSunlight({
        time: t,
        now,
        sun,
        shadow: sh,
        satellite: pl.satellite,
        model: pl.model,
        lastObservationAt,
        fusion: pl.fusion,
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Ventana de tiempo                                                          */
/* -------------------------------------------------------------------------- */

export interface WindowSummary {
  meanScore: number;
  minScore: number;
  sunMinutes: number;
  confidence: number;
  samples: number;
}

/** Resume la luz efectiva de un punto en [start, end]. */
function evaluateWindow(
  evaluator: PointEvaluator,
  start: number,
  end: number,
  stepMinutes = 10
): WindowSummary {
  const step = stepMinutes * 60_000;
  const now = Date.now();
  let sum = 0;
  let min = 1;
  let conf = 0;
  let sunMs = 0;
  let n = 0;
  for (let t = start; t <= end; t += step) {
    const r = evaluator.evaluate(t, now);
    sum += r.sunlightScore;
    conf += r.confidence;
    min = Math.min(min, r.sunlightScore);
    if (r.directSun) sunMs += step;
    n++;
  }
  return {
    meanScore: n ? sum / n : 0,
    minScore: n ? min : 0,
    sunMinutes: sunMs / 60_000,
    confidence: n ? conf / n : 0,
    samples: n,
  };
}

/* -------------------------------------------------------------------------- */
/*  Línea de tiempo de luz de un punto — base de Find the Sun                   */
/* -------------------------------------------------------------------------- */

export interface SunlightTimelinePoint {
  latitude: number;
  longitude: number;
  buildings: BuildingSet | null;
}

/**
 * Luz efectiva de un punto a lo largo de un rango, combinando sombra urbana, observaciones del
 * satélite (pasado y presente), previsión del modelo (futuro) y geometría solar. Devuelve muestras,
 * tramos y duraciones: es lo que usará el futuro buscador ("¿dónde puedo sentarme al sol las
 * próximas 2 horas?"). Cada muestra conserva su origen y su confianza.
 */
function getSunlightTimeline(
  point: SunlightTimelinePoint,
  range: SunlightTimelineRange
): SunlightTimelineResult {
  const stepMin = range.stepMinutes ?? 10;
  const step = stepMin * 60_000;
  const now = Date.now();
  const evaluator = createPointEvaluator({
    latitude: point.latitude,
    longitude: point.longitude,
    buildings: point.buildings,
  });

  const samples: SunlightTimelineSample[] = [];
  for (let t = range.start; t <= range.end; t += step) {
    const r = evaluator.evaluate(t, now);
    samples.push({
      time: t,
      score: r.sunlightScore,
      state: r.state,
      visual: r.visual,
      directTransmission: r.directTransmission,
      confidence: r.confidence,
      origin: r.origin,
      dataOrigin: r.dataOrigin,
      urbanShadow: r.urbanShadow,
      directSun: r.directSun,
    });
  }

  const intervals: TimelineInterval[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.visual === "night") continue;
    const end = i + 1 < samples.length ? samples[i + 1].time : Math.min(s.time + step, range.end);
    const last = intervals[intervals.length - 1];
    if (last && last.state === s.visual && last.end === s.time) last.end = end;
    else intervals.push({ state: s.visual, start: s.time, end });
  }

  const day = samples.filter((s) => s.visual !== "night");
  let observed = 0;
  let forecast = 0;
  let directSun = 0;
  let expected = 0;
  let confSum = 0;
  let confMin = 1;
  for (const s of day) {
    if (s.origin === "observed") observed += stepMin;
    else if (s.origin === "forecast") forecast += stepMin;
    if (s.directSun) directSun += stepMin;
    expected += s.score * stepMin;
    confSum += s.confidence;
    confMin = Math.min(confMin, s.confidence);
  }

  return {
    samples,
    intervals,
    directSunMinutes: directSun,
    expectedSunMinutes: expected,
    observedMinutes: observed,
    forecastMinutes: forecast,
    meanConfidence: day.length ? confSum / day.length : 0,
    minConfidence: day.length ? confMin : 0,
    weatherAvailable: day.some((s) => s.state !== "possible"),
    buildingsKnown: evaluator.buildingsKnown,
  };
}

/* -------------------------------------------------------------------------- */
/*  Línea de tiempo del día (interfaz): tramos con transiciones refinadas       */
/* -------------------------------------------------------------------------- */

export interface TimelineArgs {
  lng: number;
  lat: number;
  dayStart: number;
  buildings: BuildingSet | null;
  stepMinutes?: number;
}

type RawState = SunState | "night";

interface Run {
  state: SunState;
  i0: number;
  i1: number;
}

function computeTimeline(args: TimelineArgs): PointTimeline {
  const { lng, lat, dayStart, buildings } = args;
  const step = (args.stepMinutes ?? 3) * 60_000;
  const evaluator = createPointEvaluator({ latitude: lat, longitude: lng, buildings });
  const times = solarService.getSunTimes(dayStart, lat, lng);
  const now = Date.now();

  const classify = (t: number): RawState => evaluator.evaluate(t, now).visual;

  const sampleTimes: number[] = [];
  const states: SunState[] = [];
  for (let t = times.sunrise - 15 * 60_000; t <= times.sunset + 15 * 60_000; t += step) {
    const st = classify(t);
    if (st === "night") continue;
    sampleTimes.push(t);
    states.push(st);
  }

  const base = {
    lng,
    lat,
    dayStart,
    hasBuildings: evaluator.buildingsKnown,
    weatherAvailable: cloudService.hasData() || satelliteService.hasData(),
  };

  if (states.length === 0) {
    return { ...base, intervals: [], sunMs: 0, partialMs: 0, cloudMs: 0, shadeMs: 0 };
  }

  // Agrupar en tramos y absorber los muy cortos (< 12 min) para que la lectura sea limpia.
  let runs: Run[] = [];
  for (let i = 0; i < states.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.state === states[i]) last.i1 = i;
    else runs.push({ state: states[i], i0: i, i1: i });
  }
  const MIN = 4;
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    for (let r = 0; r < runs.length; r++) {
      const len = runs[r].i1 - runs[r].i0 + 1;
      if (len >= MIN) continue;
      const prev = runs[r - 1];
      const next = runs[r + 1];
      if (prev && next && prev.state === next.state) {
        prev.i1 = next.i1;
        runs.splice(r, 2);
      } else if (prev && (!next || prev.i1 - prev.i0 >= next.i1 - next.i0)) {
        prev.i1 = runs[r].i1;
        runs.splice(r, 1);
      } else if (next) {
        next.i0 = runs[r].i0;
        runs.splice(r, 1);
      }
      changed = true;
      break;
    }
  }
  runs = runs.filter((r) => r.i1 >= r.i0);

  const refine = (a: number, b: number, stillFirst: (t: number) => boolean) => {
    let lo = a;
    let hi = b;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (stillFirst(mid)) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  const startOf = (run: Run, idx: number): number => {
    const i0 = run.i0;
    if (idx === 0) {
      const t0 = sampleTimes[0];
      return classify(t0 - step) === "night"
        ? refine(t0 - step, t0, (t) => classify(t) === "night")
        : t0;
    }
    const ta = sampleTimes[i0 - 1];
    const tb = sampleTimes[i0];
    const ca = classify(ta);
    if (ca !== classify(tb)) return refine(ta, tb, (t) => classify(t) === ca);
    return tb;
  };

  const starts = runs.map((r, idx) => startOf(r, idx));
  const lastT = sampleTimes[sampleTimes.length - 1];
  const endOfDay =
    classify(lastT + step) === "night"
      ? refine(lastT, lastT + step, (t) => classify(t) !== "night")
      : lastT;

  const intervals: TimelineInterval[] = runs.map((r, idx) => ({
    state: r.state,
    start: starts[idx],
    end: idx + 1 < runs.length ? starts[idx + 1] : endOfDay,
  }));

  let sunMs = 0;
  let partialMs = 0;
  let cloudMs = 0;
  let shadeMs = 0;
  for (const iv of intervals) {
    const d = Math.max(0, iv.end - iv.start);
    if (iv.state === "sun") sunMs += d;
    else if (iv.state === "partial") partialMs += d;
    else if (iv.state === "cloud") cloudMs += d;
    else shadeMs += d;
  }

  return { ...base, intervals, sunMs, partialMs, cloudMs, shadeMs };
}

/* -------------------------------------------------------------------------- */
/*  Series compartidas por varios puntos de un mismo lugar (motor de búsqueda)  */
/* -------------------------------------------------------------------------- */

type PointLightResult = ReturnType<ReturnType<typeof lightFusionService.pointSampler>>;

/**
 * Sol + meteorología de un LUGAR para una lista de instantes. La meteorología (satélite y modelo) es
 * de escala kilométrica: es la misma para todos los puntos de un parque, así que se calcula una sola
 * vez y se comparte. Lo que cambia punto a punto es la sombra de los edificios.
 */
export interface WeatherSeries {
  latitude: number;
  longitude: number;
  times: number[];
  now: number;
  sun: SolarPosition[];
  /** null cuando el sol está bajo el horizonte. */
  light: Array<PointLightResult | null>;
  lastObservationAt: number | null;
  /** Alguna hora tiene una fuente de nubes utilizable. */
  weatherAvailable: boolean;
}

export function buildWeatherSeries(
  latitude: number,
  longitude: number,
  times: number[],
  now: number = Date.now()
): WeatherSeries {
  const sampler = lightFusionService.pointSampler(latitude, longitude);
  const sun: SolarPosition[] = [];
  const light: Array<PointLightResult | null> = [];
  let weatherAvailable = false;
  for (const t of times) {
    const s = solarService.getPosition(t, latitude, longitude);
    sun.push(s);
    if (s.altitudeDeg < C.MIN_SUN_ELEVATION_DEG) {
      light.push(null);
      continue;
    }
    const pl = sampler(t, s, now);
    light.push(pl);
    if (pl.fusion.available) weatherAvailable = true;
  }
  return {
    latitude,
    longitude,
    times,
    now,
    sun,
    light,
    lastObservationAt: satelliteService.getLastObservationAt(),
    weatherAvailable,
  };
}

/** Lo mínimo que se necesita de una sombra: lo cumple `ShadowEvaluator`. */
export interface SpotShadow {
  source: string;
  buildingsKnown: boolean;
  evaluate(sun: SolarPosition): ShadowResult;
}

/** Luz efectiva de un punto (su sombra) para cada instante de una serie meteorológica. */
export function evaluateSpotSeries(shadow: SpotShadow, series: WeatherSeries): SunlightResult[] {
  return series.times.map((t, i) => {
    const sun = series.sun[i];
    const pl = series.light[i];
    if (!pl) {
      return resolveSunlight({
        time: t,
        now: series.now,
        sun,
        shadow: NIGHT_SHADOW(shadow.source, shadow.buildingsKnown),
        satellite: null,
        model: null,
        lastObservationAt: series.lastObservationAt,
      });
    }
    return resolveSunlight({
      time: t,
      now: series.now,
      sun,
      shadow: shadow.evaluate(sun),
      satellite: pl.satellite,
      model: pl.model,
      lastObservationAt: series.lastObservationAt,
      fusion: pl.fusion,
    });
  });
}

export const sunlightService = {
  resolveSunlight,
  createPointEvaluator,
  evaluateWindow,
  getSunlightTimeline,
  computeTimeline,
  buildWeatherSeries,
  evaluateSpotSeries,
};
