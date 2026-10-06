import { useMemo, useSyncExternalStore } from "react";
import { cloudService } from "../services/cloudService";
import { lightFusionService } from "../services/lightFusionService";
import { satelliteService } from "../services/satelliteService";
import type { LightSourceSummary, SatelliteStatus, TimeZones, WeatherStatus } from "../types";
import { useNow } from "./useNow";

export interface LightSourceState {
  /** Qué fuente respalda el instante elegido (observación · previsión · estimación). */
  summary: LightSourceSummary;
  /** Zonas de la línea de tiempo: observado · presente · previsión. */
  zones: TimeZones;
  satellite: SatelliteStatus;
  weather: WeatherStatus;
}

/**
 * Estado de las fuentes de luz para la interfaz. Se recalcula cuando cambian los datos (suscripción
 * a ambos servicios), cuando cambia el minuto del instante elegido y cada 30 s para que
 * "hace 6 min" avance solo. Los componentes nunca tocan a los proveedores.
 */
export function useLightSource(selectedTime: number): LightSourceState {
  const version = useSyncExternalStore(
    lightFusionService.subscribe,
    lightFusionService.getVersion,
    lightFusionService.getVersion
  );
  const now = useNow(30_000);
  const minute = Math.round(selectedTime / 60_000);

  return useMemo(
    () => ({
      summary: lightFusionService.getSourceSummary(selectedTime, now),
      zones: lightFusionService.getTimeZones(),
      satellite: satelliteService.getStatus(now),
      weather: cloudService.getStatus(now),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, now, minute]
  );
}
