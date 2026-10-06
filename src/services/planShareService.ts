import { CONFIDENCE_ES, confidenceWord, fmtMin } from "../lib/formatSun";
import { longDayLabel } from "../lib/planningTime";
import type { ShareablePlan, SunSearchResult } from "../types";
import { formatClock } from "./timeService";

/**
 * planShareService — un resultado como texto compartible. Sin sistema social: solo el texto y el
 * enlace de la aplicación (todavía no hay enlaces profundos a un resultado).
 *
 *   Follow the Sun
 *   Sábado, 10 de octubre · 17:30–19:00
 *   Bogatell
 *   1 h 42 min de sol directo · confianza alta
 */

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function createShareablePlan(result: SunSearchResult): ShareablePlan {
  const w = result.bestWindow ?? result.searchWindow;
  const lines = [
    "I Follow the Sun",
    `${capitalize(longDayLabel(w.start))} · ${formatClock(w.start)}–${formatClock(w.end)}`,
    result.place.name,
    `${fmtMin(result.sunlightMinutes)} de sol directo · confianza ${CONFIDENCE_ES[
      confidenceWord(result.confidence)
    ].toLowerCase()}`,
  ];
  if (!result.weatherAvailable) lines.push("Sin datos de nubes: sol posible, no confirmado.");
  lines.push("Meteorología a escala de barrio, no de calle.");

  return {
    title: `I Follow the Sun · ${result.place.name}`,
    text: lines.join("\n"),
    url: `${window.location.origin}${window.location.pathname}`,
  };
}

/** Comparte con la hoja del sistema si existe; si no, copia al portapapeles. */
export async function shareOrCopy(plan: ShareablePlan): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: plan.title, text: plan.text, url: plan.url });
      return "shared";
    }
  } catch (e) {
    // El usuario cerró la hoja de compartir: no es un error.
    if (e instanceof DOMException && e.name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(`${plan.text}\n${plan.url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
