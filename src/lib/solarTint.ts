import { LIGHT_MODEL_CONFIG } from "../config";
import { lerp, smoothstep } from "./coordinates";

export interface SunlightTint {
  /** Fuerza relativa del tono (0 = sol tenue · 1 = sol fuerte). */
  strength: number;
  /** Canales RGB del tono cálido. */
  rgb: [number, number, number];
  /** Opacidad del velo cálido antes de componerlo con el mapa. */
  opacity: number;
}

/**
 * Gradiente cálido monótono: la intensidad no es otro icono, se reconoce por un oro más claro en
 * el sol suave y un ámbar más profundo donde llega el haz más despejado. La diferencia de opacidad
 * también crece de forma continua con la luz, sin bandas duras ni colores meteorológicos chillones.
 */
export function sunlightTint(score: number, dayK: number, weatherAvailable: boolean): SunlightTint {
  const value = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  const strength = smoothstep(0.18, 0.88, value);
  const rgb: [number, number, number] = [
    lerp(255, 242, strength),
    lerp(218, 145, strength),
    lerp(158, 58, strength),
  ];
  const base = weatherAvailable ? 0.12 : 0.07;
  const range = weatherAvailable ? 0.31 : 0.21;
  const opacity = dayK * (base + range * strength) * smoothstep(0.035, 0.35, value);
  return { strength, rgb, opacity };
}

/** Umbrales legibles para la mini-leyenda/intensidad (no cambian la estimación científica). */
export const sunlightIntensityLabel = (score: number): "low" | "moderate" | "strong" =>
  score >= LIGHT_MODEL_CONFIG.DIRECT_LIGHT_THRESHOLD ? "strong" : score >= 0.3 ? "moderate" : "low";