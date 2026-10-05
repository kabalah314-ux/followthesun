import { useCallback, useSyncExternalStore } from "react";
import { savedPlacesService } from "../services/savedPlacesService";
import type { SavedPlace, SunPlace } from "../types";

export interface SavedPlacesApi {
  saved: SavedPlace[];
  isSaved(id: string): boolean;
  toggle(place: Pick<SunPlace, "id" | "name" | "type" | "latitude" | "longitude">): boolean;
}

export function useSavedPlaces(): SavedPlacesApi {
  const saved = useSyncExternalStore(
    savedPlacesService.subscribe,
    savedPlacesService.getSnapshot,
    savedPlacesService.getSnapshot
  );
  const isSaved = useCallback((id: string) => saved.some((p) => p.id === id), [saved]);
  const toggle = useCallback<SavedPlacesApi["toggle"]>((p) => savedPlacesService.toggle(p), []);
  return { saved, isSaved, toggle };
}
