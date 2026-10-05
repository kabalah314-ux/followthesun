import { BARCELONA } from "../config";
import { SUN_UP_RAD } from "../lib/solarCalculations";
import type { SolarGrid } from "../lib/solarGrid";
import type { DataOrigin, LightSourceMode, SolarPoint } from "../types";
import { lightFusionService, type LightFieldSample } from "./lightFusionService";
import { solarService } from "./solarService";
import { createTerrainField } from "./terrainService";

/**
 * solarFieldService — origen de los `SolarPoint` que pinta la capa solar.
 *
 * Una `SolarFieldSource` rellena la `SolarGrid` para un instante dado. Las capas se mantienen
 * separadas dentro de la rejilla:
 *   · sunlight / shadow  geometría: sol sobre el horizonte y relieve (las sombras de edificios se
 *                        dibujan aparte, a resolución de calle, en `ShadowLayer`)
 *   · cloud              lo que las nubes bloquean del haz directo (0-1) según la FUSIÓN de la
 *                        observación satelital y el modelo (`lightFusionService`), o solo una de
 *                        las dos fuentes si se pide (`mode`, depuración)
 *
 * Si no hay datos la capa de nubes queda a 0 y `weatherAvailable` es false: la capa visual lo tiene
 * en cuenta (no presenta como "sol" lo que no está verificado).
 */

export interface SolarFieldInfo {
  weatherAvailable: boolean;
  origin: DataOrigin;
}

export interface SolarFieldSource {
  id: string;
  compute(timeMs: number, grid: SolarGrid, mode?: LightSourceMode): SolarFieldInfo;
}

export function createWeatherSolarSource(): SolarFieldSource {
  const terrain = createTerrainField();
  const sample: LightFieldSample = { cloudCover: 0, transmission: 1, blockage: 0 };

  return {
    id: "terrain+satellite+model",
    compute(timeMs, grid, mode = "fused") {
      const pos = solarService.getPosition(timeMs, BARCELONA.lat, BARCELONA.lng);
      const up = pos.altitude >= SUN_UP_RAD;
      terrain.update(pos.azimuth, pos.altitude);
      const field = lightFusionService.fieldAt(timeMs, Date.now(), mode);

      const { cols, rows } = grid;
      for (let j = 0; j < rows; j++) {
        const lat = grid.latAt(j);
        for (let i = 0; i < cols; i++) {
          const lng = grid.lngAt(i);
          const k = j * cols + i;
          const vis = up ? terrain.sample(lng, lat) : 0;
          grid.sunlight[k] = vis;
          grid.shadow[k] = 1 - vis;
          grid.cloud[k] = up && field.available && field.sample(lng, lat, sample) ? sample.blockage : 0;
        }
      }
      return { weatherAvailable: field.available, origin: field.origin };
    },
  };
}

/** Exporta una rejilla como lista de puntos (útil para depurar o para enviarla a otro proceso). */
export function gridToSolarPoints(grid: SolarGrid, step = 1): SolarPoint[] {
  const out: SolarPoint[] = [];
  for (let j = 0; j < grid.rows; j += step) {
    for (let i = 0; i < grid.cols; i += step) {
      const k = j * grid.cols + i;
      out.push({
        latitude: grid.latAt(j),
        longitude: grid.lngAt(i),
        sunlight: grid.sunlight[k],
        shadow: grid.shadow[k],
        cloudCoverage: grid.cloud[k],
      });
    }
  }
  return out;
}

export const solarFieldService = {
  createWeatherSource: createWeatherSolarSource,
  toPoints: gridToSolarPoints,
};
