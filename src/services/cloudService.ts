import { WEATHER_CONFIG, WEATHER_GRID } from "../config";
import {
  HOUR_MS,
  WeatherGridModel,
  createWeatherSample,
  type GridSpec,
  type WeatherSample,
} from "../lib/cloudInterpolation";
import { clamp, smoothstep } from "../lib/coordinates";
import { modelTransmission } from "../lib/radiationCalculations";
import { classifyQuality, weatherConfidence } from "../lib/sunlightCalculations";
import type { CloudCoverage, WeatherState, WeatherStatus } from "../types";
import { radiationService } from "./radiationService";
import { weatherService } from "./weatherService";

/**
 * cloudService — la parte de MODELO METEOROLÓGICO de la luz (nubosidad, DNI y GHI del modelo).
 *
 * Posee la malla del modelo (en memoria), la refresca, y responde consultas SÍNCRONAS
 * `(latitud, longitud, instante) → CloudCoverage`. Mover el selector de tiempo solo hace consultas a
 * memoria con interpolación espacial y temporal: no genera peticiones de red.
 *
 * Esto es PREVISIÓN, no observación. La observación del presente es `satelliteService`; la fusión de
 * ambas, `lightFusionService`.
 *
 * Estados honestos: si no hay datos devuelve `null` y el estado `unavailable`. Nunca inventa nubes.
 */

const SPEC: GridSpec = {
  bounds: WEATHER_GRID.bounds,
  cols: WEATHER_GRID.cols,
  rows: WEATHER_GRID.rows,
};

const CENTER = {
  lat: (WEATHER_GRID.bounds.north + WEATHER_GRID.bounds.south) / 2,
  lng: (WEATHER_GRID.bounds.east + WEATHER_GRID.bounds.west) / 2,
};

/** Más allá de estas celdas fuera de la malla no se estima nada. */
const OUTSIDE_LIMIT_CELLS = 4;

export interface CloudFieldSample {
  /** Cobertura total de nubes (0-1), atenuada hacia los bordes de la malla. */
  cloudCover: number;
  /** Probabilidad de que el haz directo atraviese las nubes (según el modelo). */
  transmission: number;
  /** 1 − transmisión: lo que bloquean las nubes. */
  blockage: number;
}

export interface ModelReference {
  resolutionKm: number;
  temporalResolutionMinutes: number;
  /** Minutos desde la descarga del modelo. */
  ageMinutes: number;
  /** Horizonte respecto a "ahora" (minutos; negativo = pasado). */
  leadMinutes: number;
}

/** Campo de nubes del modelo en un instante fijo, para pintar muchas celdas sin recalcular el tiempo. */
export interface CloudField {
  available: boolean;
  timestamp: number;
  reference: ModelReference | null;
  sample(lng: number, lat: number, out: CloudFieldSample): boolean;
}

const toMs = (t: Date | number) => (typeof t === "number" ? t : t.getTime());
const finiteOrUndefined = (v: number) => (Number.isFinite(v) ? v : undefined);

function buildCoverage(
  model: WeatherGridModel,
  s: WeatherSample,
  latitude: number,
  longitude: number,
  t: number,
  now: number
): CloudCoverage {
  const meta = model.data.meta;
  // La DNI del modelo se normaliza con el MISMO cielo despejado (calibrado) que la del satélite.
  const k = radiationService.getClearSkyCalibration().factor;
  const radiation = Number.isFinite(s.radiation) ? clamp(s.radiation / k, 0, 1) : NaN;
  const mt = modelTransmission({
    cloud: s.cloud,
    low: s.low,
    mid: s.mid,
    high: s.high,
    sunshine: s.sunshine,
    radiation,
  });
  const transmission = Number.isFinite(mt.value) ? mt.value : 1 - s.cloud;

  const usingFallback = s.fallbackShare >= 0.5;
  const ageMs = Math.max(0, now - meta.fetchedAt);
  const spatialCoverage = clamp(s.coverage, 0, 1) * (1 - 0.5 * smoothstep(0.5, 3, s.outside));

  const confidence = weatherConfidence({
    baseModel: usingFallback ? meta.fallbackBaseConfidence : meta.baseConfidence,
    leadHours: (t - now) / HOUR_MS,
    ageMs,
    agreement: Number.isFinite(s.spread) ? 1 - s.spread : NaN,
    consistency: mt.consistency,
    coverage: s.coverage,
    outside: s.outside,
    freshMs: WEATHER_CONFIG.freshMs,
    outdatedMs: WEATHER_CONFIG.outdatedMs,
    maxStaleMs: WEATHER_CONFIG.maxStaleMs,
  });

  return {
    latitude,
    longitude,
    timestamp: new Date(t),
    cloudCover: s.cloud,
    lowCloudCover: finiteOrUndefined(s.low),
    mediumCloudCover: finiteOrUndefined(s.mid),
    highCloudCover: finiteOrUndefined(s.high),
    visibility: undefined,
    confidence,
    source: meta.label,
    updatedAt: new Date(meta.fetchedAt),
    sunshineFraction: finiteOrUndefined(s.sunshine),
    modelDni: finiteOrUndefined(s.dni),
    modelGhi: finiteOrUndefined(s.ghi),
    transmissionSignals: {
      radiation: finiteOrUndefined(mt.signals.radiation),
      layers: finiteOrUndefined(mt.signals.layers),
      sunshine: finiteOrUndefined(mt.signals.sunshine),
    },
    signalConsistency: finiteOrUndefined(mt.consistency),
    directBeamTransmission: transmission,
    modelAgreement: Number.isFinite(s.spread) ? 1 - s.spread : undefined,
    spatialCoverage,
    resolutionKm: usingFallback ? (meta.fallbackResolutionKm ?? meta.resolutionKm) : meta.resolutionKm,
    quality: classifyQuality({
      available: true,
      ageMs,
      confidence,
      simulated: meta.simulated,
      outdatedMs: WEATHER_CONFIG.outdatedMs,
    }),
    simulated: meta.simulated,
  };
}

const retryDelay = (failures: number) => {
  const list = WEATHER_CONFIG.retryMs;
  return list[Math.min(Math.max(failures - 1, 0), list.length - 1)];
};

class CloudService {
  private model: WeatherGridModel | null = null;
  private loading = false;
  private failed = false;
  private failures = 0;
  private nextRetryAt = 0;
  private version = 0;
  private started = false;
  private timer = 0;
  private inflight: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private fieldMemo: { t: number; field: CloudField } | null = null;

  /* ------------------------------ suscripción ------------------------------ */

  /** Compatible con `useSyncExternalStore`. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.fieldMemo = null;
    this.listeners.forEach((l) => l());
  }

  /* ------------------------------ ciclo de vida ------------------------------ */

  /** Idempotente. Carga los datos (caché o red) y los mantiene al día mientras la app está abierta. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.refresh(false);
    this.timer = window.setInterval(this.tick, 60_000);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop() {
    this.started = false;
    window.clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private tick = () => {
    if (!document.hidden) this.maybeRefresh();
  };

  private onVisibility = () => {
    if (!document.hidden) this.maybeRefresh();
  };

  private maybeRefresh() {
    const now = Date.now();
    if (!this.model || this.failed) {
      if (now >= this.nextRetryAt) void this.refresh(true);
      return;
    }
    if (now - this.model.data.meta.fetchedAt >= WEATHER_CONFIG.ttlMs) void this.refresh(true);
  }

  /** `force = false` permite usar la caché fresca; `true` consulta a la fuente. */
  refresh(force = true): Promise<void> {
    if (this.inflight) return this.inflight;
    this.loading = true;
    if (!this.model) this.emit();

    this.inflight = weatherService
      .load(SPEC, { force })
      .then((res) => {
        this.model = new WeatherGridModel(res.data);
        this.failed = res.stale;
        this.failures = res.stale ? this.failures + 1 : 0;
        this.nextRetryAt = res.stale ? Date.now() + retryDelay(this.failures) : 0;
      })
      .catch(() => {
        this.failed = true;
        this.failures += 1;
        this.nextRetryAt = Date.now() + retryDelay(this.failures);
      })
      .finally(() => {
        this.loading = false;
        this.inflight = null;
        this.emit();
      });
    return this.inflight;
  }

  hasData() {
    return this.model !== null;
  }

  getMeta() {
    return this.model?.data.meta ?? null;
  }

  /* ------------------------------ consultas ------------------------------ */

  /**
   * Nubosidad / radiación del MODELO en un punto e instante. `null` si no hay datos para ese lugar o
   * momento. Interpola en el espacio (bilineal) y en el tiempo (lineal entre horas).
   */
  getCloudCoverageAtPoint(
    latitude: number,
    longitude: number,
    timestamp: Date | number,
    now: number = Date.now()
  ): CloudCoverage | null {
    return this.pointSampler(latitude, longitude)(toMs(timestamp), now);
  }

  /** Alias de `getCloudCoverageAtPoint`. */
  getCloudCoverage(
    latitude: number,
    longitude: number,
    timestamp: Date | number,
    now?: number
  ): CloudCoverage | null {
    return this.getCloudCoverageAtPoint(latitude, longitude, timestamp, now);
  }

  /** Muestreador para un punto fijo (precalcula nodos y pesos): ideal para recorrer el día. */
  pointSampler(latitude: number, longitude: number): (t: number, now?: number) => CloudCoverage | null {
    const model = this.model;
    if (!model) return () => null;
    const sampler = model.pointSampler(longitude, latitude);
    const sample = createWeatherSample();
    return (t, now = Date.now()) => {
      if (!model.inRange(t)) return null;
      if (!sampler(t, sample)) return null;
      if (sample.outside > OUTSIDE_LIMIT_CELLS) return null;
      return buildCoverage(model, sample, latitude, longitude, t, now);
    };
  }

  /** Campo de nubes del modelo en un instante (lo usa la capa visual y la fusión). */
  fieldAt(t: number, now: number = Date.now()): CloudField {
    const model = this.model;
    if (!model || !model.inRange(t)) {
      return { available: false, timestamp: t, reference: null, sample: () => false };
    }
    if (this.fieldMemo && this.fieldMemo.t === t) return this.fieldMemo.field;

    const snap = model.snapshotAt(t);
    const tmp = createWeatherSample();
    const k = radiationService.getClearSkyCalibration().factor;
    const meta = model.data.meta;
    const usePrimary = model.primaryShare(t) >= 0.5;

    const field: CloudField = {
      available: true,
      timestamp: t,
      reference: {
        resolutionKm: usePrimary ? meta.resolutionKm : (meta.fallbackResolutionKm ?? meta.resolutionKm),
        temporalResolutionMinutes: 60,
        ageMinutes: Math.max(0, (now - meta.fetchedAt) / 60_000),
        leadMinutes: (t - now) / 60_000,
      },
      sample(lng, lat, out) {
        if (!snap.sample(lng, lat, tmp)) {
          out.cloudCover = 0;
          out.transmission = 1;
          out.blockage = 0;
          return false;
        }
        const rad = Number.isFinite(tmp.radiation) ? clamp(tmp.radiation / k, 0, 1) : NaN;
        const mt = modelTransmission({
          cloud: tmp.cloud,
          low: tmp.low,
          mid: tmp.mid,
          high: tmp.high,
          sunshine: tmp.sunshine,
          radiation: rad,
        });
        const transmission = Number.isFinite(mt.value) ? mt.value : 1 - tmp.cloud;
        // Hacia los bordes de la malla el dato se desvanece: no se extrapola lejos.
        const edge = 1 - smoothstep(1.2, 3.5, tmp.outside);
        out.cloudCover = tmp.cloud * edge;
        out.blockage = (1 - transmission) * edge;
        out.transmission = 1 - out.blockage;
        return true;
      },
    };
    this.fieldMemo = { t, field };
    return field;
  }

  /* ------------------------------ estado ------------------------------ */

  getStatus(now: number = Date.now()): WeatherStatus {
    const model = this.model;
    if (!model) {
      return {
        state: this.failed ? "unavailable" : "loading",
        quality: "unavailable",
        source: null,
        attribution: null,
        resolutionKm: null,
        updatedAt: null,
        ageMs: null,
        confidence: null,
        simulated: false,
        coverage: 0,
        refreshing: this.loading,
      };
    }

    const meta = model.data.meta;
    const ageMs = Math.max(0, now - meta.fetchedAt);
    const primaryShare = model.primaryShare(now);

    let state: WeatherState = "ready";
    if (ageMs > WEATHER_CONFIG.outdatedMs) state = "stale";
    else if (model.coverageFraction < 0.9 || primaryShare < 0.6) state = "partial";

    const here = this.pointSampler(CENTER.lat, CENTER.lng)(now, now);
    const confidence = here ? here.confidence : null;
    const quality = classifyQuality({
      available: true,
      ageMs,
      confidence: confidence ?? 0.3,
      simulated: meta.simulated,
      outdatedMs: WEATHER_CONFIG.outdatedMs,
    });

    return {
      state,
      quality,
      source: meta.label,
      attribution: meta.attribution,
      resolutionKm: primaryShare >= 0.5 ? meta.resolutionKm : (meta.fallbackResolutionKm ?? meta.resolutionKm),
      updatedAt: meta.fetchedAt,
      ageMs,
      confidence,
      simulated: meta.simulated,
      coverage: model.coverageFraction,
      refreshing: this.loading,
    };
  }
}

export const cloudService = new CloudService();

/** Funciones del servicio como API de módulo (consultas sin necesidad de importar la instancia). */
export const getCloudCoverageAtPoint = (
  latitude: number,
  longitude: number,
  timestamp: Date | number,
  now?: number
) => cloudService.getCloudCoverageAtPoint(latitude, longitude, timestamp, now);

export const getCloudCoverage = getCloudCoverageAtPoint;
