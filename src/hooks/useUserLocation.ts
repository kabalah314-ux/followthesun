import { useCallback, useState } from "react";
import { CITY_BOUNDS } from "../config";
import { locateUser } from "../services/mapService";
import type { LngLat } from "../types";
import { log } from "../lib/log";

const MARGIN = 0.03;
const insideCity = (p: LngLat) =>
  p.lng > CITY_BOUNDS.west - MARGIN &&
  p.lng < CITY_BOUNDS.east + MARGIN &&
  p.lat > CITY_BOUNDS.south - MARGIN &&
  p.lat < CITY_BOUNDS.north + MARGIN;

/** Ubicación de la persona (solo se pide cuando busca cerca de ella). */
export function useUserLocation(notify: (message: string) => void) {
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);

  const requestUserLocation = useCallback(async (): Promise<LngLat | null> => {
    try {
      const pos = await locateUser();
      if (!insideCity(pos)) {
        notify("Estás fuera de Barcelona: se busca en toda la ciudad.");
        return null;
      }
      setUserLocation(pos);
      return pos;
    } catch (error) {
      log.warn("ubicación no disponible", error);
      notify("No se pudo obtener tu ubicación.");
      return null;
    }
  }, [notify]);

  return { userLocation, setUserLocation, requestUserLocation };
}
