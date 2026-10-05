import { SEARCH_CONFIG } from "../config";
import type { SunPlace } from "../types";
import { ringAround, samplePath, samplePolygon } from "./geometry";

/**
 * Puntos de análisis de un lugar. No se asume que todo un lugar tenga la misma exposición:
 *
 *   polígono (parque, plaza, playa…)  → rejilla de puntos dentro del polígono
 *   línea (playa mapeada como línea)  → puntos a lo largo
 *   terraza                           → el local y un anillo alrededor (no se sabe dónde están las mesas)
 *   mirador                           → el propio punto
 */

export type SampleKind = "interior" | "path" | "ring" | "node";

export interface SamplePoint {
  lng: number;
  lat: number;
  kind: SampleKind;
}

export function planSamples(place: SunPlace): SamplePoint[] {
  const cfg = SEARCH_CONFIG.sampling;

  if (place.polygon) {
    const ring = place.polygon.coordinates[0];
    return samplePolygon(ring, {
      areaPerPointM2: cfg.areaPerPointM2,
      minPoints: 1,
      maxPoints: cfg.maxPoints,
      minSpacingM: cfg.minSpacingM,
    }).map(([lng, lat]) => ({ lng, lat, kind: "interior" as const }));
  }

  if (place.path && place.path.length >= 2) {
    return samplePath(place.path, cfg.pathSpacingM, cfg.maxPathPoints).map(([lng, lat]) => ({
      lng,
      lat,
      kind: "path" as const,
    }));
  }

  const node: SamplePoint = { lng: place.longitude, lat: place.latitude, kind: "node" };
  if (place.type === "terrace") {
    const ring = ringAround(place.longitude, place.latitude, cfg.ringRadiusM, cfg.ringPoints).map(
      ([lng, lat]) => ({ lng, lat, kind: "ring" as const })
    );
    return [node, ...ring];
  }
  return [node];
}
