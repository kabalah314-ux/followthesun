import { SEARCH_CONFIG } from "../config";
import { distanceMeters } from "../lib/coordinates";
import type { LngLat, WalkingEstimate } from "../types";

/**
 * routeService — distancia y tiempo a pie.
 *
 * HOY no hay un servicio de rutas: el proveedor por defecto ESTIMA en línea recta con un factor de
 * rodeo (×1,3) y una velocidad de 4,8 km/h. Es una estimación, no una ruta, y así se marca
 * (`exact: false`): la interfaz muestra «≈ 8 min a pie».
 *
 * La arquitectura está lista para un proveedor real (OSRM, Valhalla, OpenRouteService…): basta
 * implementar `RouteProvider` y registrarlo con `routeService.setProvider`. `estimateMany` existe
 * para que un proveedor con matriz de distancias resuelva muchos destinos en una sola petición.
 */

export interface RouteProvider {
  id: string;
  label: string;
  /** true si calcula rutas reales por la red peatonal. */
  exact: boolean;
  estimate(from: LngLat, to: LngLat): WalkingEstimate;
  /** Opcional: resolver muchos destinos de una vez (matriz de distancias). */
  estimateMany?(from: LngLat, to: LngLat[]): Promise<WalkingEstimate[]>;
}

const { speedMetersPerMinute, detourFactor } = SEARCH_CONFIG.walking;

/** Minutos a pie para una distancia en línea recta, con el factor de rodeo. */
export const minutesForStraightMeters = (meters: number): number =>
  (meters * detourFactor) / speedMetersPerMinute;

/** Metros en línea recta que caben en `minutes` minutos a pie. */
export const straightMetersForMinutes = (minutes: number): number =>
  (minutes * speedMetersPerMinute) / detourFactor;

const straightLineProvider: RouteProvider = {
  id: "straight-line",
  label: "Estimación en línea recta",
  exact: false,
  estimate(from, to) {
    const straight = distanceMeters(from.lng, from.lat, to.lng, to.lat);
    const distance = straight * detourFactor;
    return {
      distanceMeters: Math.round(distance),
      durationMinutes: Math.max(1, Math.round(distance / speedMetersPerMinute)),
      exact: false,
      method: "straight_line_estimate",
    };
  },
};

let provider: RouteProvider = straightLineProvider;

export const routeService = {
  getProvider: () => provider,
  setProvider(p: RouteProvider) {
    provider = p;
  },
  estimate: (from: LngLat, to: LngLat): WalkingEstimate => provider.estimate(from, to),
  async estimateMany(from: LngLat, to: LngLat[]): Promise<WalkingEstimate[]> {
    if (provider.estimateMany) return provider.estimateMany(from, to);
    return to.map((t) => provider.estimate(from, t));
  },
};

/** Distancia a pie en metros. */
export const getWalkingDistance = (from: LngLat, to: LngLat): number =>
  routeService.estimate(from, to).distanceMeters;

/** Duración a pie en minutos. */
export const getWalkingDuration = (from: LngLat, to: LngLat): number =>
  routeService.estimate(from, to).durationMinutes;
