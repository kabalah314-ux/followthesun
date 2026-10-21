import { placeSlug, withTimeQuery } from "../lib/deepLinks";
import { CONFIDENCE_ES, confidenceWord, fmtMin } from "../lib/formatSun";
import { longDayLabel } from "../lib/planningTime";
import { urlWith } from "../lib/routing";
import type { ShareablePlan, SunSearchResult } from "../types";
import { formatClock } from "./timeService";
import { tr } from "../i18n";

/**
 * planShareService — un resultado como texto compartible. Sin sistema social: el texto y un enlace
 * profundo que abre la ficha del lugar a la hora de su mejor sol (`/lugar/<slug>?hora=…&dia=…`).
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
    tr("planShareService.de_sol_directo_confianza", { p0: fmtMin(result.sunlightMinutes), p1: CONFIDENCE_ES[
      confidenceWord(result.confidence)
    ].toLowerCase() }),
  ];
  if (!result.weatherAvailable) lines.push(tr("planShareService.sin_datos_de_nubes_sol"));
  lines.push(tr("planShareService.meteorologia_a_escala_de_barrio"));

  const slug = placeSlug(result.place);
  const query = withTimeQuery("", w.start);
  const path = slug ? urlWith({ slug }, query) : urlWith({ view: "explore" }, query);

  return {
    title: `I Follow the Sun · ${result.place.name}`,
    text: lines.join("\n"),
    url: `${window.location.origin}${path}`,
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
