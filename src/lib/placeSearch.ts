import type { SunPlace, SunPlaceType } from "../types";
import { distanceMeters } from "./coordinates";
import { normalizeText } from "./text";

/**
 * Búsqueda por nombre en el inventario (OpenStreetMap + Open Data BCN), para el buscador
 * universal. Rápida (miles de nombres por pulsación) y tolerante: «ciutadella» encuentra
 * «Parc de la Ciutadella» y «guell» encuentra «Park Güell».
 */

export interface NameIndexEntry {
  place: SunPlace;
  norm: string;
  words: string[];
}

/** Destinos conocidos primero cuando dos nombres puntúan igual. */
const TYPE_BONUS: Partial<Record<SunPlaceType, number>> = { park: 4, beach: 4, viewpoint: 4, square: 3, open_space: 2, playground: 1 };

export function buildNameIndex(places: readonly SunPlace[]): NameIndexEntry[] {
  const out: NameIndexEntry[] = [];
  for (const place of places) {
    const norm = normalizeText(place.name);
    if (norm.length < 2) continue;
    out.push({ place, norm, words: norm.split(" ") });
  }
  return out;
}

function score(e: NameIndexEntry, q: string, qWords: string[]): number {
  if (e.norm === q) return 100;
  if (e.norm.startsWith(q)) return 90;
  const hits = qWords.filter((w) => e.words.some((x) => x.startsWith(w))).length;
  if (hits === qWords.length) return 70 + Math.round((10 * qWords.length) / e.words.length);
  if (e.norm.includes(q)) return 55;
  if (qWords.length >= 2 && hits * 2 >= qWords.length) return 40;
  return 0;
}

/** Los `limit` lugares que mejor encajan con el texto (sin repetir el mismo sitio). */
export function searchPlaces(index: readonly NameIndexEntry[], text: string, limit = 5): Array<{ place: SunPlace; score: number }> {
  const q = normalizeText(text);
  if (q.length < 2) return [];
  const qWords = q.split(" ").filter((w) => w.length >= 2 || /\d/.test(w));
  if (qWords.length === 0) return [];
  const hits: Array<{ place: SunPlace; score: number; len: number }> = [];
  for (const e of index) {
    const s = score(e, q, qWords);
    if (s > 0) hits.push({ place: e.place, score: s + (TYPE_BONUS[e.place.type] ?? 0), len: e.norm.length });
  }
  hits.sort((a, b) => b.score - a.score || a.len - b.len);
  const out: Array<{ place: SunPlace; score: number }> = [];
  for (const h of hits) {
    const dup = out.some(
      (o) =>
        normalizeText(o.place.name) === normalizeText(h.place.name) &&
        distanceMeters(o.place.longitude, o.place.latitude, h.place.longitude, h.place.latitude) < 60
    );
    if (dup) continue;
    out.push({ place: h.place, score: h.score });
    if (out.length >= limit) break;
  }
  return out;
}
