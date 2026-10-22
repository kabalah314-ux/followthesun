import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BARCELONA, PLACES_CONFIG } from "../config";
import {
  applyFilters,
  curate,
  exploreRequest,
  exploreWindow,
  mergeFilters,
  specMode,
  type ExploreFilters,
  type ExploreSpec,
  type ExploreWindow,
} from "../lib/explore";
import { dayStartFor } from "../lib/planningTime";
import { tasteFactor } from "../lib/taste";
import { placeService } from "../services/placeService";
import { solarService } from "../services/solarService";
import { tasteStore } from "../services/tasteService";
import { venueService, venueToSunPlace } from "../services/venueService";
import type { LngLat, SunPlace, SunPlaceType, SunSearchOutcome, SunSearchResult } from "../types";
import type { SunShadeMode } from "../lib/answer";
import { useSunSearch, type SunSearchState } from "./useSunSearch";

const MIN = 60_000;

export interface ExploreState {
  spec: ExploreSpec;
  /** Sol o sombra efectivo de la búsqueda. */
  mode: SunShadeMode;
  window: ExploreWindow;
  filters: ExploreFilters;
  origin: LngLat;
  /** Hay un origen real (ubicación o barrio) y no solo el centro de la ciudad. */
  originIsReal: boolean;
  state: SunSearchState;
  outcome: SunSearchOutcome | null;
  /** 3–5 sitios con variedad (los que se enseñan y van al mapa). */
  results: SunSearchResult[];
  /** Sin nada que enseñar todavía (primera búsqueda de este tipo). */
  loading: boolean;
  /** Recalculando con resultados anteriores a la vista (al mover la hora, por ejemplo). */
  refreshing: boolean;
  /** Los filtros dejaron sin candidatos antes de buscar. */
  filteredOut: boolean;
  retry(): void;
}

interface Options {
  enabled: boolean;
  spec: ExploreSpec;
  appMode: SunShadeMode;
  now: number;
  /** Hora elegida en la línea de tiempo (null = siguiendo al reloj). */
  selected: number | null;
  userLocation: LngLat | null;
  filters: ExploreFilters;
}

/**
 * La búsqueda de Explorar («Para ti», chips, búsquedas escritas y colecciones): prepara los
 * candidatos (inventario o locales con terraza, con los filtros), llama al motor y se queda con
 * 3–5 sitios variados. Cada cambio espera un instante (al arrastrar la hora no se lanzan decenas
 * de búsquedas) y la última búsqueda cancela la anterior.
 */
export function useExplore(o: Options): ExploreState {
  const search = useSunSearch();
  const mode = specMode(o.spec, o.appMode);
  const sunDay = useCallback((off: number) => {
    const t = solarService.getSunTimes(dayStartFor(Date.now(), off), BARCELONA.lat, BARCELONA.lng);
    return { sunrise: t.sunrise, sunset: t.sunset };
  }, []);
  const minuteSlot = Math.floor(o.now / (5 * MIN));
  const win = useMemo(
    () => exploreWindow(o.spec, mode, { now: Date.now(), selected: o.selected, sunDay }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.spec, mode, o.selected, sunDay, minuteSlot]
  );
  const filters = useMemo(() => mergeFilters(o.filters, o.spec), [o.filters, o.spec]);
  const origin = useMemo<LngLat>(
    () => (o.spec.area ? { lng: o.spec.area.lng, lat: o.spec.area.lat } : (o.userLocation ?? { lng: BARCELONA.lng, lat: BARCELONA.lat })),
    [o.spec.area, o.userLocation]
  );
  const originIsReal = !!(o.spec.area || o.userLocation);
  const [filteredOut, setFilteredOut] = useState(false);
  const [nonce, setNonce] = useState(0);

  const key = [
    o.spec.key,
    mode,
    Math.floor(win.start / (15 * MIN)),
    Math.floor(win.end / (15 * MIN)),
    `${origin.lng.toFixed(3)},${origin.lat.toFixed(3)}`,
    JSON.stringify(filters),
    nonce,
  ].join("|");

  const latest = useRef({ spec: o.spec, mode, window: win, filters, origin, originIsReal });
  latest.current = { spec: o.spec, mode, window: win, filters, origin, originIsReal };
  const ran = useRef("");
  /** La búsqueda (sin hora ni origen) de la última petición lanzada y de lo último que llegó. */
  const runSpec = useRef("");
  const last = useRef<{ specKey: string; outcome: SunSearchOutcome } | null>(null);
  const run = search.run;

  useEffect(() => {
    if (!o.enabled || ran.current === key) return;
    const first = ran.current === "";
    const timer = window.setTimeout(
      () => {
        ran.current = key;
        const c = latest.current;
        void (async () => {
          let places: SunPlace[] | undefined;
          const needsFilter = c.filters.open || c.filters.licensed || c.filters.wifi || c.filters.dog || c.filters.accessible;
          if (c.spec.venues) {
            let venuePlaces: SunPlace[] = [];
            try {
              const { venues } = await venueService.loadVenues(PLACES_CONFIG.bbox);
              venuePlaces = venues.map(venueToSunPlace);
            } catch {
              // Sin el inventario de locales: las terrazas del inventario general.
              venuePlaces = (await placeService.load().catch(() => null))?.places.filter((p) => p.type === "terrace") ?? [];
            }
            const others: SunPlaceType[] = (c.spec.types ?? []).filter((t) => t !== "terrace");
            const extra = others.length ? ((await placeService.load().catch(() => null))?.places ?? []).filter((p) => others.includes(p.type)) : [];
            places = [...venuePlaces, ...extra];
          } else if (needsFilter) {
            places = (await placeService.load().catch(() => null))?.places;
          }
          if (places && needsFilter) places = applyFilters(places, c.filters, c.window.start);
          setFilteredOut(!!places && places.length === 0);
          const request = exploreRequest(c.spec, {
            mode: c.mode,
            window: c.window,
            origin: c.origin,
            originIsReal: c.originIsReal,
            maxWalk: c.filters.maxWalk,
            limit: 10,
          });
          // Respuesta rápida: los 40 lugares más cercanos y 4 puntos por lugar.
          runSpec.current = c.spec.key;
          void run(request, { places, maxCandidates: 40, maxSamplePoints: 4 });
        })();
      },
      first ? 0 : 450
    );
    return () => window.clearTimeout(timer);
  }, [o.enabled, key, run]);

  if (search.state.outcome && last.current?.outcome !== search.state.outcome) {
    last.current = { specKey: runSpec.current, outcome: search.state.outcome };
  }
  // Mientras se recalcula la MISMA búsqueda (otra hora, otro origen), se siguen viendo los
  // resultados anteriores en lugar de esqueletos.
  const outcome = search.state.outcome ?? (last.current && last.current.specKey === o.spec.key ? last.current.outcome : null);
  const pending = search.state.status === "searching" || (o.enabled && ran.current !== key);
  const results = useMemo(() => {
    if (!outcome) return [];
    const shown = outcome.results.length > 0 ? outcome.results : outcome.bestAvailable;
    const taste = tasteStore.get();
    return curate(shown, { taste: (r) => tasteFactor(taste, r.locationType), preferWifi: o.spec.preferWifi });
  }, [outcome, o.spec.preferWifi]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  return {
    spec: o.spec,
    mode,
    window: win,
    filters,
    origin,
    originIsReal,
    state: search.state,
    outcome,
    results,
    loading: pending && !outcome,
    refreshing: pending && !!outcome,
    filteredOut,
    retry,
  };
}
