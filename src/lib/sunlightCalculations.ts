import { LIGHT_MODEL_CONFIG as C } from "../config";
import type { DataQuality } from "../types";
import { clamp, smoothstep } from "./coordinates";
import { getSunPosition } from "./solarCalculations";

/**
 * Matemática pura de la luz solar (sin React, sin red, sin mapa).
 *
 * IMPORTANTE — nubosidad ≠ radiación solar. La cobertura de nubes es una fracción de cielo; no dice
 * cuánta luz directa llega al suelo: una capa de cirros al 100 % deja pasar bastante sol, mientras
 * que un 40 % de estratos bajos puede tapar el disco solar. Por eso las nubes se convierten en una
 * TRANSMISIÓN del haz directo (ver `radiationCalculations.ts` y `lightFusionService.ts`).
 */

/** Opacidad de cada capa para el haz directo. Configurable en `LIGHT_MODEL_CONFIG`. */
export const CLOUD_OPACITY = C.CLOUD_OPACITY;

/** Umbrales de confianza para etiquetar "alta" / "media" / "baja". */
export const CONFIDENCE_THRESHOLDS = { high: C.CONFIDENCE.high, medium: C.CONFIDENCE.medium };

export type ConfidenceLevel = "high" | "medium" | "low";

export const confidenceLevel = (c: number): ConfidenceLevel =>
  c >= CONFIDENCE_THRESHOLDS.high ? "high" : c >= CONFIDENCE_THRESHOLDS.medium ? "medium" : "low";

export type CloudInfluenceLevel = "low" | "moderate" | "high";

export const influenceLevel = (cloudInfluence: number): CloudInfluenceLevel =>
  cloudInfluence < C.CLOUD_INFLUENCE_LEVELS.low
    ? "low"
    : cloudInfluence < C.CLOUD_INFLUENCE_LEVELS.high
      ? "moderate"
      : "high";

/**
 * Probabilidad de que la línea de visión al sol esté libre según las capas (solapamiento
 * aleatorio). Sin capas, se usa la cobertura total como fracción de cielo tapado. NaN si no hay datos.
 */
export function layerClearProbability(cloud: number, low: number, mid: number, high: number): number {
  if (Number.isFinite(low) && Number.isFinite(mid) && Number.isFinite(high)) {
    return (
      (1 - low * CLOUD_OPACITY.low) * (1 - mid * CLOUD_OPACITY.mid) * (1 - high * CLOUD_OPACITY.high)
    );
  }
  return Number.isFinite(cloud) ? 1 - cloud : NaN;
}

/* -------------------------------------------------------------------------- */
/*  Confianza del modelo meteorológico                                         */
/* -------------------------------------------------------------------------- */

export interface WeatherConfidenceInputs {
  /** Confianza base del modelo (AROME 2,5 km > ARPEGE 11 km > demostración). */
  baseModel: number;
  /** Horas entre el instante pedido y ahora (negativo = pasado). */
  leadHours: number;
  /** Edad del dato desde que se consultó. */
  ageMs: number;
  /** 0-1 · acuerdo entre modelos (NaN si solo hay uno). */
  agreement: number;
  /** 0-1 · coherencia entre las señales del modelo (NaN si no se puede comprobar). */
  consistency: number;
  /** 0-1 · soporte espacial de la interpolación. */
  coverage: number;
  /** Celdas de rejilla que el punto queda fuera de la malla. */
  outside: number;
  freshMs: number;
  outdatedMs: number;
  maxStaleMs: number;
}

/**
 * Confianza de una estimación meteorológica. Nunca llega a 1: es salida de un modelo numérico,
 * no una observación, y su resolución (≥ 2,5 km) no resuelve calles.
 */
export function weatherConfidence(i: WeatherConfidenceInputs): number {
  const lead =
    i.leadHours >= 0
      ? clamp(1 - 0.035 * i.leadHours, 0.5, 1)
      : clamp(1 - 0.012 * Math.min(-i.leadHours, 24), 0.7, 1);

  let age: number;
  if (i.ageMs <= i.freshMs) age = 1;
  else if (i.ageMs <= i.outdatedMs) {
    age = 1 - 0.2 * ((i.ageMs - i.freshMs) / (i.outdatedMs - i.freshMs));
  } else {
    age = 0.8 * (1 - 0.7 * clamp((i.ageMs - i.outdatedMs) / (i.maxStaleMs - i.outdatedMs), 0, 1));
  }

  const agreement = Number.isFinite(i.agreement) ? 0.55 + 0.45 * clamp(i.agreement, 0, 1) : 0.9;
  const consistency = Number.isFinite(i.consistency) ? 0.6 + 0.4 * clamp(i.consistency, 0, 1) : 0.92;
  const coverage = clamp(i.coverage, 0, 1) * (1 - 0.5 * smoothstep(0.5, 3, i.outside));

  return clamp(i.baseModel * lead * age * agreement * consistency * coverage, 0.03, 0.9);
}

export function classifyQuality(args: {
  available: boolean;
  ageMs: number;
  confidence: number;
  simulated: boolean;
  outdatedMs: number;
}): DataQuality {
  if (!args.available) return "unavailable";
  if (args.ageMs > args.outdatedMs) return "outdated";
  if (args.simulated) return "estimated";
  return args.confidence >= CONFIDENCE_THRESHOLDS.high ? "high" : "estimated";
}

/* -------------------------------------------------------------------------- */
/*  Puntuación                                                                 */
/* -------------------------------------------------------------------------- */

export type SunlightLevel = "direct" | "mostly" | "partial" | "mostlyCloudy" | "none";

/** 1,00 directo · 0,75 mayormente soleado · 0,50 parcial/incierto · 0,25 mayormente nublado · 0,00 sin sol. */
export function scoreLevel(score: number): SunlightLevel {
  if (score >= 0.875) return "direct";
  if (score >= 0.625) return "mostly";
  if (score >= 0.375) return "partial";
  if (score >= 0.125) return "mostlyCloudy";
  return "none";
}

/** Apertura geométrica del sol: 0 en el horizonte, 1 a partir de `FULL_SUN_OPENING_DEG`. */
export const horizonOpening = (altitudeDeg: number) =>
  smoothstep(C.MIN_SUN_ELEVATION_DEG, C.FULL_SUN_OPENING_DEG, altitudeDeg);

/**
 * Segundos del intervalo [start, end] en los que el sol está lo bastante alto como para que el haz
 * directo supere el umbral de "sol" de la OMM (≈ 6° de elevación con cielo despejado).
 */
export function daylightSecondsInInterval(
  startMs: number,
  endMs: number,
  lat: number,
  lng: number,
  minAltitudeDeg = 6,
  stepMs = 120_000
): number {
  let seconds = 0;
  for (let t = startMs + stepMs / 2; t < endMs; t += stepMs) {
    if (getSunPosition(t, lat, lng).altitudeDeg >= minAltitudeDeg) seconds += stepMs / 1000;
  }
  return seconds;
}
