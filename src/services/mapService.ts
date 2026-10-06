import { forgetMapboxToken, getMapboxToken } from "../config";
import type { LngLat } from "../types";
import type { MapProvider } from "./map/types";

/**
 * mapService — punto único de acceso al mapa.
 *
 * El proveedor (Mapbox GL JS si hay token; mapa abierto equivalente si no) se carga BAJO DEMANDA:
 * el paquete de la otra librería nunca se descarga. Eso ahorra ~1,7 MB en la carga inicial, que es
 * el gasto más grande de la app.
 */

export type { MapLike, MapProvider, MapProviderId, MarkerLike } from "./map/types";

let cached: MapProvider | null = null;
let inflight: Promise<MapProvider> | null = null;

/** Carga (una sola vez) solo el proveedor que se va a usar. */
export async function loadMapProvider(): Promise<MapProvider> {
  if (cached) return cached;
  if (inflight) return inflight;

  const promise = (async (): Promise<MapProvider> => {
    if (getMapboxToken()) {
      const mod = await import("./map/mapbox");
      return mod.mapboxProvider;
    }
    const mod = await import("./map/maplibre");
    return mod.maplibreProvider;
  })().then((provider) => {
    cached = provider;
    inflight = null;
    return provider;
  });

  inflight = promise;
  return promise;
}

/** Cambia al mapa abierto (token inválido o ausente). */
export async function loadOpenMapProvider(): Promise<MapProvider> {
  cached = null;
  forgetMapboxToken();
  return loadMapProvider();
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
  loadOpenProvider: loadOpenMapProvider,
  locateUser,
};
