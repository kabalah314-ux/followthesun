import { SATELLITE_API, SATELLITE_CONFIG, WEATHER_GRID } from "../config";
import { TtlCache } from "../lib/cache";
import type { GridSpec } from "../lib/cloudInterpolation";
import { clamp, distanceMeters } from "../lib/coordinates";
import { satelliteConsistency } from "../lib/radiationCalculations";
import {
  SatelliteGridModel,
  type SatelliteGridData,
  type SatelliteMeta,
  type SatelliteRaw,
} from "../lib/satelliteInterpolation";
import { calculateSourceWeight } from "../lib/sourceWeights";
import type { DataOrigin, DataQuality, SatelliteRadiation, SatelliteStatus } from "../types";
import { WeatherError, fetchJson, gridNodeCoordinates } from "./weatherService";

/**
 * satelliteService — observación de radiación solar por satélite. Nada de modelo, nada de fusión.
 *
 * Fuente: Open-Meteo Satellite Radiation API → EUMETSAT MTG (DWD), rejilla 0,025° (≈ 2,5 km),
 * 10 min nativos, ~20 min de retraso. Variables: GHI, directa, difusa, DNI y GHI de cielo despejado
 * (instantáneas). Es una OBSERVACIÓN derivada de imágenes de satélite, no una medición en tierra.
 *
 *  · Conserva la resolución nativa (10 min); no se agrega a horas.
 *  · Distingue muestra observada, interpolada y persistida (ver `SatelliteGridModel`).
 *  · Nunca acepta como observación una muestra posterior a la descarga.
 *  · Resolución ESPACIAL: ≈ 2,5 km. NO es una medición a nivel de calle.
 *  · La componente directa puede estar derivada del GHI: la API no lo aclara (`unverified`).
 */

const SPEC: GridSpec = {
  bounds: WEATHER_GRID.bounds,
  cols: WEATHER_GRID.cols,
  rows: WEATHER_GRID.rows,
};

const MIN = 60_000;
const VARIABLES = [
  "shortwave_radiation_instant",
  "direct_radiation_instant",
  "diffuse_radiation_instant",
  "direct_normal_irradiance_instant",
  "shortwave_radiation_clear_sky_instant",
] as const;

interface SatLocation {
  latitude?: number;
  longitude?: number;
  hourly?: Record<string, unknown>;
  error?: boolean;
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : NaN;

/**
 * Estima la resolución espacial por la alineación de los nodos devueltos: si algún centro cae en un
 * múltiplo IMPAR de 0,025° la rejilla es de 0,025° (≈ 2,5 km); si todos caen en múltiplos pares no
 * se puede distinguir de una de 0,05° y se asume la más gruesa (conservador).
 */
function estimateResolutionKm(coords: Array<{ lat: number; lng: number }>): number {
  const odd = (v: number) => {
    const q = v / 0.025;
    return Math.abs(q - Math.round(q)) < 0.04 && Math.round(q) % 2 !== 0;
  };
  return coords.some((c) => odd(c.lat) || odd(c.lng)) ? 2.5 : 5;
}

async function fetchSatelliteGrid(spec: GridSpec): Promise<SatelliteGridData> {
  const nodes = gridNodeCoordinates(spec);
  const lats = nodes.map((n) => n.lat).join(",");
  const lngs = nodes.map((n) => n.lng).join(",");

  // `models` + `temporal_resolution=native` son imprescindibles: sin ellos la API devuelve datos
  // horarios de otra fuente, con otra rejilla y sin GHI de cielo despejado.
  let url =
    `${SATELLITE_API.baseUrl}/v1/archive?latitude=${lats}&longitude=${lngs}` +
    `&hourly=${VARIABLES.join(",")}&temporal_resolution=native` +
    `&models=${SATELLITE_CONFIG.model}&timeformat=unixtime`;
  if (SATELLITE_CONFIG.pastDays > 0) url += `&past_days=${SATELLITE_CONFIG.pastDays}`;
  if (SATELLITE_API.apiKey) url += `&apikey=${encodeURIComponent(SATELLITE_API.apiKey)}`;

  const json = await fetchJson(url, SATELLITE_CONFIG.requestTimeoutMs);
  const fetchedAt = Date.now();
  const list = (Array.isArray(json) ? json : [json]) as SatLocation[];
  if (list.length !== nodes.length || list.some((l) => !l || l.error || !l.hourly)) {
    throw new WeatherError("parse", "Unexpected satellite response");
  }

  const times = list[0].hourly!["time"];
  if (!Array.isArray(times) || times.length < 3) throw new WeatherError("parse", "No time axis");
  const steps = times.length;
  const t0 = Number(times[0]) * 1000;
  const stepMs = (Number(times[1]) - Number(times[0])) * 1000;
  if (!Number.isFinite(t0) || stepMs < 5 * MIN || stepMs > 60 * MIN) {
    throw new WeatherError("parse", "Unexpected satellite time step");
  }

  const size = nodes.length * steps;
  const nanF = () => new Float32Array(size).fill(NaN);
  const ghi = nanF();
  const direct = nanF();
  const diffuse = nanF();
  const dni = nanF();
  const clearGhi = nanF();

  let offsetSum = 0;
  const returned: Array<{ lat: number; lng: number }> = [];

  for (let n = 0; n < nodes.length; n++) {
    const loc = list[n];
    const h = loc.hourly!;
    const series = VARIABLES.map((v) => h[v]);
    if (typeof loc.latitude === "number" && typeof loc.longitude === "number") {
      returned.push({ lat: loc.latitude, lng: loc.longitude });
      offsetSum +=
        distanceMeters(nodes[n].lng, nodes[n].lat, loc.longitude, loc.latitude) / 1000;
    }
    for (let s = 0; s < steps; s++) {
      // Un dato posterior a la descarga NO puede ser una observación: se descarta.
      if (t0 + s * stepMs > fetchedAt) continue;
      const i = n * steps + s;
      ghi[i] = num(Array.isArray(series[0]) ? series[0][s] : undefined);
      direct[i] = num(Array.isArray(series[1]) ? series[1][s] : undefined);
      diffuse[i] = num(Array.isArray(series[2]) ? series[2][s] : undefined);
      dni[i] = num(Array.isArray(series[3]) ? series[3][s] : undefined);
      clearGhi[i] = num(Array.isArray(series[4]) ? series[4][s] : undefined);
    }
  }

  const resolutionKm = returned.length > 0 ? estimateResolutionKm(returned) : SATELLITE_CONFIG.nominalResolutionKm;
  const hasClearSky = clearGhi.some((v) => !Number.isNaN(v));

  const meta: SatelliteMeta = {
    providerId: "open-meteo-satellite",
    label: "EUMETSAT MTG · vía Open-Meteo",
    source: "EUMETSAT MTG (DWD) · Open-Meteo Satellite Radiation",
    attribution: "Open-Meteo.com · EUMETSAT / DWD (CC BY 4.0)",
    requestedSource: SATELLITE_CONFIG.model,
    resolutionKm,
    temporalResolutionMinutes: Math.round(stepMs / MIN),
    fetchedAt,
    nodeOffsetKm: returned.length > 0 ? offsetSum / returned.length : 0,
    hasClearSky,
    directProvenance: "unverified",
  };

  return { spec, t0, stepMs, steps, ghi, direct, diffuse, dni, clearGhi, meta };
}

/* -------------------------------------------------------------------------- */
/*  Caché satelital (satelliteCache) — TTL propio, distinto del del modelo     */
/* -------------------------------------------------------------------------- */

interface SerializedSatellite {
  spec: GridSpec;
  t0: number;
  stepMs: number;
  steps: number;
  meta: SatelliteMeta;
  ghi: Array<number | null>;
  direct: Array<number | null>;
  diffuse: Array<number | null>;
  dni: Array<number | null>;
  clearGhi: Array<number | null>;
}

const pack = (a: Float32Array): Array<number | null> =>
  Array.from(a, (v) => (Number.isNaN(v) ? null : Math.round(v * 10) / 10));
const unpack = (a: Array<number | null>): Float32Array =>
  Float32Array.from(a, (v) => (v === null ? NaN : v));

const serialize = (d: SatelliteGridData): SerializedSatellite => ({
  spec: d.spec,
  t0: d.t0,
  stepMs: d.stepMs,
  steps: d.steps,
  meta: d.meta,
  ghi: pack(d.ghi),
  direct: pack(d.direct),
  diffuse: pack(d.diffuse),
  dni: pack(d.dni),
  clearGhi: pack(d.clearGhi),
});

const deserialize = (s: SerializedSatellite): SatelliteGridData => ({
  spec: s.spec,
  t0: s.t0,
  stepMs: s.stepMs,
  steps: s.steps,
  meta: s.meta,
  ghi: unpack(s.ghi),
  direct: unpack(s.direct),
  diffuse: unpack(s.diffuse),
  dni: unpack(s.dni),
  clearGhi: unpack(s.clearGhi),
});

/**
 * Llega un escaneo cada 10 min: TTL de 10 min. Se conserva hasta 6 h como respaldo
 * ("última observación válida") si la red falla.
 */
export const satelliteCache = new TtlCache<SerializedSatellite>({
  namespace: "fts:satellite",
  ttlMs: SATELLITE_CONFIG.ttlMs,
  maxStaleMs: SATELLITE_CONFIG.maxStaleMs,
  version: 1,
  persist: true,
});

const CACHE_KEY = () => {
  const b = SPEC.bounds;
  return `${SATELLITE_CONFIG.model}:${b.west},${b.east},${b.south},${b.north}:${SPEC.cols}x${SPEC.rows}`;
};

const retryDelay = (failures: number) => {
  const list = SATELLITE_CONFIG.retryMs;
  return list[Math.min(Math.max(failures - 1, 0), list.length - 1)];
};

/* -------------------------------------------------------------------------- */
/*  Campo y referencia (para la capa visual y la fusión)                       */
/* -------------------------------------------------------------------------- */

export interface SatelliteFieldSample {
  tDir: number;
  kt: number;
}

export interface SatelliteReference {
  origin: DataOrigin;
  sampleTime: number;
  leadMinutes: number;
  resolutionKm: number;
  temporalResolutionMinutes: number;
}

export interface SatelliteField {
  available: boolean;
  reference: SatelliteReference | null;
  sample(lng: number, lat: number, out: SatelliteFieldSample): boolean;
}

const UNAVAILABLE_FIELD: SatelliteField = { available: false, reference: null, sample: () => false };

/* -------------------------------------------------------------------------- */
/*  Servicio                                                                   */
/* -------------------------------------------------------------------------- */

class SatelliteService {
  private model: SatelliteGridModel | null = null;
  private loading = false;
  private failed = false;
  private failures = 0;
  private stalls = 0;
  private nextCheckAt = 0;
  private version = 0;
  private started = false;
  private timer = 0;
  private inflight: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private fieldMemo: { t: number; field: SatelliteField } | null = null;

  /* ------------------------------ suscripción ------------------------------ */

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

  /** Idempotente. Carga (caché o red) y se mantiene al día SOLO cuando se espera un escaneo nuevo. */
  start() {
    if (this.started) return;
    this.started = true;
    void this.refresh(false);
    this.timer = window.setInterval(this.tick, 30_000);
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
    if (Date.now() >= this.nextCheckAt) void this.refresh(true);
  }

  /**
   * Cuándo volver a preguntar: cuando se espera una muestra nueva (última + paso + latencia nominal),
   * nunca antes de `minRefreshMs`. Si la fuente no avanza, se espacia progresivamente: no se insiste
   * cada minuto sobre datos que no han cambiado.
   */
  private scheduleNext(prevLast: number | null) {
    const m = this.model;
    const now = Date.now();
    if (!m || m.lastObservedTime === null) {
      this.nextCheckAt = now + retryDelay(Math.max(1, this.failures));
      return;
    }
    const advanced = prevLast === null || m.lastObservedTime > prevLast;
    this.stalls = advanced ? 0 : this.stalls + 1;
    const stepMs = m.data.stepMs;
    const expected = m.lastObservedTime + stepMs + SATELLITE_CONFIG.nominalLatencyMinutes * MIN + MIN;
    const fetched = m.data.meta.fetchedAt;
    this.nextCheckAt = advanced
      ? Math.max(fetched + SATELLITE_CONFIG.minRefreshMs, expected)
      : fetched + Math.min(SATELLITE_CONFIG.ttlMs, (2 + 2 * this.stalls) * MIN);
  }

  /** `force = false` permite usar la caché fresca; `true` consulta a la fuente. */
  refresh(force = true): Promise<void> {
    if (this.inflight) return this.inflight;
    this.loading = true;
    if (!this.model) this.emit();

    const prevLast = this.model?.lastObservedTime ?? null;
    const key = CACHE_KEY();

    this.inflight = (async () => {
      try {
        if (!force) {
          const hit = satelliteCache.get(key);
          if (hit) {
            this.model = new SatelliteGridModel(deserialize(hit.value));
            this.failed = false;
            this.failures = 0;
            return;
          }
        }
        const data = await fetchSatelliteGrid(SPEC);
        satelliteCache.set(key, serialize(data), data.meta.fetchedAt);
        this.model = new SatelliteGridModel(data);
        this.failed = false;
        this.failures = 0;
      } catch {
        // Fallback: última observación válida guardada (se marcará como antigua si lo es).
        const old = satelliteCache.getAllowStale(key);
        if (old && !this.model) {
          this.model = new SatelliteGridModel(deserialize(old.value));
        }
        this.failed = true;
        this.failures += 1;
      }
    })()
      .finally(() => {
        this.loading = false;
        this.inflight = null;
        // Tras un fallo se espacia con espera creciente (no cada tic); si fue bien, se programa la
        // siguiente consulta para cuando se espera una muestra nueva.
        if (this.failed) this.nextCheckAt = Date.now() + retryDelay(this.failures);
        else this.scheduleNext(prevLast);
        this.emit();
      });
    return this.inflight;
  }

  hasData() {
    return this.model !== null && this.model.lastObservedTime !== null;
  }

  /** Instante de la última observación real (ms), o null. */
  getLastObservationAt(): number | null {
    return this.model?.lastObservedTime ?? null;
  }

  getCalibration(): { factor: number; source: "satellite" | "none"; samples: number } {
    return this.model?.calibration ?? { factor: 1, source: "none", samples: 0 };
  }

  getMeta(): SatelliteMeta | null {
    return this.model?.data.meta ?? null;
  }

  /* ------------------------------ consultas ------------------------------ */

  /** Radiación observada en un punto e instante (con su origen). null si no hay observación aplicable. */
  getRadiationAtPoint(
    latitude: number,
    longitude: number,
    timestamp: Date | number,
    now: number = Date.now()
  ): SatelliteRadiation | null {
    const t = typeof timestamp === "number" ? timestamp : timestamp.getTime();
    return this.pointSampler(latitude, longitude)(t, now);
  }

  /** Muestreador para un punto fijo (precalcula nodos y pesos): ideal para recorrer el día. */
  pointSampler(
    latitude: number,
    longitude: number
  ): (t: number, now?: number) => SatelliteRadiation | null {
    const model = this.model;
    if (!model) return () => null;
    const sampler = model.pointSampler(longitude, latitude);
    return (t, now = Date.now()) => {
      const raw = sampler(t);
      if (!raw) return null;
      const leadMin = raw.leadMs / MIN;
      if (raw.origin === "persistence" && leadMin > SATELLITE_CONFIG.maxUsefulPersistenceMinutes) {
        return null;
      }
      return this.build(model, raw, latitude, longitude, t, now);
    };
  }

  private build(
    model: SatelliteGridModel,
    raw: SatelliteRaw,
    latitude: number,
    longitude: number,
    t: number,
    now: number
  ): SatelliteRadiation {
    const meta = model.data.meta;
    const leadMin = raw.leadMs / MIN;
    const origin: DataOrigin =
      raw.origin === "observed"
        ? "observed"
        : raw.origin === "interpolated"
          ? "interpolated"
          : leadMin > SATELLITE_CONFIG.staleMinutes
            ? "stale"
            : "estimated";

    const finite = (v: number) => (Number.isFinite(v) ? v : undefined);
    const tDir = Number.isFinite(raw.tDir) ? raw.tDir : null;
    const kt = Number.isFinite(raw.kt) ? raw.kt : null;
    const consistency = satelliteConsistency(raw.tDir, raw.kt);

    // Confianza intrínseca de la muestra (sin contexto solar: elevación neutra).
    const w = calculateSourceWeight({
      kind: "satellite",
      available: true,
      leadMinutes: leadMin,
      sampleOrigin: raw.origin,
      ageMinutes: Math.max(0, (now - raw.sampleTime) / MIN),
      spatialResolutionKm: meta.resolutionKm,
      temporalResolutionMinutes: meta.temporalResolutionMinutes,
      agreement: consistency,
      coverage: clamp(raw.coverage, 0, 1),
      solarElevationDeg: 45,
    });

    return {
      latitude,
      longitude,
      timestamp: new Date(t),
      shortwaveRadiation: finite(raw.ghi),
      directRadiation: finite(raw.direct),
      diffuseRadiation: finite(raw.diffuse),
      directNormalIrradiance: finite(raw.dni),
      clearSkyShortwave: finite(raw.clearGhi),
      source: meta.label,
      nativeResolution: `${String(meta.resolutionKm).replace(".", ",")} km · ${meta.temporalResolutionMinutes} min`,
      observed: origin === "observed",
      delayMinutes:
        model.lastObservedTime !== null
          ? Math.max(0, Math.round((meta.fetchedAt - model.lastObservedTime) / MIN))
          : undefined,
      confidence: w.weight,
      updatedAt: new Date(meta.fetchedAt),
      origin,
      sampleTime: new Date(raw.sampleTime),
      leadMinutes: leadMin,
      directTransmission: tDir,
      clearSkyIndex: kt,
      consistency: Number.isFinite(consistency) ? consistency : null,
      resolutionKm: meta.resolutionKm,
      temporalResolutionMinutes: meta.temporalResolutionMinutes,
      spatialCoverage: clamp(raw.coverage, 0, 1),
    };
  }

  /** Campo de toda la rejilla en un instante (lo usa la capa visual). */
  fieldAt(t: number): SatelliteField {
    const model = this.model;
    if (!model) return UNAVAILABLE_FIELD;
    if (this.fieldMemo && this.fieldMemo.t === t) return this.fieldMemo.field;

    const snap = model.snapshotAt(t);
    const meta = model.data.meta;
    let field: SatelliteField = UNAVAILABLE_FIELD;
    if (snap) {
      const leadMin = snap.plan.leadMs / MIN;
      if (snap.plan.mode !== "persistence" || leadMin <= SATELLITE_CONFIG.maxUsefulPersistenceMinutes) {
        const origin: DataOrigin =
          snap.plan.mode === "observed"
            ? "observed"
            : snap.plan.mode === "interpolated"
              ? "interpolated"
              : leadMin > SATELLITE_CONFIG.staleMinutes
                ? "stale"
                : "estimated";
        field = {
          available: true,
          reference: {
            origin,
            sampleTime: snap.plan.sampleTime,
            leadMinutes: leadMin,
            resolutionKm: meta.resolutionKm,
            temporalResolutionMinutes: meta.temporalResolutionMinutes,
          },
          sample(lng, lat, out) {
            const r = snap.sample(lng, lat);
            if (!r) return false;
            out.tDir = r.tDir;
            out.kt = r.kt;
            return Number.isFinite(r.tDir) || Number.isFinite(r.kt);
          },
        };
      }
    }
    this.fieldMemo = { t, field };
    return field;
  }

  /* ------------------------------ estado ------------------------------ */

  getStatus(now: number = Date.now()): SatelliteStatus {
    const model = this.model;
    const empty = {
      resolutionKm: null,
      temporalResolutionMinutes: null,
      lastObservationAt: null,
      latencyMinutes: null,
      ageMs: null,
      fetchedAt: null,
      source: null,
      attribution: null,
      refreshing: this.loading,
      calibration: { factor: 1, source: "none" as const },
    };
    if (!model || model.lastObservedTime === null) {
      const loading = !this.failed && this.loading;
      return {
        ...empty,
        state: loading || (!this.failed && !model) ? "loading" : "unavailable",
        quality: "unavailable",
        origin: "unavailable",
      };
    }

    const meta = model.data.meta;
    const ageMs = Math.max(0, now - model.lastObservedTime);
    const ageMin = ageMs / MIN;
    const stale = ageMin > SATELLITE_CONFIG.staleMinutes;
    const quality: DataQuality =
      ageMin <= SATELLITE_CONFIG.freshMinutes ? "high" : stale ? "outdated" : "estimated";

    return {
      state: stale ? "stale" : "ready",
      quality,
      origin: stale ? "stale" : "observed",
      source: meta.source,
      attribution: meta.attribution,
      resolutionKm: meta.resolutionKm,
      temporalResolutionMinutes: meta.temporalResolutionMinutes,
      lastObservationAt: model.lastObservedTime,
      latencyMinutes: Math.max(0, Math.round((meta.fetchedAt - model.lastObservedTime) / MIN)),
      ageMs,
      fetchedAt: meta.fetchedAt,
      refreshing: this.loading,
      calibration: { factor: model.calibration.factor, source: model.calibration.source },
    };
  }
}

export const satelliteService = new SatelliteService();

/** API de módulo. */
export const getSatelliteRadiationAtPoint = (
  latitude: number,
  longitude: number,
  timestamp: Date | number,
  now?: number
) => satelliteService.getRadiationAtPoint(latitude, longitude, timestamp, now);
