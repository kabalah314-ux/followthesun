import { useEffect, useMemo, useState, type RefObject } from "react";
import type { MapController } from "../components/Map/BarcelonaMap";
import type { Highlight, SunSearchOutcome, SunSearchResult } from "../types";

const EMPTY_HIGHLIGHTS: Highlight[] = [];
const EMPTY_RESULTS: SunSearchResult[] = [];

/** Marcadores del mapa para los resultados: el activo (o el primero) se destaca. */
export function toHighlights(results: SunSearchResult[], activeId: string | null): Highlight[] {
  if (results.length === 0) return EMPTY_HIGHLIGHTS;
  return results.map((r) => {
    const primary = activeId ? r.placeId === activeId : r.rank === 1;
    return {
      id: r.placeId,
      lng: r.spot.longitude,
      lat: r.spot.latitude,
      score: primary ? 0.9 : 0.25,
      rank: r.rank,
      name: r.place.name,
      label: String(r.score),
      primary,
    };
  });
}

/**
 * Resultados que se enseñan (los que cumplen o, si no hay, lo mejor disponible), el resultado
 * activo y sus marcadores. Con resultados nuevos, el mapa los encuadra.
 */
export function useSearchResults(
  outcome: SunSearchOutcome | null,
  mapController: RefObject<MapController | null>,
  leftPadding: number
) {
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const displayed = useMemo(
    () => (!outcome ? EMPTY_RESULTS : outcome.results.length > 0 ? outcome.results : outcome.bestAvailable),
    [outcome]
  );
  const activeResult = useMemo(
    () => displayed.find((r) => r.placeId === activeResultId) ?? null,
    [displayed, activeResultId]
  );
  const highlights = useMemo(() => toHighlights(displayed, activeResultId), [displayed, activeResultId]);

  useEffect(() => {
    setActiveResultId(null);
    if (displayed.length === 0) return;
    mapController.current?.fitPoints(
      displayed.map((r) => ({ lng: r.spot.longitude, lat: r.spot.latitude })),
      leftPadding
    );
  }, [displayed, leftPadding, mapController]);

  return { displayed, activeResult, activeResultId, setActiveResultId, highlights };
}
