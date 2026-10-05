import { BARCELONA, SEARCH_CONFIG as S } from "../config";
import { clamp, distanceMeters } from "../lib/coordinates";
import { planSamples } from "../lib/placeSampling";
import { PUBLIC_PLACE_TYPES, SUN_INTENTS } from "../lib/placeTypes";
import { getSunTimes } from "../lib/solarCalculations";
import {
  buildNarrative,
  findBestSunWindow,
  groupWindows,
  type WindowMetrics,
} from "../lib/sunWindows";
import type {
  ComfortSummary,
  NormalizedSunRequest,
  NoSunReason,
  SearchNoticeCode,
  SearchPhase,
  SearchProgress,
  SunPlace,
  SunPlaceType,
  SunSample,
  SunSearchOptions,
  SunSearchOutcome,
  SunSearchRequest,
  SunSearchResult,
  SunWindowKind,
  SunlightOrigin,
  SunlightResult,
  WalkingEstimate,
} from "../types";
import { cloudService } from "./cloudService";
import { comfortService } from "./comfortService";
import { lightFusionService } from "./lightFusionService";
import { placeService } from "./placeService";
import { minutesForStraightMeters, routeService } from "./routeService";
import { satelliteService } from "./satelliteService";
import { createShadowEvaluator, type ShadowEvaluator } from "./shadowService";
import {
  buildReasons,
  calculateRankingValue,
  calculateSunScore,
  compareResults,
  type ReasonSubject,
} from "./sunScoreService";
import { sunlightService, type SpotShadow, type WeatherSeries } from "./sunlightService";
import { startOfZoneDay } from "./timeService";
import { urbanGeometryService, type UrbanGeometry } from "./urbanGeometryService";

/**
 * sunSearchService — el cerebro de Find the Sun.
 *
 *   findBestSunPlaces(request) → lugares ordenados, cada uno con sus ventanas de sol.
 *
 * Pipeline (cada paso reutiliza un servicio existente, nada se duplica):
 *
 *   petición ─▶ lugares reales (OSM)         placeService
 *            ─▶ candidatos                    tipo · distancia · intención
 *            ─▶ puntos de análisis            lib/placeSampling   (un parque no tiene la misma luz en todas partes)
 *            ─▶ edificios de la zona          urbanGeometryService (teselas OSM)
 *            ─▶ sol + nubes por lugar         sunlightService.buildWeatherSeries  (satélite ⟷ modelo, escala de barrio)
 *            ─▶ sombra por punto              shadowService       (precisión de edificio)
 *            ─▶ luz efectiva por instante     sunlightService.evaluateSpotSeries
 *            ─▶ ventanas de sol               lib/sunWindows      (mejor ventana de la duración pedida)
 *            ─▶ Sun Score + confianza         sunScoreService
 *            ─▶ ranking explicable            sunScoreService
 *
 * La meteorología es de escala kilométrica y la geometría de edificio: el resultado lo refleja en
 * la confianza desglosada (geometría / meteorología / global) y no promete una precisión de calle
 * que los datos de nubes no tienen.
 */

const MIN = 60_000;

export { findBestSunWindow } from "../lib/sunWindows";

/* -------------------------------------------------------------------------- */
/*  Petición                                                                   */
/* -------------------------------------------------------------------------- */

export function normalizeRequest(r: SunSearchRequest): NormalizedSunRequest {
  const duration = clamp(Math.round(r.minimumSunlightMinutes), 10, 360);
  const start = r.startTime;
  let end = r.endTime;
  // La franja nunca puede ser más corta que la duración pedida ni absurdamente larga.
  if (!(end > start) || end - start < duration * MIN) end = start + duration * MIN;
  if (end - start > 14 * 3_600_000) end = start + 14 * 3_600_000;
  const hours = (end - start) / 3_600_000;
  const stepMinutes = hours > S.longRangeHours ? S.longRangeStepMinutes : S.stepMinutes;
  return {
    ...r,
    startTime: start,
    endTime: end,
    minimumSunlightMinutes: duration,
    locationType: r.locationType ?? "any",
    preference: r.preference ?? "maximum_sun",
    limit: r.limit ?? S.resultLimit,
    stepMs: stepMinutes * MIN,
  };
}

export function buildTimes(start: number, end: number, stepMs: number): number[] {
  const out: number[] = [];
  for (let t = start; t < end; t += stepMs) out.push(t);
  if (out.length === 0) out.push(start);
  return out;
}

/** Tipos de lugar admitidos: el elegido, o los de la intención, o los espacios públicos. */
export function allowedTypes(req: Pick<SunSearchRequest, "locationType" | "intent">): SunPlaceType[] {
  if (req.locationType && req.locationType !== "any") return [req.locationType];
  if (req.intent) return SUN_INTENTS[req.intent].types;
  return PUBLIC_PLACE_TYPES;
}

/* -------------------------------------------------------------------------- */
/*  Candidatos                                                                 */
/* -------------------------------------------------------------------------- */

export interface Candidate {
  place: SunPlace;
  /** Minutos a pie estimados hasta el borde del lugar (solo con ubicación). */
  walkingMinutes?: number;
}

/**
 * Filtro de candidatos: tipo, distancia y tope. No se analiza todo Barcelona a ciegas:
 * se ordenan por cercanía (o por tamaño si no hay ubicación) y se limita su número.
 */
export function selectCandidates(places: SunPlace[], req: NormalizedSunRequest): Candidate[] {
  const types = new Set(allowedTypes(req));
  const origin = req.origin ?? null;
  const limit = req.maximumWalkingMinutes;
  const out: Array<Candidate & { sort: number }> = [];

  for (const place of places) {
    if (!types.has(place.type)) continue;
    let walkingMinutes: number | undefined;
    if (origin) {
      const straight = distanceMeters(origin.lng, origin.lat, place.longitude, place.latitude);
      // En un parque grande ya se está «dentro» a una distancia menor que la del centro.
      const radius = place.areaM2 ? Math.min(250, Math.sqrt(place.areaM2 / Math.PI)) : 0;
      walkingMinutes = minutesForStraightMeters(Math.max(0, straight - radius));
      if (limit !== undefined && walkingMinutes > limit) continue;
    }
    out.push({
      place,
      walkingMinutes,
      sort: origin ? (walkingMinutes ?? 0) : -(place.areaM2 ?? 0),
    });
  }

  out.sort((a, b) => a.sort - b.sort);
  return out.slice(0, S.maxCandidates).map((e) => ({ place: e.place, walkingMinutes: e.walkingMinutes }));
}

/* -------------------------------------------------------------------------- */
/*  Muestras                                                                   */
/* -------------------------------------------------------------------------- */

export function kindOf(r: SunlightResult): SunWindowKind {
  switch (r.state) {
    case "night":
      return "night";
    case "direct":
    case "possible":
      return "sun";
    case "partial":
      return "partial";
    case "uncertain":
      return "uncertain";
    case "cloud_blocked":
      return "cloud";
    default:
      return "shadow"; // sombra urbana, sombra urbana + nubes, sombra del relieve
  }
}

export function toSample(r: SunlightResult, elevationDeg: number): SunSample {
  return {
    time: r.time,
    kind: kindOf(r),
    score: r.sunlightScore,
    urbanShadow: r.urbanShadow,
    terrainShadow: r.terrainShadow,
    cloudInfluence: r.cloudInfluence,
    confidence: r.confidence,
    geometryConfidence: r.confidenceBreakdown.geometry,
    weatherConfidence: r.confidenceBreakdown.weather,
    unverified: r.state === "possible",
    origin: r.origin,
    elevationDeg,
  };
}

function dominantOrigin(samples: SunSample[], i0: number, i1: number): SunlightOrigin {
  const tally: Record<SunlightOrigin, number> = { observed: 0, forecast: 0, estimated: 0 };
  for (let i = i0; i <= i1; i++) {
    if (samples[i].kind !== "night") tally[samples[i].origin]++;
  }
  if (tally.observed + tally.forecast + tally.estimated === 0) return "estimated";
  let best: SunlightOrigin = "observed";
  for (const k of ["forecast", "estimated"] as const) if (tally[k] > tally[best]) best = k;
  return best;
}

/* -------------------------------------------------------------------------- */
/*  Utilidades de ejecución                                                    */
/* -------------------------------------------------------------------------- */

const abortError = () => new DOMException("Búsqueda cancelada", "AbortError");
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Cede el hilo principal cada pocos milisegundos para que el mapa y la interfaz sigan fluidos. */
class Pacer {
  private last = performance.now();
  async maybeYield(signal?: AbortSignal) {
    if (performance.now() - this.last > S.yieldEveryMs) {
      await tick();
      check(signal);
      this.last = performance.now();
    }
  }
}

function makeReporter(cb?: (p: SearchProgress) => void) {
  let last = 0;
  return (phase: SearchPhase, done: number, total: number, force = false) => {
    if (!cb) return;
    const t = performance.now();
    if (force || t - last >= S.progressEveryMs) {
      last = t;
      cb({ phase, done, total });
    }
  };
}

/** Espera brevemente a que lleguen los datos meteorológicos (si se están cargando). */
async function waitForWeather(signal?: AbortSignal): Promise<void> {
  const has = () => cloudService.hasData() || satelliteService.hasData();
  if (has()) return;
  const loading =
    cloudService.getStatus().state === "loading" || satelliteService.getStatus().state === "loading";
  if (!loading) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = lightFusionService.subscribe(() => {
      if (has()) finish();
    });
    const timer = setTimeout(finish, S.weatherWaitMs);
    signal?.addEventListener("abort", finish, { once: true });
  });
  check(signal);
}

/** Sombra nula: techo de luz que permite la meteorología sin ningún obstáculo. */
const NO_SHADOW: SpotShadow = {
  source: "sin sombra",
  buildingsKnown: true,
  evaluate: () => ({
    urbanShadow: false,
    terrainShadow: false,
    buildingsKnown: true,
    confidence: 1,
    source: "sin sombra",
  }),
};

/* -------------------------------------------------------------------------- */
/*  Análisis de un punto                                                       */
/* -------------------------------------------------------------------------- */

interface SpotAnalysis {
  lng: number;
  lat: number;
  samples: SunSample[];
  metrics: WindowMetrics;
  buildingsKnown: boolean;
}

function analyzeSpot(
  lng: number,
  lat: number,
  shadow: SpotShadow,
  series: WeatherSeries,
  req: NormalizedSunRequest
): SpotAnalysis | null {
  const results = sunlightService.evaluateSpotSeries(shadow, series);
  const samples = results.map((r, i) => toSample(r, series.sun[i].altitudeDeg));
  const metrics = findBestSunWindow(
    samples,
    req.stepMs,
    req.minimumSunlightMinutes * MIN,
    req.endTime
  );
  return metrics ? { lng, lat, samples, metrics, buildingsKnown: shadow.buildingsKnown } : null;
}

/** ¿Es `a` mejor punto que `b`? Más luz acumulada; a igualdad, más sol directo. */
const betterSpot = (a: WindowMetrics, b: WindowMetrics) =>
  a.scoreSum > b.scoreSum + 1e-6 ||
  (Math.abs(a.scoreSum - b.scoreSum) <= 1e-6 && a.sunMinutes > b.sunMinutes);

/* -------------------------------------------------------------------------- */
/*  Búsqueda                                                                   */
/* -------------------------------------------------------------------------- */

type ResultDraft = ReasonSubject;

export async function findBestSunPlaces(
  request: SunSearchRequest,
  options: SunSearchOptions = {}
): Promise<SunSearchOutcome> {
  const started = performance.now();
  const now = options.now ?? Date.now();
  const signal = options.signal;
  const req = normalizeRequest(request);
  const D = req.minimumSunlightMinutes;
  const times = buildTimes(req.startTime, req.endTime, req.stepMs);
  const report = makeReporter(options.onProgress);
  const pacer = new Pacer();
  const notices = new Set<SearchNoticeCode>();
  const sunsetAt = getSunTimes(startOfZoneDay(req.startTime), BARCELONA.lat, BARCELONA.lng).sunset;

  const outcome = (
    status: SunSearchOutcome["status"],
    extra: Partial<Pick<SunSearchOutcome, "results" | "bestAvailable" | "noSunReason">> &
      Partial<SunSearchOutcome["meta"]> = {}
  ): SunSearchOutcome => ({
    status,
    request: req,
    results: extra.results ?? [],
    bestAvailable: extra.bestAvailable ?? [],
    notices: [...notices],
    noSunReason: extra.noSunReason ?? null,
    meta: {
      candidates: extra.candidates ?? 0,
      analyzedSpots: extra.analyzedSpots ?? 0,
      buildingsKnownFraction: extra.buildingsKnownFraction ?? 1,
      requestedMinutes: D,
      bestAvailableMinutes: extra.bestAvailableMinutes ?? 0,
      sunsetAt,
      computedAt: now,
      elapsedMs: Math.round(performance.now() - started),
    },
  });

  /* 1 · Lugares reales */
  report("places", 0, 1, true);
  let places: SunPlace[];
  if (options.places) {
    places = options.places;
  } else {
    try {
      const inventory = await placeService.load();
      places = inventory.places;
      if (inventory.stale) notices.add("places_stale");
    } catch {
      return outcome("places_unavailable");
    }
  }
  check(signal);
  report("places", 1, 1, true);

  /* 2 · Candidatos */
  const candidates = selectCandidates(places, req);
  if (req.maximumWalkingMinutes !== undefined && !req.origin) notices.add("no_location");
  if (candidates.length === 0) {
    return outcome("no_results", { noSunReason: "no_places" });
  }

  /* 3 · Meteorología y ¿hay sol en absoluto? */
  await waitForWeather(signal);
  const weatherLoaded = cloudService.hasData() || satelliteService.hasData();
  if (!weatherLoaded) {
    notices.add("weather_unavailable");
  } else {
    const wState = cloudService.getStatus(now).state;
    if (wState === "stale") notices.add("weather_stale");
    else if (wState === "partial") notices.add("weather_partial");
  }

  const ceilingSeries = sunlightService.buildWeatherSeries(BARCELONA.lat, BARCELONA.lng, times, now);
  const ceilingSamples = sunlightService
    .evaluateSpotSeries(NO_SHADOW, ceilingSeries)
    .map((r, i) => toSample(r, ceilingSeries.sun[i].altitudeDeg));
  if (ceilingSamples.every((s) => s.kind === "night")) {
    return outcome("no_results", { noSunReason: "night", candidates: candidates.length });
  }
  const ceiling = findBestSunWindow(ceilingSamples, req.stepMs, D * MIN, req.endTime);
  if (weatherLoaded && ceilingSamples.some((s) => s.unverified)) notices.add("beyond_forecast");

  /* 4 · Puntos de análisis y edificios de la zona */
  const plan = candidates.map((c) => ({ c, points: planSamples(c.place) }));
  const allPoints = plan.flatMap((p) => p.points);
  let geometry: UrbanGeometry | null = null;
  try {
    geometry = await urbanGeometryService.load(allPoints, S.shadowRadiusM, {
      signal,
      onProgress: (done, total) => report("buildings", done, total),
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    notices.add("buildings_unavailable");
  }
  report("buildings", 1, 1, true);

  /* 5 · Confort (solo en el modo equilibrado) */
  let comfortReady = false;
  if (req.preference !== "maximum_sun") {
    comfortReady = await comfortService.load();
    if (!comfortReady) notices.add("comfort_unavailable");
  }

  /* 6 · Sol, nubes y sombra: una serie meteorológica por lugar, una sombra por punto */
  const drafts: ResultDraft[] = [];
  let spotsAnalyzed = 0;
  let spotsKnown = 0;

  for (let pi = 0; pi < plan.length; pi++) {
    await pacer.maybeYield(signal);
    report("sun", pi, plan.length);
    const { c, points } = plan[pi];
    const place = c.place;
    const series = sunlightService.buildWeatherSeries(place.latitude, place.longitude, times, now);

    const spots: SpotAnalysis[] = [];
    let best: SpotAnalysis | null = null;
    let deferred: { lng: number; lat: number; shadow: ShadowEvaluator } | null = null;

    for (const p of points) {
      await pacer.maybeYield(signal);
      const known = geometry !== null && geometry.known(p.lng, p.lat);
      const shadow = createShadowEvaluator({
        latitude: p.lat,
        longitude: p.lng,
        buildings: known && geometry ? geometry.buildings : null,
      });
      spotsAnalyzed++;
      if (shadow.buildingsKnown) spotsKnown++;

      // Un punto dentro de la huella de un edificio no es un lugar donde sentarse (salvo un mirador,
      // que puede estar en una azotea): se aparta como último recurso.
      if (shadow.ownHeight > 0 && place.type !== "viewpoint") {
        if (!deferred) deferred = { lng: p.lng, lat: p.lat, shadow };
        continue;
      }
      const a = analyzeSpot(p.lng, p.lat, shadow, series, req);
      if (!a) continue;
      spots.push(a);
      if (!best || betterSpot(a.metrics, best.metrics)) best = a;
    }

    if (!best && deferred) {
      const a = analyzeSpot(deferred.lng, deferred.lat, deferred.shadow, series, req);
      if (a) {
        spots.push(a);
        best = a;
      }
    }
    if (!best || best.metrics.scoreSum <= 0) continue;

    const m = best.metrics;

    // Fracción de la zona con sol comparable al mejor punto (solo con puntos suficientes).
    const areaSunShare =
      spots.length >= 3 && m.scoreSum > 0
        ? spots.filter((s) => s.metrics.scoreSum >= 0.6 * m.scoreSum).length / spots.length
        : null;

    const spot = { lng: best.lng, lat: best.lat };
    const walking: WalkingEstimate | undefined = req.origin
      ? routeService.estimate(req.origin, spot)
      : undefined;
    const comfort: ComfortSummary | undefined = comfortReady
      ? (comfortService.summarize(m.start, m.end) ?? undefined)
      : undefined;

    const windows = groupWindows(best.samples, req.stepMs, req.endTime);
    const bestWindow =
      m.strongStart !== null && m.strongEnd !== null ? { start: m.strongStart, end: m.strongEnd } : null;

    const scoreDetail = calculateSunScore({
      requestedMinutes: D,
      sunMinutes: m.sunMinutes,
      longestSunRunMinutes: m.longestSunRunMinutes,
      meanScore: m.meanScore,
      urbanShadowMinutes: m.urbanShadowMinutes,
      meanCloudInfluence: m.meanCloudInfluence,
      areaSunShare,
      preference: req.preference,
      avoidClouds: req.avoidClouds ?? false,
      preferShadeBreaks: req.preferShadeBreaks ?? false,
      comfort: comfort ?? null,
    });

    const overall = m.meanConfidence;
    const rankingDetail = calculateRankingValue(scoreDetail.score, overall, walking?.durationMinutes);

    drafts.push({
      placeId: place.id,
      place,
      locationType: place.type,
      spot: {
        latitude: spot.lat,
        longitude: spot.lng,
        offsetMeters: distanceMeters(place.longitude, place.latitude, spot.lng, spot.lat),
      },
      score: scoreDetail.score,
      scoreDetail,
      rankingValue: rankingDetail.value,
      rankingDetail,
      requestedMinutes: D,
      sunlightMinutes: m.sunMinutes,
      partialMinutes: m.partialMinutes,
      urbanShadowMinutes: m.urbanShadowMinutes,
      cloudMinutes: m.cloudMinutes,
      uncertainMinutes: m.uncertainMinutes,
      longestSunRunMinutes: m.longestSunRunMinutes,
      directSunPercentage: Math.round((100 * m.sunMinutes) / D),
      cloudInfluence: m.meanCloudInfluence,
      meanElevationDeg: m.meanElevationDeg,
      areaSunShare,
      sampledPoints: spots.length,
      confidence: overall,
      confidenceDetail: {
        geometry: m.meanGeometryConfidence,
        weather: m.meanWeatherConfidence,
        overall,
      },
      origin: dominantOrigin(best.samples, m.startIndex, m.endIndex),
      searchWindow: { start: m.start, end: m.end },
      bestWindow,
      windows,
      narrative: buildNarrative(windows, bestWindow),
      walking,
      comfort,
      meetsRequest: m.sunMinutes >= S.requestTolerance * D,
      weatherAvailable: series.weatherAvailable,
      buildingsKnown: best.buildingsKnown,
    });
  }
  report("sun", plan.length, plan.length, true);

  /* 7 · Ranking */
  report("ranking", 0, 1, true);
  const known = spotsAnalyzed > 0 ? spotsKnown / spotsAnalyzed : 1;
  if (geometry && known < S.buildingsPartialBelow) notices.add("buildings_partial");

  const useful = drafts
    .filter((d) => d.sunlightMinutes >= S.minUsefulSunFraction * D)
    .sort(compareResults);
  const full = useful.filter((d) => d.meetsRequest);

  const pick = (list: ResultDraft[]): SunSearchResult[] => {
    const chosen: ResultDraft[] = [];
    for (const d of list) {
      if (chosen.length >= req.limit) break;
      const tooClose = chosen.some(
        (c) =>
          c.placeId === d.placeId ||
          distanceMeters(c.spot.longitude, c.spot.latitude, d.spot.longitude, d.spot.latitude) <
            S.minSeparationM
      );
      if (!tooClose) chosen.push(d);
    }
    return chosen.map((d, i) => ({
      ...d,
      rank: i + 1,
      reasons: buildReasons(d, chosen, req.preference),
    }));
  };

  const results = pick(full);
  const bestAvailable = results.length === 0 ? pick(useful) : [];
  check(signal);
  report("ranking", 1, 1, true);

  const meta = {
    candidates: candidates.length,
    analyzedSpots: spotsAnalyzed,
    buildingsKnownFraction: known,
    bestAvailableMinutes: bestAvailable.length ? bestAvailable[0].sunlightMinutes : 0,
  };

  if (results.length > 0) {
    const partial: SearchNoticeCode[] = [
      "weather_stale",
      "weather_partial",
      "buildings_partial",
      "buildings_unavailable",
      "places_stale",
      "beyond_forecast",
    ];
    const status = notices.has("weather_unavailable")
      ? "weather_unavailable"
      : partial.some((n) => notices.has(n))
        ? "partial_data"
        : "results";
    return outcome(status, { results, ...meta });
  }

  // Sin resultados completos: se explica por qué (noche, nubes o sombra) y se ofrece lo mejor.
  let reason: NoSunReason = "none";
  if (useful.length === 0) {
    const open = ceiling ? ceiling.sunMinutes + 0.5 * ceiling.partialMinutes : 0;
    reason = open < S.minUsefulSunFraction * D ? "clouds" : "shade";
  }
  return outcome("no_results", { bestAvailable, noSunReason: reason, ...meta });
}

export const sunSearchService = {
  findBestSunPlaces,
  findBestSunWindow,
  normalizeRequest,
  selectCandidates,
  allowedTypes,
  buildTimes,
};
