import { GRAPHICS } from "../config";
import { smoothstep } from "../lib/coordinates";

/**
 * Opacidad del tono pizarra de las sombras según el zoom. La comparten la capa de la GPU y el
 * canvas de respaldo, para que las dos vistas se lean igual.
 *
 *  · Ciudad y barrio (≤ 14,6): sombra suave. A esa escala es textura, y el mapa y sus rótulos
 *    (barrios, calles) tienen que leerse por encima sin perder contraste.
 *  · Entre 14,6 y 16,4 sube hasta la opacidad plena de «calle» (`base + calle` de la configuración).
 *  · «Terraza» (17–19): un poco más, porque ahí la sombra es la información principal.
 */
export const SHADOW_TONE_RAMP = {
  /** Opacidad en la vista de ciudad y de barrio. */
  soft: 0.26,
  /** Zooms entre los que sube hasta la opacidad plena de «calle». */
  rise: [14.6, 16.4] as const,
  /** Zooms del refuerzo de «terraza». */
  terraza: [17, 19] as const,
} as const;

export function shadowToneAlpha(zoom: number): number {
  const t = GRAPHICS.shadowTone;
  const r = SHADOW_TONE_RAMP;
  const full = t.base + t.calle;
  return (
    r.soft +
    (full - r.soft) * smoothstep(r.rise[0], r.rise[1], zoom) +
    t.terraza * smoothstep(r.terraza[0], r.terraza[1], zoom)
  );
}
