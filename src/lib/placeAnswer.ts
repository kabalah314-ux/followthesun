import { formatClock, formatDuration } from "../services/timeService";
import type { SunSearchResult, SunWindow, SunWindowKind } from "../types";
import type { SunAnswer, SunShadeMode } from "./answer";
import { tr } from "../i18n";

/**
 * Frase-respuesta de un LUGAR encontrado por la búsqueda (la ficha y las tarjetas de «Cerca de ti
 * ahora»), a partir de los tramos de su mejor punto (`result.windows`). Funciones puras.
 *
 *   «Sol hasta las 17:40 · quedan 52 min»     ahora, dentro de la franja
 *   «Ahora sin sol · vuelve a las 12:10»      ahora, en sombra o nubes
 *   «Sol de 15:10 a 16:50»                    franja futura
 */

const MIN = 60_000;
const SUNNY: SunWindowKind[] = ["sun", "partial"];
const SHADY: SunWindowKind[] = ["shadow", "cloud"];

export interface Run {
  start: number;
  end: number;
}

/** Tramo seguido de alguno de los `kinds` que contiene `t` y el siguiente que empieza después de `t`. */
export function runsAround(windows: SunWindow[], t: number, kinds: SunWindowKind[]): { current: Run | null; next: Run | null } {
  const ws = [...windows].sort((a, b) => a.start - b.start);
  let current: Run | null = null;
  let next: Run | null = null;
  for (let i = 0; i < ws.length; i++) {
    if (!kinds.includes(ws[i].kind)) continue;
    let end = ws[i].end;
    let j = i + 1;
    // Tramos contiguos del mismo grupo (sol directo y sol suave, o sombra y nubes) cuentan como uno.
    while (j < ws.length && kinds.includes(ws[j].kind) && ws[j].start <= end + MIN) {
      end = Math.max(end, ws[j].end);
      j++;
    }
    const run = { start: ws[i].start, end };
    if (t >= run.start && t < run.end) {
      // Con un tramo en curso no hace falta el siguiente: quien llama solo lo usa si no hay actual.
      current = run;
      break;
    }
    if (run.start >= t && !next) next = run;
    if (next) break;
    i = j - 1;
  }
  return { current, next };
}

function span(windows: SunWindow[]): Run | null {
  if (windows.length === 0) return null;
  return {
    start: Math.min(...windows.map((w) => w.start)),
    end: Math.max(...windows.map((w) => w.end)),
  };
}

export interface NearbyLine {
  text: string;
  tone: "sun" | "shade" | "muted";
}

/**
 * Línea corta para una tarjeta: «Sol hasta las 17:40», «Sombra desde las 12:10»… `limit` es el fin
 * de la franja analizada: si el tramo llega hasta ahí, se dice «al menos hasta».
 */
export function nearbyLine(
  r: Pick<SunSearchResult, "windows" | "searchWindow">,
  now: number,
  mode: SunShadeMode,
  opts: { sunset?: number; clock?: (ms: number) => string } = {}
): NearbyLine {
  const clock = opts.clock ?? formatClock;
  const all = span(r.windows);
  const ref = all ? Math.max(now, all.start) : Math.max(now, r.searchWindow.start);
  const kinds = mode === "sun" ? SUNNY : SHADY;
  const word = mode === "sun" ? tr("pointPanel.sol") : tr("findSunPanel.sombra");
  const tone = mode === "sun" ? "sun" : "shade";
  const { current, next } = runsAround(r.windows, ref, kinds);
  if (current) {
    const toEnd = all && current.end >= all.end - MIN;
    if (toEnd && mode === "sun" && opts.sunset != null && Math.abs(all.end - opts.sunset) <= 5 * MIN) {
      return { text: tr("placeAnswer.sol_hasta_la_puesta", { p0: clock(opts.sunset) }), tone };
    }
    return { text: toEnd ? tr("placeAnswer.al_menos_hasta_las", { p0: word, p1: clock(current.end) }) : tr("placeAnswer.hasta_las", { p0: word, p1: clock(current.end) }), tone };
  }
  if (next) return { text: tr("placeAnswer.desde_las", { p0: word, p1: clock(next.start) }), tone };
  return { text: mode === "sun" ? tr("placeAnswer.sin_sol_directo_en_esta") : tr("placeAnswer.sin_sombra_seguida_en_esta"), tone: "muted" };
}

/** Frase-respuesta de la ficha de un lugar. */
export function describeResult(
  r: Pick<SunSearchResult, "windows" | "searchWindow" | "bestWindow" | "sunlightMinutes" | "weatherAvailable">,
  now: number,
  mode: SunShadeMode = "sun",
  clock: (ms: number) => string = formatClock
): SunAnswer {
  const all = span(r.windows) ?? r.searchWindow;
  const sunWord = r.weatherAvailable ? tr("pointPanel.sol") : tr("sunDetails.sol_posible");

  if (now >= all.start && now < all.end) {
    if (mode === "shade") {
      const { current, next } = runsAround(r.windows, now, SHADY);
      if (current) {
        return {
          state: "shade",
          headline: tr("placeAnswer.sombra_hasta_las", { p0: clock(current.end) }),
          detail: tr("answer.quedan", { p0: formatDuration(current.end - now) }),
          remainingMs: current.end - now,
        };
      }
      return {
        state: "sun",
        headline: next ? tr("placeAnswer.ahora_da_el_sol_sombra", { p0: clock(next.start) }) : tr("placeAnswer.ahora_da_el_sol"),
        detail: null,
        remainingMs: null,
      };
    }
    const { current, next } = runsAround(r.windows, now, SUNNY);
    if (current) {
      return {
        state: "sun",
        headline: tr("placeAnswer.hasta_las", { p0: sunWord, p1: clock(current.end) }),
        detail: tr("answer.quedan", { p0: formatDuration(current.end - now) }),
        remainingMs: current.end - now,
      };
    }
    if (next) {
      return { state: "shade", headline: tr("placeAnswer.ahora_sin_sol_vuelve_a", { p0: clock(next.start) }), detail: null, remainingMs: null };
    }
    return { state: "shade", headline: tr("placeAnswer.sin_sol_directo_el_resto"), detail: null, remainingMs: null };
  }

  if (mode === "shade") {
    const { current, next } = runsAround(r.windows, all.start, SHADY);
    const run = current ?? next;
    return run
      ? { state: "shade", headline: tr("placeAnswer.sombra_de_a", { p0: clock(run.start), p1: clock(run.end) }), detail: null, remainingMs: null }
      : { state: "sun", headline: tr("placeAnswer.sin_sombra_seguida_en_tu"), detail: null, remainingMs: null };
  }
  if (r.bestWindow) {
    return {
      state: "sun",
      headline: tr("placeAnswer.de_a", { p0: sunWord, p1: clock(r.bestWindow.start), p2: clock(r.bestWindow.end) }),
      detail: tr("placeAnswer.de_sol_directo_en_tu", { p0: formatDuration(r.sunlightMinutes * MIN) }),
      remainingMs: null,
    };
  }
  return { state: "shade", headline: tr("placeAnswer.sin_sol_directo_en_tu"), detail: null, remainingMs: null };
}
