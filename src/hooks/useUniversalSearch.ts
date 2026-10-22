import { useMemo, useSyncExternalStore } from "react";
import { areasFromPlaces, BCN_AREAS, mergeAreas, type Area } from "../lib/areas";
import { querySpec, type ExploreSpec } from "../lib/explore";
import { buildNameIndex, searchPlaces } from "../lib/placeSearch";
import { PLACE_TYPE_LABEL } from "../lib/placeTypes";
import { parseQuery, type ParsedQuery } from "../lib/searchParser";
import { nameKey, normalizeText } from "../lib/text";
import { zoneWeekMinutes } from "../lib/openingHours";
import { placeService } from "../services/placeService";
import type { SunPlace } from "../types";
import { specTitle } from "../components/Find/specLabel";
import { getLang, tr } from "../i18n";

export type SearchSuggestion =
  | { kind: "intent"; key: string; label: string; detail: string; spec: ExploreSpec }
  | { kind: "area"; key: string; label: string; detail: string; area: Area }
  | { kind: "place"; key: string; label: string; detail: string; place: SunPlace };

export interface UniversalSearch {
  suggestions: SearchSuggestion[];
  /** Interpreta un texto entero (al pulsar Intro). */
  interpret(text: string): { parsed: ParsedQuery; spec: ExploreSpec | null; place: SunPlace | null };
  areas: Area[];
}

/**
 * Buscador universal: sitios del inventario por nombre, barrios y distritos, e intenciones con
 * hora («terraza con sol mañana a las 11») interpretadas sin IA (`lib/searchParser.ts`).
 */
export function useUniversalSearch(text: string, mode: "sun" | "shade", now: number): UniversalSearch {
  const version = useSyncExternalStore(placeService.subscribe, placeService.getVersion, placeService.getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const places = useMemo(() => placeService.getPlaces() ?? [], [version]);
  const index = useMemo(() => buildNameIndex(places), [places]);
  const areas = useMemo(() => mergeAreas(BCN_AREAS, areasFromPlaces(places)), [places]);
  const weekday = zoneWeekMinutes(now).weekday;

  const interpret = useMemo(
    () => (t: string) => {
      const parsed = parseQuery(t, { areas, weekday, lang: getLang() });
      const spec = querySpec(parsed);
      const best = searchPlaces(index, t, 1)[0];
      return { parsed, spec, place: best && best.score >= 90 ? best.place : null };
    },
    [areas, weekday, index]
  );

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const q = text.trim();
    if (q.length < 2) return [];
    const { parsed, spec } = interpret(q);
    const out: SearchSuggestion[] = [];

    const byName = searchPlaces(index, q, 5);
    if (parsed.rest && normalizeText(parsed.rest) !== normalizeText(q)) {
      for (const h of searchPlaces(index, parsed.rest, 3)) if (!byName.some((x) => x.place.id === h.place.id)) byName.push(h);
    }
    const placeSug = (p: SunPlace): SearchSuggestion => {
      const hood = typeof p.metadata?.neighborhood === "string" ? ` · ${p.metadata.neighborhood}` : "";
      return { kind: "place", key: `p:${p.id}`, label: p.name, detail: `${PLACE_TYPE_LABEL[p.type]?.singular ?? ""}${hood}`, place: p };
    };

    // Un nombre casi exacto va primero («Plaça del Sol» no es «una plaza con sol»).
    const strong = byName.filter((h) => h.score >= 90);
    for (const h of strong.slice(0, 2)) out.push(placeSug(h.place));

    if (spec) {
      out.push({ kind: "intent", key: `i:${spec.key}`, label: specTitle(spec, mode, now), detail: tr("search.buscar_con_sol_y_sombra"), spec });
    }

    // Barrios: el reconocido y los que empiezan por lo escrito.
    const nq = nameKey(q);
    const areaHits: Area[] = [];
    if (parsed.area && !spec?.types && !spec?.mode) areaHits.push(parsed.area);
    if (nq.length >= 3) {
      for (const a of areas) {
        if (areaHits.length >= 2) break;
        if (areaHits.includes(a)) continue;
        const keys = [nameKey(a.name), ...a.aliases];
        if (keys.some((k) => k.startsWith(nq) || (nq.length >= 4 && k.includes(nq)))) areaHits.push(a);
      }
    }
    for (const a of areaHits) {
      out.push({
        kind: "area",
        key: `a:${a.id}`,
        label: a.name,
        detail: a.kind === "distrito" ? tr("search.distrito") : tr("search.barrio"),
        area: a,
      });
    }

    for (const h of byName) {
      if (out.length >= 7) break;
      if (strong.includes(h)) continue;
      out.push(placeSug(h.place));
    }
    return out;
  }, [text, interpret, index, areas, mode, now]);

  return { suggestions, interpret, areas };
}
