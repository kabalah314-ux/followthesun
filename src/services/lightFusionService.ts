import {
  BARCELONA,
  CURRENT_OBSERVATION_WINDOW_MINUTES as WINDOW_MIN,
  LIGHT_MODEL_CONFIG as C,
  SATELLITE_CONFIG,
} from "../config";
import { clamp, smoothstep } from "../lib/coordinates";
import { calculateSourceWeight, type SampleOrigin, type SourceWeight } from "../lib/sourceWeights";
import type {
  CloudCoverage,
  ClearSkyRadiation,
  DataOrigin,
  FusionSourceReport,
  FusionWinner,
  LightFusion,
  LightSourceMode,
  LightSourceSummary,
  SatelliteRadiation,
  SolarPosition,
  SunlightOrigin,
  TimeZones,
} from "../types";
import { cloudService, type CloudFieldSample } from "./cloudService";
import { radiationService } from "./radiationService";
import { satelliteService, type SatelliteFieldSample } from "./satelliteService";
import { solarService } from "./solarService";
import { startOfZoneDay } from "./timeService";

/**
 * lightFusionService — fusiona observación satelital y modelo meteorológico en UNA estimación de la
 * transmisión del haz solar directo (0-1). Separado de `sunlightService` a propósito:
 *
 *   solarService     → dónde está el sol
 *   shadowService    → qué obstáculos físicos lo tapan
 *   weatherService   → previsión (modelo)               ┐
 *   satelliteService → observación                      ┘→ lightFusionService → mejor estimación
 *   sunlightService  → combina todo en la luz efectiva
 *
 * NO es un promedio simple. Cada fuente recibe un peso de calidad (`calculateSourceWeight`) y:
 *   1. el reparto se ACENTÚA hacia la fuente más fiable (razón de cuotas elevada a `sharpening`);
 *   2. dentro de la ventana de PRESENTE (`CURRENT_OBSERVATION_WINDOW_MINUTES` desde la última
 *      observación) la observación manda: el modelo aporta como máximo `modelMaxShareInWindow`
 *      (continuidad temporal). Pasada la ventana la prioridad se desvanece y vuelve a mandar la
 *      calidad relativa (la persistencia del satélite pierde peso con el tiempo);
 *   3. si discrepan (`conflictThreshold`) NO se oculta: se marca el conflicto y baja la confianza.
 *
 * La resolución espacial manda en la confianza: la geometría urbana es de edificio, pero la
 * meteorología (observada o prevista) es de varios kilómetros.
 */

export { calculateSourceWeight };

/* -------------------------------------------------------------------------- */
/*  Conflicto                                                                  */
/* -------------------------------------------------------------------------- */

export interface WeatherConflict {
  conflict: boolean;
  /** |satélite − modelo| en transmisión (0-1). */
  magnitude: number;
  kind: "satellite_darker" | "satellite_brighter" | null;
}

/**
 * Detecta discrepancia entre observación y modelo. Ejemplo: el modelo dice "sol directo alto"
 * (0,9) y el satélite "radiación directa baja" (0,1) → conflicto.
 */
export function detectWeatherConflict(
  satelliteTransmission: number | null,
  modelTransmissionValue: number | null,
  threshold: number = C.FUSION.conflictThreshold
): WeatherConflict {
  if (satelliteTransmission === null || modelTransmissionValue === null) {
    return { conflict: false, magnitude: 0, kind: null };
  }
  const diff = satelliteTransmission - modelTransmissionValue;
  const magnitude = Math.abs(diff);
  const conflict = magnitude > threshold;
  return {
    conflict,
    magnitude,
    kind: conflict ? (diff < 0 ? "satellite_darker" : "satellite_brighter") : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Ventana de presente y reparto                                              */
/* -------------------------------------------------------------------------- */

export interface ObservationPriority {
  /** Minutos desde la última observación (negativo: el instante es anterior a ella). */
  minutesSinceObservation: number | null;
  inWindow: boolean;
  /** 1 dentro de la ventana, se desvanece a 0 en `priorityFadeMinutes`. */
  priority: number;
}

export function observationPriority(time: number, lastObservationAt: number | null): ObservationPriority {
  if (lastObservationAt === null) {
    return { minutesSinceObservation: null, inWindow: false, priority: 0 };
  }
  const lead = (time - lastObservationAt) / 60_000;
  return {
    minutesSinceObservation: lead,
    inWindow: lead <= WINDOW_MIN,
    priority: 1 - smoothstep(WINDOW_MIN, WINDOW_MIN + C.FUSION.priorityFadeMinutes, lead),
  };
}

/** Cuota del satélite (0-1) a partir de los pesos de calidad y la prioridad de presente. */
export function satelliteShare(weightSatellite: number, weightModel: number, priority: number): number {
  const total = weightSatellite + weightModel;
  if (total <= 0) return 0.5;
  const p = C.FUSION.sharpening;
  const natural = weightSatellite / total;
  const a = Math.pow(natural, p);
  const b = Math.pow(1 - natural, p);
  const sharp = a / (a + b);
  return Math.max(sharp, priority * (1 - C.FUSION.modelMaxShareInWindow));
}

/* -------------------------------------------------------------------------- */
/*  Fusión en un punto                                                         */
/* -------------------------------------------------------------------------- */

export interface FusionInputs {
  time: number;
  now: number;
  sun: SolarPosition;
  satellite: SatelliteRadiation | null;
  model: CloudCoverage | null;
  /** Instante de la última observación satelital real (ms). */
  lastObservationAt: number | null;
}

const satSampleOrigin = (o: DataOrigin): SampleOrigin =>
  o === "observed" ? "observed" : o === "interpolated" ? "interpolated" : "persistence";

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  observed: "observada",
  forecast: "previsión",
  interpolated: "interpolada entre observaciones",
  estimated: "persistencia de la última observación",
  stale: "observación antigua",
  unavailable: "sin datos",
};

function emptyFusion(decision: string[]): LightFusion {
  return {
    available: false,
    directTransmission: null,
    cloudInfluence: 0,
    origin: null,
    dataOrigin: "unavailable",
    winner: "none",
    satelliteShare: 0,
    conflict: false,
    conflictMagnitude: 0,
    satellite: null,
    model: null,
    confidence: { satellite: 0, model: 0, weather: 0 },
    inCurrentWindow: false,
    minutesSinceObservation: null,
    decision,
  };
}

export function fuseLight(i: FusionInputs): LightFusion {
  const decision: string[] = [];
  const elev = i.sun.altitudeDeg;
  decision.push(
    `Sol: elevación ${elev.toFixed(1)}° · azimut ${i.sun.azimuthDeg.toFixed(0)}°`
  );
  if (elev < C.MIN_SUN_ELEVATION_DEG) {
    decision.push("Noche: no hay haz directo que fusionar.");
    return emptyFusion(decision);
  }

  const { minutesSinceObservation, inWindow, priority } = observationPriority(i.time, i.lastObservationAt);

  /* ------------------------------ satélite ------------------------------ */
  const sat = i.satellite;
  const ts = sat && sat.directTransmission !== null ? sat.directTransmission : null;
  let wS: SourceWeight | null = null;
  if (sat && ts !== null) {
    wS = calculateSourceWeight({
      kind: "satellite",
      available: true,
      leadMinutes: sat.leadMinutes,
      sampleOrigin: satSampleOrigin(sat.origin),
      ageMinutes: Math.max(0, (i.now - sat.sampleTime.getTime()) / 60_000),
      spatialResolutionKm: sat.resolutionKm,
      temporalResolutionMinutes: sat.temporalResolutionMinutes,
      agreement: sat.consistency ?? NaN,
      coverage: sat.spatialCoverage,
      solarElevationDeg: elev,
    });
  }
  const satUsable = wS !== null && wS.weight >= C.SOURCE_QUALITY.minUsableWeight;

  /* ------------------------------ modelo ------------------------------ */
  const mod = i.model;
  const tm = mod ? mod.directBeamTransmission : null;
  let wM: SourceWeight | null = null;
  if (mod && tm !== null) {
    const agreementParts = [mod.modelAgreement, mod.signalConsistency].filter(
      (v): v is number => v !== undefined && Number.isFinite(v)
    );
    wM = calculateSourceWeight({
      kind: "model",
      available: true,
      leadMinutes: (i.time - i.now) / 60_000,
      sampleOrigin: "forecast",
      ageMinutes: Math.max(0, (i.now - mod.updatedAt.getTime()) / 60_000),
      spatialResolutionKm: mod.resolutionKm,
      temporalResolutionMinutes: 60,
      agreement: agreementParts.length ? Math.min(...agreementParts) : NaN,
      coverage: mod.spatialCoverage,
      solarElevationDeg: elev,
    });
  }
  const modUsable = wM !== null && wM.weight >= C.SOURCE_QUALITY.minUsableWeight;

  const report = (
    transmission: number | null,
    w: SourceWeight | null,
    origin: DataOrigin,
    cap: number
  ): FusionSourceReport | null =>
    w === null
      ? null
      : {
          transmission,
          weight: w.weight,
          origin,
          factors: w.factors,
          explanation: w.explanation,
          confidence: clamp(w.weight, 0, cap),
        };

  const satReport = report(ts, wS, sat?.origin ?? "unavailable", C.CONFIDENCE.maxObserved);
  const modReport = report(tm, wM, "forecast", C.CONFIDENCE.maxForecast);

  if (sat && ts !== null && wS) {
    decision.push(
      `Satélite: transmisión directa ${ts.toFixed(2)} (${ORIGIN_LABEL[sat.origin]}, peso ${wS.weight.toFixed(2)}; ${wS.explanation})`
    );
  } else {
    decision.push(
      sat
        ? "Satélite: hay muestra pero no se puede calcular la transmisión directa (sol bajo)."
        : "Satélite: sin observación aplicable."
    );
  }
  if (mod && tm !== null && wM) {
    decision.push(
      `Modelo: transmisión directa ${tm.toFixed(2)} (previsión, peso ${wM.weight.toFixed(2)}; ${wM.explanation})`
    );
  } else {
    decision.push("Modelo: sin datos.");
  }
  decision.push(
    minutesSinceObservation === null
      ? "Ventana de presente: sin observaciones."
      : `Ventana de presente: ${inWindow ? "dentro" : "fuera"} (${minutesSinceObservation.toFixed(0)} min desde la última observación; ventana ${WINDOW_MIN} min)`
  );

  /* ------------------------------ sin fuentes ------------------------------ */
  if (!satUsable && !modUsable) {
    decision.push("Ninguna fuente alcanza el peso mínimo: sin estimación (geometría solar + sombra).");
    return { ...emptyFusion(decision), satellite: satReport, model: modReport };
  }

  /* ------------------------------ fusión ------------------------------ */
  const wSat = satUsable ? (wS as SourceWeight).weight : 0;
  const wMod = modUsable ? (wM as SourceWeight).weight : 0;
  const tSat = satUsable ? (ts as number) : null;
  const tMod = modUsable ? (tm as number) : null;

  let share: number;
  let T: number;
  if (tSat !== null && tMod !== null) {
    share = satelliteShare(wSat, wMod, priority);
    T = share * tSat + (1 - share) * tMod;
  } else if (tSat !== null) {
    share = 1;
    T = tSat;
  } else {
    share = 0;
    T = tMod as number;
  }
  T = clamp(T, 0, 1);

  const cf = detectWeatherConflict(tSat, tMod);
  const agree = tSat !== null && tMod !== null ? 1 - clamp(cf.magnitude / (2 * C.FUSION.conflictThreshold), 0, 1) : 0;

  /* ------------------------------ confianza ------------------------------ */
  let weatherConf: number;
  if (tSat !== null && tMod !== null) {
    const qWin = Math.max(wSat, wMod);
    const qOther = Math.min(wSat, wMod);
    // Evidencias independientes: la secundaria solo suma en la medida en que coincide.
    weatherConf = 1 - (1 - qWin) * (1 - qOther * agree);
    if (cf.conflict) weatherConf *= 1 - C.FUSION.conflictConfidencePenalty;
  } else {
    weatherConf = tSat !== null ? wSat : wMod;
  }
  const cap = share >= 0.5 ? C.CONFIDENCE.maxObserved : C.CONFIDENCE.maxForecast;
  weatherConf = clamp(weatherConf, 0.03, cap);

  /* ------------------------------ ganador y origen ------------------------------ */
  const winner: FusionWinner =
    tSat !== null && tMod === null
      ? "satellite"
      : tSat === null
        ? "model"
        : share >= C.FUSION.winnerShare
          ? "satellite"
          : share <= 1 - C.FUSION.winnerShare
            ? "model"
            : "blend";

  let origin: SunlightOrigin;
  let dataOrigin: DataOrigin;
  if (cf.conflict && winner === "blend") {
    origin = "estimated";
    dataOrigin = "estimated";
  } else if (share >= 0.5 && sat) {
    origin = sat.origin === "stale" ? "estimated" : "observed";
    dataOrigin = sat.origin;
  } else {
    origin = "forecast";
    dataOrigin = "forecast";
  }

  /* ------------------------------ registro de decisión ------------------------------ */
  if (tSat !== null && tMod !== null) {
    const level = cf.magnitude < 0.15 ? "alto" : cf.magnitude < C.FUSION.conflictThreshold ? "medio" : "bajo";
    decision.push(`Acuerdo satélite ⟷ modelo: ${level} (|Δ| = ${cf.magnitude.toFixed(2)})`);
    decision.push(
      `Cuota del satélite: ${(share * 100).toFixed(0)} % (peso natural ${(
        (wSat / (wSat + wMod)) *
        100
      ).toFixed(0)} %, prioridad de presente ${(priority * 100).toFixed(0)} %)`
    );
  }
  if (winner === "satellite") {
    decision.push(
      inWindow
        ? "Gana el satélite: observación reciente dentro de la ventana de presente. El modelo aporta continuidad temporal."
        : "Gana el satélite: su calidad relativa supera a la del modelo."
    );
  } else if (winner === "model") {
    decision.push(
      tSat === null
        ? "Gana el modelo: no hay observación utilizable."
        : "Gana el modelo: la observación está demasiado lejos en el tiempo (o su calidad es baja)."
    );
  } else {
    decision.push("Sin ganador claro: se combinan ambas fuentes.");
  }
  if (cf.conflict) {
    decision.push(
      `CONFLICTO: ${
        cf.kind === "satellite_darker" ? "el satélite ve menos sol directo que el modelo" : "el satélite ve más sol directo que el modelo"
      } (|Δ| ${cf.magnitude.toFixed(2)} > ${C.FUSION.conflictThreshold}). Confianza reducida.`
    );
  }
  decision.push(`Resultado: transmisión directa ${T.toFixed(2)} · confianza meteorológica ${weatherConf.toFixed(2)}`);

  return {
    available: true,
    directTransmission: T,
    cloudInfluence: clamp(1 - T, 0, 1),
    origin,
    dataOrigin,
    winner,
    satelliteShare: share,
    conflict: cf.conflict,
    conflictMagnitude: cf.magnitude,
    satellite: satReport,
    model: modReport,
    confidence: {
      satellite: satReport ? satReport.confidence : 0,
      model: modReport ? modReport.confidence : 0,
      weather: weatherConf,
    },
    inCurrentWindow: inWindow,
    minutesSinceObservation,
    decision,
  };
}

/* -------------------------------------------------------------------------- */
/*  Punto, campo, resumen de fuente y zonas de tiempo                          */
/* -------------------------------------------------------------------------- */

export interface PointLight {
  fusion: LightFusion;
  model: CloudCoverage | null;
  satellite: SatelliteRadiation | null;
}

export interface LightFieldSample extends CloudFieldSample {}

export interface LightField {
  available: boolean;
  origin: DataOrigin;
  sample(lng: number, lat: number, out: LightFieldSample): boolean;
}

const CENTER = { lat: BARCELONA.lat, lng: BARCELONA.lng };

class LightFusionService {
  /* ------------------------------ suscripción ------------------------------ */

  /** Se avisa cuando cambian los datos del modelo O los del satélite. */
  subscribe = (listener: () => void) => {
    const a = cloudService.subscribe(listener);
    const b = satelliteService.subscribe(listener);
    return () => {
      a();
      b();
    };
  };

  getVersion = () => cloudService.getVersion() + satelliteService.getVersion();

  /* ------------------------------ punto ------------------------------ */

  /**
   * Muestreador de luz para un punto fijo: consulta satélite y modelo de la caché en memoria y los
   * fusiona. No hace peticiones de red.
   */
  pointSampler(
    latitude: number,
    longitude: number
  ): (t: number, sun: SolarPosition, now?: number) => PointLight {
    const sat = satelliteService.pointSampler(latitude, longitude);
    const cloud = cloudService.pointSampler(latitude, longitude);
    const lastObs = satelliteService.getLastObservationAt();
    return (t, sun, now = Date.now()) => {
      const satellite = sat(t, now);
      const model = cloud(t, now);
      const fusion = fuseLight({ time: t, now, sun, satellite, model, lastObservationAt: lastObs });
      return { fusion, model, satellite };
    };
  }

  /* ------------------------------ campo (capa visual) ------------------------------ */

  private fieldMemo: { key: string; field: LightField } | null = null;

  /**
   * Campo de transmisión del haz directo sobre toda la rejilla en un instante. `mode` permite ver
   * solo el modelo o solo el satélite (depuración); por defecto, la fusión.
   */
  fieldAt(t: number, now: number = Date.now(), mode: LightSourceMode = "fused"): LightField {
    const key = `${t}|${Math.floor(now / 60_000)}|${mode}|${this.getVersion()}`;
    if (this.fieldMemo && this.fieldMemo.key === key) return this.fieldMemo.field;

    const sun = solarService.getPosition(t, CENTER.lat, CENTER.lng);
    const modelField = mode === "satellite" ? null : cloudService.fieldAt(t, now);
    const satField = mode === "model" ? null : satelliteService.fieldAt(t);
    const useModel = !!modelField && modelField.available;
    const useSat = !!satField && satField.available;

    let field: LightField;
    if (!useModel && !useSat) {
      field = { available: false, origin: "unavailable", sample: () => false };
    } else {
      const lastObs = satelliteService.getLastObservationAt();
      const { priority } = observationPriority(t, lastObs);

      const wS = useSat && satField?.reference
        ? calculateSourceWeight({
            kind: "satellite",
            available: true,
            leadMinutes: satField.reference.leadMinutes,
            sampleOrigin: satSampleOrigin(satField.reference.origin),
            ageMinutes: Math.max(0, (now - satField.reference.sampleTime) / 60_000),
            spatialResolutionKm: satField.reference.resolutionKm,
            temporalResolutionMinutes: satField.reference.temporalResolutionMinutes,
            agreement: NaN,
            coverage: 1,
            solarElevationDeg: sun.altitudeDeg,
          }).weight
        : 0;
      const wM = useModel && modelField?.reference
        ? calculateSourceWeight({
            kind: "model",
            available: true,
            leadMinutes: modelField.reference.leadMinutes,
            sampleOrigin: "forecast",
            ageMinutes: modelField.reference.ageMinutes,
            spatialResolutionKm: modelField.reference.resolutionKm,
            temporalResolutionMinutes: modelField.reference.temporalResolutionMinutes,
            agreement: NaN,
            coverage: 1,
            solarElevationDeg: sun.altitudeDeg,
          }).weight
        : 0;

      const share = satelliteShare(wS, wM, priority);
      const satOrigin = satField?.reference?.origin ?? "unavailable";
      const origin: DataOrigin =
        useSat && (!useModel || share >= 0.5) ? satOrigin : useModel ? "forecast" : "unavailable";

      const satOut: SatelliteFieldSample = { tDir: NaN, kt: NaN };
      const modOut: CloudFieldSample = { cloudCover: 0, transmission: 1, blockage: 0 };

      field = {
        available: true,
        origin,
        sample(lng, lat, out) {
          const hasS =
            useSat && satField!.sample(lng, lat, satOut) && Number.isFinite(satOut.tDir) && wS >= C.SOURCE_QUALITY.minUsableWeight;
          const hasM = useModel && modelField!.sample(lng, lat, modOut) && wM >= C.SOURCE_QUALITY.minUsableWeight;
          let T: number;
          if (hasS && hasM) T = share * satOut.tDir + (1 - share) * modOut.transmission;
          else if (hasS) T = satOut.tDir;
          else if (hasM) T = modOut.transmission;
          else {
            out.cloudCover = 0;
            out.transmission = 1;
            out.blockage = 0;
            return false;
          }
          T = clamp(T, 0, 1);
          out.cloudCover = hasM ? modOut.cloudCover : 1 - T;
          out.transmission = T;
          out.blockage = 1 - T;
          return true;
        },
      };
    }
    this.fieldMemo = { key, field };
    return field;
  }

  /* ------------------------------ resumen para la interfaz ------------------------------ */

  /**
   * Qué fuente respalda un instante, a nivel de ciudad. La interfaz lo muestra como
   * "Observado · hace 22 min" o "Previsión · actualizada hace 8 min". Nunca "en directo".
   */
  getSourceSummary(t: number, now: number = Date.now()): LightSourceSummary {
    const sat = satelliteService.getStatus(now);
    const mod = cloudService.getStatus(now);
    const lastObs = satelliteService.getLastObservationAt();
    const meta = satelliteService.getMeta();

    const satInfo: LightSourceSummary["satellite"] =
      meta && lastObs !== null
        ? {
            source: meta.source,
            resolutionKm: meta.resolutionKm,
            temporalResolutionMinutes: meta.temporalResolutionMinutes,
            latencyMinutes: sat.latencyMinutes,
            lastObservationAt: lastObs,
          }
        : null;
    const modInfo: LightSourceSummary["model"] =
      mod.state !== "loading" && mod.state !== "unavailable"
        ? { source: mod.source ?? "modelo", resolutionKm: mod.resolutionKm, updatedAt: mod.updatedAt }
        : null;

    const satHasData = lastObs !== null && sat.state !== "unavailable" && sat.state !== "loading";
    const inObserved = satHasData && t <= (lastObs as number) + 90_000;
    const inWindow = satHasData && t <= (lastObs as number) + WINDOW_MIN * 60_000;
    const lastAgeMin = lastObs !== null ? (now - lastObs) / 60_000 : Infinity;

    if (satHasData && (inObserved || inWindow)) {
      // Para un instante pasado la edad es la de ESA observación; para el presente, la de la última.
      const observationTime = Math.min(t, lastObs as number);
      const stale = !inObserved && lastAgeMin > SATELLITE_CONFIG.staleMinutes;
      return {
        kind: stale ? "stale" : "observed",
        ageMs: Math.max(0, now - observationTime),
        satellite: satInfo,
        model: modInfo,
      };
    }
    if (modInfo) {
      return { kind: "forecast", ageMs: mod.ageMs, satellite: satInfo, model: modInfo };
    }
    if (satHasData && lastAgeMin <= SATELLITE_CONFIG.maxUsefulPersistenceMinutes) {
      return { kind: "estimated", ageMs: Math.max(0, now - (lastObs as number)), satellite: satInfo, model: null };
    }
    const loading = mod.state === "loading" || sat.state === "loading";
    return { kind: loading ? "loading" : "unavailable", ageMs: null, satellite: satInfo, model: modInfo };
  }

  /** Zonas de la línea de tiempo: observado · presente · previsión. */
  getTimeZones(): TimeZones {
    const lastObs = satelliteService.getLastObservationAt();
    if (lastObs === null) return { observedUntil: null, presentUntil: null };
    return { observedUntil: lastObs, presentUntil: lastObs + WINDOW_MIN * 60_000 };
  }

  /* ------------------------------ depuración ------------------------------ */

  debugReport(latitude: number, longitude: number, t: number, now: number = Date.now()): DebugReport {
    const sun = solarService.getPosition(t, latitude, longitude);
    const satellite = satelliteService.getRadiationAtPoint(latitude, longitude, t, now);
    const model = cloudService.getCloudCoverageAtPoint(latitude, longitude, t, now);
    const lastObservationAt = satelliteService.getLastObservationAt();
    const fusion = fuseLight({ time: t, now, sun, satellite, model, lastObservationAt });
    const clearSky = radiationService.getClearSkyRadiation(latitude, longitude, t);

    // Serie del día completo: modelo vs satélite vs fusión (calibración visual).
    const times = solarService.getSunTimes(startOfZoneDay(t), latitude, longitude);
    const satS = satelliteService.pointSampler(latitude, longitude);
    const modS = cloudService.pointSampler(latitude, longitude);
    const series: DebugSeriesPoint[] = [];
    const step = 10 * 60_000;
    for (let tt = times.sunrise; tt <= times.sunset; tt += step) {
      const pos = solarService.getPosition(tt, latitude, longitude);
      const s = satS(tt, now);
      const m = modS(tt, now);
      const f = fuseLight({ time: tt, now, sun: pos, satellite: s, model: m, lastObservationAt });
      series.push({
        t: tt,
        model: m ? m.directBeamTransmission : null,
        satellite: s && s.origin !== "stale" ? s.directTransmission : null,
        satelliteOrigin: s ? s.origin : null,
        fused: f.directTransmission,
      });
    }

    return { time: t, now, latitude, longitude, sun, satellite, model, clearSky, fusion, series, lastObservationAt };
  }
}

export interface DebugSeriesPoint {
  t: number;
  model: number | null;
  satellite: number | null;
  satelliteOrigin: DataOrigin | null;
  fused: number | null;
}

export interface DebugReport {
  time: number;
  now: number;
  latitude: number;
  longitude: number;
  sun: SolarPosition;
  satellite: SatelliteRadiation | null;
  model: CloudCoverage | null;
  clearSky: ClearSkyRadiation;
  fusion: LightFusion;
  series: DebugSeriesPoint[];
  lastObservationAt: number | null;
}

export const lightFusionService = new LightFusionService();
