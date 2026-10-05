import { getMapboxToken } from "../config";
import type { LngLat } from "../types";
import type { MapProvider, MapProviderId } from "./map/types";

/**
 * mapService — punto único de acceso al mapa.
 *
 * Elige el proveedor (Mapbox GL JS si hay token; mapa abierto equivalente si no) y expone la
 * geolocalización. Todo lo demás (estilo, nombres, marcadores, tema, edificios) cuelga del
 * `MapProvider` devuelto, de modo que el resto de la app no sabe qué librería hay debajo.
 */

export type { MapLike, MapProvider, MapProviderId, MarkerLike } from "./map/types";

/**
 * Importa únicamente el proveedor necesario. Mapbox pesa mucho y MapLibre es respaldo: cargar los
 * dos al arrancar duplicaba el coste de parseo, aunque solo se usase uno.
 */
export async function loadMapProvider(id?: MapProviderId): Promise<MapProvider> {
  const providerId = id ?? (getMapboxToken() ? "mapbox" : "maplibre");
  if (providerId === "mapbox") {
    const module = await import("./map/mapbox");
    return module.mapboxProvider;
  }
  const module = await import("./map/maplibre");
  return module.maplibreProvider;
}

export function locateUser(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 60_000 }
    );
  });
}

export const mapService = {
  loadProvider: loadMapProvider,
  locateUser,
};
