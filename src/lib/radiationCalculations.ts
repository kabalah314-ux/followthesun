import { LIGHT_MODEL_CONFIG as C } from "../config";
import { clamp } from "./coordinates";
import { getSunPosition } from "./solarCalculations";
import { layerClearProbability } from "./sunlightCalculations";

/**
 * Radiación solar — matemática pura.
 *
 * Qué es OBSERVADO y qué es CALCULADO (esta distinción se mantiene en toda la aplicación):
 *  · OBSERVADO   GHI, directa, difusa y DNI del satélite; GHI de cielo despejado del satélite.
 *  · CALCULADO   el cielo despejado de referencia de este archivo (Meinel para DNI, Haurwitz para
 *                GHI). Sirve para normalizar la radiación observada y obtener una TRANSMISIÓN 0-1.
 *                No es una medida: ±10-15 % según turbidez. Cuando el satélite aporta su propio GHI
 *                de cielo despejado se calibra con él (ver `SatelliteGridModel.calibration`).
 */

const SOLAR_CONSTANT = 1353;

export interface ClearSkyValues {
  ghi: number;
  dni: number;
  dhi: number;
  elevationDeg: number;
}

function dayOfYear(t: number) {
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((t - start) / 86_400_000);
}

/** Cielo despejado calculado: DNI de Meinel + GHI de Haurwitz (W/m²). */
export function calculateClearSkyValues(
  latitude: number,
  longitude: number,
  timestamp: number
): ClearSkyValues {
  const sun = getSunPosition(timestamp, latitude, longitude);
  const sinE = Math.sin(sun.altitude);
  if (sinE <= 0.002) return { ghi: 0, dni: 0, dhi: 0, elevationDeg: sun.altitudeDeg };

  const eps = 1 + 0.033 * Math.cos((2 * Math.PI * (dayOfYear(timestamp) - 3)) / 365);
  // Masa de aire de Kasten & Young (1989).
  const am = 1 / (sinE + 0.50572 * Math.pow(Math.max(sun.altitudeDeg, 0) + 6.07995, -1.6364));
  const dni = SOLAR_CONSTANT * eps * Math.pow(C.CLEAR_SKY.transmittance, Math.pow(am, 0.678));
  const ghi = 1098 * sinE * Math.exp(-0.057 / sinE) * eps;
  return { ghi, dni, dhi: Math.max(0, ghi - dni * sinE), elevationDeg: sun.altitudeDeg };
}

/** DNI observada o modelada / DNI de cielo despejado → 0-1. NaN si el cociente no es fiable (sol bajo). */
export function dniIndex(dni: number, clearDni: number): number {
  if (!Number.isFinite(dni) || !(clearDni >= C.CLEAR_SKY.minClearDniWm2)) return NaN;
  return clamp(dni / clearDni, 0, 1);
}

/** GHI / GHI de cielo despejado. Puede superar 1 por reflejos en nubes; se limita a 1,3. */
export function ghiIndex(ghi: number, clearGhi: number): number {
  if (!Number.isFinite(ghi) || !(clearGhi >= C.CLEAR_SKY.minClearGhiWm2)) return NaN;
  return clamp(ghi / clearGhi, 0, 1.3);
}

/**
 * Transmisión directa que cabría esperar a partir del índice de GHI. Es una relación grosera y
 * HEURÍSTICA (kt ≤ 0,25 casi sin directa; kt ≥ 0,9 directa plena): solo se usa para comprobar que la
 * directa del satélite es coherente con su GHI, nunca para sustituirla.
 */
export const expectedDirectIndexFromGhiIndex = (kt: number) => clamp((kt - 0.25) / 0.65, 0, 1);

/** 0-1 · coherencia entre la directa y el GHI. NaN si falta alguno. */
export function satelliteConsistency(directTransmission: number, clearSkyIndex: number): number {
  if (!Number.isFinite(directTransmission) || !Number.isFinite(clearSkyIndex)) return NaN;
  return 1 - clamp(Math.abs(directTransmission - expectedDirectIndexFromGhiIndex(clearSkyIndex)), 0, 1);
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* -------------------------------------------------------------------------- */
/*  Transmisión del haz directo según el MODELO                                */
/* -------------------------------------------------------------------------- */

export interface ModelTransmissionInputs {
  cloud: number;
  low: number;
  mid: number;
  high: number;
  /** Fracción de la hora con sol (derivada de `sunshine_duration`; ESTIMADA). */
  sunshine: number;
  /** DNI del modelo / DNI de cielo despejado (ya calibrada). */
  radiation: number;
}

export interface ModelTransmission {
  /** 0-1. NaN si no hay ninguna señal. */
  value: number;
  /** Cada señal 0-1 (NaN cuando no existe). */
  signals: { radiation: number; layers: number; sunshine: number };
  /** 0-1 · 1 − (máx − mín) entre las señales disponibles. NaN con menos de dos. */
  consistency: number;
}

/**
 * Combina tres señales del modelo con `MODEL_SIGNAL_WEIGHTS` renormalizados por disponibilidad:
 * radiación (la más directa), capas de nubes y sunshine (la más débil: derivada y horaria).
 */
export function modelTransmission(i: ModelTransmissionInputs): ModelTransmission {
  const signals = {
    radiation: Number.isFinite(i.radiation) ? clamp(i.radiation, 0, 1) : NaN,
    layers: layerClearProbability(i.cloud, i.low, i.mid, i.high),
    sunshine: Number.isFinite(i.sunshine) ? clamp(i.sunshine, 0, 1) : NaN,
  };
  const W = C.MODEL_SIGNAL_WEIGHTS;
  let sum = 0;
  let wsum = 0;
  const present: number[] = [];
  (Object.keys(signals) as Array<keyof typeof signals>).forEach((k) => {
    const v = signals[k];
    if (Number.isFinite(v)) {
      sum += W[k] * v;
      wsum += W[k];
      present.push(v);
    }
  });
  const value = wsum > 0 ? clamp(sum / wsum, 0, 1) : NaN;
  const consistency =
    present.length >= 2 ? 1 - (Math.max(...present) - Math.min(...present)) : NaN;
  return { value, signals, consistency };
}
