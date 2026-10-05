import { LIGHT_MODEL_CONFIG as C, SATELLITE_CONFIG, WEATHER_CONFIG } from "../config";
import { clamp, smoothstep } from "./coordinates";

/**
 * Calidad relativa de cada fuente (satélite ⟷ modelo) para estimar el sol directo en UN instante.
 *
 * NO es un promedio 50/50 ni una prioridad fija. Cada fuente recibe un peso 0-1 que es el producto
 * de factores independientes, y la fusión (`lightFusionService`) reparte la cuota según esos pesos:
 *
 *   peso = base × temporal × espacial × resolución temporal × elevación solar × acuerdo × cobertura
 *
 *  base                 observación (1,0) vs previsión (0,7): el satélite mide la cantidad; el
 *                       modelo solo la pronostica. Su directa puede estar derivada del GHI, por eso
 *                       no llega a 1 en todos los factores.
 *  temporal             satélite: muestra real = 1 · interpolada = 0,92 · persistencia = decae con
 *                       vida media de 75 min (+ penalización si la observación es antigua).
 *                       modelo: pierde 3,5 %/h de horizonte y calidad si el dato descargado envejece.
 *  espacial             exp(−resolución/14 km): 2,5 km → 0,84 · 11 km → 0,46.
 *  resolución temporal  10 min = 1 · horaria = 0,88 (hay que interpolar entre horas).
 *  elevación solar      con el sol bajo el cociente radiación/cielo despejado es inestable; el
 *                       satélite es más sensible (suelo 0,3) que el modelo (suelo 0,65).
 *  acuerdo              coherencia interna de la fuente (capas ⟷ radiación; directa ⟷ GHI).
 *  cobertura            soporte espacial de la interpolación.
 */

export type SourceKind = "satellite" | "model";
export type SampleOrigin = "observed" | "interpolated" | "persistence" | "forecast";

export interface SourceWeightInputs {
  kind: SourceKind;
  /** false → peso 0. */
  available: boolean;
  /**
   * Minutos entre la información y el instante pedido:
   *  · satélite: desde la última observación (persistencia)
   *  · modelo: desde ahora (horizonte de previsión; negativo = pasado)
   */
  leadMinutes: number;
  sampleOrigin: SampleOrigin;
  /** Minutos desde que se obtuvo el dato (observación o descarga). */
  ageMinutes: number;
  spatialResolutionKm: number;
  temporalResolutionMinutes: number;
  /** 0-1 · coherencia interna. NaN si se desconoce. */
  agreement: number;
  /** 0-1 · soporte espacial de la interpolación. */
  coverage: number;
  solarElevationDeg: number;
}

export interface SourceWeight {
  weight: number;
  factors: Record<string, number>;
  explanation: string;
}

const LABELS: Record<string, string> = {
  temporal: "antigüedad / horizonte",
  spatial: "resolución espacial",
  temporalResolution: "resolución temporal",
  elevation: "sol bajo",
  agreement: "coherencia interna",
  coverage: "cobertura espacial",
};

export function calculateSourceWeight(i: SourceWeightInputs): SourceWeight {
  if (!i.available) {
    return { weight: 0, factors: { availability: 0 }, explanation: "sin datos" };
  }
  const Q = C.SOURCE_QUALITY;
  const isSat = i.kind === "satellite";

  let temporal: number;
  if (isSat) {
    if (i.sampleOrigin === "observed") temporal = 1;
    else if (i.sampleOrigin === "interpolated") temporal = Q.satelliteInterpolated;
    else {
      const lead = Math.max(0, i.leadMinutes);
      temporal = Q.persistenceStartFactor * Math.pow(0.5, lead / Q.persistenceHalfLifeMinutes);
      if (lead > SATELLITE_CONFIG.staleMinutes) temporal *= Q.satelliteStalePenalty;
    }
  } else {
    const hours = Math.max(0, i.leadMinutes) / 60;
    const horizon = clamp(1 - Q.modelDecayPerHour * hours, Q.modelMinHorizonFactor, 1);
    const freshMin = WEATHER_CONFIG.freshMs / 60_000;
    const outdatedMin = WEATHER_CONFIG.outdatedMs / 60_000;
    const age = 1 - 0.5 * smoothstep(freshMin, outdatedMin, i.ageMinutes);
    temporal = horizon * age;
  }

  const spatial = clamp(Math.exp(-i.spatialResolutionKm / Q.spatialScaleKm), Q.spatialMinFactor, 1);
  const temporalResolution =
    1 - Q.temporalPenaltyAtHourly * clamp((i.temporalResolutionMinutes - 10) / 50, 0, 1);

  const e = isSat ? Q.elevation.satellite : Q.elevation.model;
  const elevation = e.floor + (1 - e.floor) * smoothstep(e.from, e.to, i.solarElevationDeg);

  const agreement = Number.isFinite(i.agreement)
    ? Q.agreementFloor + (1 - Q.agreementFloor) * clamp(i.agreement, 0, 1)
    : Q.unknownAgreement;
  const coverage = clamp(i.coverage, 0, 1);

  const base = isSat ? Q.satelliteBase : Q.modelBase;
  const weight = clamp(
    base * temporal * spatial * temporalResolution * elevation * agreement * coverage,
    0,
    1
  );

  const factors = { base, temporal, spatial, temporalResolution, elevation, agreement, coverage };
  const weak = Object.entries(factors)
    .filter(([k, v]) => k !== "base" && v < 0.85)
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => `${LABELS[k] ?? k} ${v.toFixed(2)}`);

  return {
    weight,
    factors,
    explanation: weak.length ? `limitado por ${weak.join(", ")}` : "sin limitaciones relevantes",
  };
}
