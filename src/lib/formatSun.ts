import { formatDuration } from "../services/timeService";
import { getPreferences } from "./preferences";
import type { SunWindowKind } from "../types";
import { influenceLevel } from "./sunlightCalculations";

/** Formato de cantidades de sol para la interfaz (siempre sin valores técnicos ni NaN). */

export const fmtMin = (minutes: number): string =>
  formatDuration(Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0)) * 60_000);

export type ConfidenceWord = "very_high" | "high" | "medium" | "low";

/** Muy alta ≥ 0,85 (precisión de edificio) · alta ≥ 0,65 · media ≥ 0,4 · baja. */
export const confidenceWord = (c: number): ConfidenceWord =>
  c >= 0.85 ? "very_high" : c >= 0.65 ? "high" : c >= 0.4 ? "medium" : "low";

export const CONFIDENCE_ES: Record<ConfidenceWord, string> = {
  very_high: "Muy alta",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const INFLUENCE_ES = { low: "Baja", moderate: "Moderada", high: "Alta" } as const;

export const influenceWord = (cloudInfluence: number): string =>
  INFLUENCE_ES[influenceLevel(cloudInfluence)];

export const KIND_ES: Record<SunWindowKind, string> = {
  sun: "Sol directo",
  partial: "Sol parcial",
  shadow: "Sombra",
  cloud: "Nubes",
  uncertain: "Incierto",
  night: "Sin sol",
};

/** Distancia en la unidad elegida en Ajustes. */
export const fmtMeters = (m: number): string => {
  if (getPreferences().distanceUnit === "mi") {
    const mi = m / 1609.344;
    return mi < 0.2 ? `${Math.round((m * 3.28084) / 10) * 10} ft` : `${mi.toFixed(1).replace(".", ",")} mi`;
  }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
};

/** Temperatura en la unidad elegida en Ajustes. */
export const fmtTemp = (c: number): string =>
  getPreferences().temperatureUnit === "f" ? `${Math.round((c * 9) / 5 + 32)} °F` : `${Math.round(c)} °C`;
