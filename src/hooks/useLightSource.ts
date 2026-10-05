import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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

interface LightServices {
  fusion: typeof import("../services/lightFusionService").lightFusionService;
  satellite: typeof import("../services/satelliteService").satelliteService;
  cloud: typeof import("../services/cloudService").cloudService;
}

const NO_SUBSCRIBE = () => () => undefined;
const ZERO = () => 0;

const EMPTY: LightSourceState = {
  summary: { kind: "loading", ageMs: null, satellite: null, model: null },
  zones: { observedUntil: null, presentUntil: null },
  satellite: {
    state: "loading",
    quality: "unavailable",
    origin: "unavailable",
    source: null,
    attribution: null,
    resolutionKm: null,
    temporalResolutionMinutes: null,
    lastObservationAt: null,
    latencyMinutes: null,
    ageMs: null,
    fetchedAt: null,
    refreshing: false,
    calibration: { factor: 1, source: "none" },
  },
  weather: {
    state: "loading",
    quality: "unavailable",
    source: null,
    attribution: null,
    resolutionKm: null,
    updatedAt: null,
    ageMs: null,
    confidence: null,
    simulated: false,
    coverage: 0,
    refreshing: false,
  },
};

/**
 * Estado de las fuentes de luz para la interfaz. Se recalcula cuando cambian los datos (suscripción
 * a ambos servicios), cuando cambia el minuto del instante elegido y cada 30 s para que
 * "hace 6 min" avance solo. Los componentes nunca tocan a los proveedores.
 */
export function useLightSource(selectedTime: number, enabled = true): LightSourceState {
  const [services, setServices] = useState<LightServices | null>(null);
  const now = useNow(30_000);
  const minute = Math.round(selectedTime / 60_000);

  // El motor meteorológico es grande y las APIs remotas no son necesarias para el primer render.
  // Cárgalo en idle DESPUÉS de que el mapa esté visible, luego empieza los refrescos en segundo plano.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = 0;
    let idle = 0;
    let loaded: LightServices | null = null;
    const w = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    Promise.all([
      import("../services/lightFusionService"),
      import("../services/satelliteService"),
      import("../services/cloudService"),
    ]).then(([fusionModule, satelliteModule, cloudModule]) => {
      if (cancelled) return;
      loaded = {
        fusion: fusionModule.lightFusionService,
        satellite: satelliteModule.satelliteService,
        cloud: cloudModule.cloudService,
      };
      setServices(loaded);
      const start = () => {
        if (cancelled || !loaded) return;
        loaded.cloud.start();
        loaded.satellite.start();
      };
      if (w.requestIdleCallback) idle = w.requestIdleCallback(start, { timeout: 1800 });
      else timer = window.setTimeout(start, 500);
    }).catch(() => {
      // La geometría solar y el mapa siguen funcionando aunque un chunk no esté disponible.
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
      loaded?.cloud.stop();
      loaded?.satellite.stop();
    };
  }, [enabled]);

  const subscribe = services?.fusion.subscribe ?? NO_SUBSCRIBE;
  const getSnapshot = services?.fusion.getVersion ?? ZERO;
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => services
      ? {
          summary: services.fusion.getSourceSummary(selectedTime, now),
          zones: services.fusion.getTimeZones(),
          satellite: services.satellite.getStatus(now),
          weather: services.cloud.getStatus(now),
        }
      : EMPTY,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, version, now, minute]
  );
}
