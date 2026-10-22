import { GRAPHICS, MAP_CONFIG } from "../config";
import { clamp } from "../lib/coordinates";

/**
 * Cámara cinematográfica y márgenes de la interfaz (lógica pura, sin mapa).
 *
 * «De espaldas al sol»: inclinada 60° y mirando en la dirección opuesta al sol (rumbo = azimut
 * solar + 180°). Las fachadas que ve la cámara son las iluminadas, y las sombras se alejan hacia el
 * fondo de la imagen, como en una foto con el sol detrás del fotógrafo.
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface CinematicOptions {
  /** Azimut del sol (grados desde el norte, sentido horario). */
  sunAzimuthDeg: number;
  zoom?: number;
  pitch?: number;
}

export interface CameraTarget {
  bearing: number;
  pitch: number;
  zoom: number;
}

/** Rumbo normalizado a (−180, 180]. */
export function normalizeBearing(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let b = ((deg % 360) + 360) % 360;
  if (b > 180) b -= 360;
  return b;
}

/** Cámara de espaldas al sol para un lugar (zoom «terraza» salvo que se pida otro). */
export function cinematicCamera(
  o: CinematicOptions,
  currentZoom: number,
  limits: { maxPitch: number; maxZoom: number } = { maxPitch: MAP_CONFIG.maxPitch, maxZoom: MAP_CONFIG.maxZoom }
): CameraTarget {
  return {
    bearing: normalizeBearing(o.sunAzimuthDeg + 180),
    pitch: clamp(o.pitch ?? GRAPHICS.cinematic.pitch, 0, limits.maxPitch),
    zoom: clamp(o.zoom ?? Math.max(currentZoom, GRAPHICS.cinematic.zoom), 0, limits.maxZoom),
  };
}

/**
 * Lo que la interfaz tapa y el mapa aún no tiene en su `padding` (nunca negativo). Con un solo
 * modelo de márgenes no se desplaza dos veces: si el padding ya cubre la hoja, el extra es 0.
 */
export function extraInsets(insets: Insets, applied: Insets): Insets {
  return {
    top: Math.max(0, insets.top - applied.top),
    right: Math.max(0, insets.right - applied.right),
    bottom: Math.max(0, insets.bottom - applied.bottom),
    left: Math.max(0, insets.left - applied.left),
  };
}

/** Desplazamiento (px) que centra un punto en la parte visible, dados unos márgenes extra. */
export function insetsOffset(extra: Insets): [number, number] {
  return [(extra.left - extra.right) / 2, (extra.top - extra.bottom) / 2];
}

/** Márgenes que caben en la pantalla: deja al menos `minVisible` px de mapa en cada eje. */
export function fitInsets(insets: Insets, width: number, height: number, minVisible = 120): Insets {
  const sx = Math.min(1, Math.max(0, width - minVisible) / Math.max(1, insets.left + insets.right));
  const sy = Math.min(1, Math.max(0, height - minVisible) / Math.max(1, insets.top + insets.bottom));
  return {
    top: Math.round(insets.top * sy),
    bottom: Math.round(insets.bottom * sy),
    left: Math.round(insets.left * sx),
    right: Math.round(insets.right * sx),
  };
}
