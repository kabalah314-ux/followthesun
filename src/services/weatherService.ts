import {
  DATA_SOURCES,
  WEATHER_API,
  WEATHER_CACHE_TTL,
  WEATHER_CONFIG,
  WEATHER_GRID,
} from "../config";
import { TtlCache } from "../lib/cache";
import {
  HOUR_MS,
  type GridSpec,
  type WeatherGridData,
  type WeatherMeta,
} from "../lib/cloudInterpolation";
import { clamp } from "../lib/coordinates";
import {
  calculateClearSkyValues,
  dniIndex,
  modelTransmission,
} from "../lib/radiationCalculations";
import { daylightSecondsInInterval } from "../lib/sunlightCalculations";

/**
 * weatherService — obtención y normalización de datos del MODELO meteorológico. Nada más.
 *
 * Proveedor real: Open-Meteo con modelos de Météo-France.
 *   · AROME France   2,5 km · hora a hora · se actualiza cada 3 h   (principal)
 *   · ARPEGE Europe  11 km  · hora a hora · se actualiza cada 6 h   (contraste y respaldo)
 * Variables: nubosidad total / baja / media / alta, DNI y GHI instantáneas, `sunshine_duration`.
 *
 * Qué NO es: no es una observación ni un nowcast. Es salida de un modelo numérico. La observación
 * del presente la aporta `satelliteService`; la fusión, `lightFusionService`.
 *
 * ── Semántica de `sunshine_duration` (revisada) ───────────────────────────────────────────────
 *  · Marca de tiempo: con `timeformat=unixtime` TODAS las marcas son GMT+0 (epoch); no hay DST ni
 *    zona horaria que resolver. La conversión a Europe/Madrid ocurre solo al mostrar.
 *  · Intervalo: SUMA de la hora ANTERIOR (t − 1 h, t]. La documentación de Open-Meteo lo declara
 *    ("Preceding hour sum") y los datos de AROME lo confirman: comparando la serie horaria con la de
 *    15 min del mismo modelo, la hipótesis "hora anterior" da un error acumulado de ≈1.295 s y la
 *    de "hora siguiente" de ≈7.875 s (test: `sunshineSemantics.test.ts`).
 *  · Alineación: el valor i se centra en t_i − 30 min (`sunshineOffsetMs`). La nubosidad y la
 *    radiación `_instant` son instantáneas (sin offset).
 *  · Naturaleza: es una cantidad DERIVADA (segundos con DNI > 120 W/m², y esa DNI sale de un modelo
 *    de descomposición del GHI). Se trata como ESTIMADA: peso bajo en `MODEL_SIGNAL_WEIGHTS`.
 */

export { WEATHER_CACHE_TTL };

export const SUNSHINE_SEMANTICS =
  "suma de la hora precedente (alineada −30 min) · derivada de DNI > 120 W/m² · estimada";

const PRIMARY = {
  id: "meteofrance_arome_france",
  name: "AROME France",
  km: 2.5,
  baseConfidence: 0.8,
} as const;

const SECONDARY = {
  id: "meteofrance_arpege_europe",
  name: "ARPEGE Europe",
  km: 11,
  baseConfidence: 0.58,
} as const;

const HOURLY_VARIABLES = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "sunshine_duration",
  "direct_normal_irradiance_instant",
  "shortwave_radiation_instant",
] as const;

/** Horas de sol posibles: el sol debe estar a más de ~6° para superar el umbral de la OMM. */
const MIN_DAYLIGHT_SECONDS = 600;

export type WeatherErrorKind = "network" | "timeout" | "rate-limit" | "http" | "parse";

/** Error interno: la interfaz nunca lo muestra tal cual. */
export class WeatherError extends Error {
  readonly kind: WeatherErrorKind;
  constructor(kind: WeatherErrorKind, message: string) {
    super(message);
    this.name = "WeatherError";
    this.kind = kind;
  }
}

export interface WeatherProvider {
  id: string;
  /** Si el resultado puede guardarse en la caché. */
  cacheable: boolean;
  fetchGrid(spec: GridSpec): Promise<WeatherGridData>;
}

/* -------------------------------------------------------------------------- */
/*  Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

export function gridNodeCoordinates(spec: GridSpec): Array<{ lat: number; lng: number }> {
  const { bounds: b, cols, rows } = spec;
  const out: Array<{ lat: number; lng: number }> = [];
  for (let j = 0; j < rows; j++) {
    const lat = b.south + (j / (rows - 1)) * (b.north - b.south);
    for (let i = 0; i < cols; i++) {
      const lng = b.west + (i / (cols - 1)) * (b.east - b.west);
      out.push({ lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 });
    }
  }
  return out;
}

const unit = (v: unknown, scale: number): number =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v / scale, 0, 1) : NaN;

const raw = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : NaN;

const at = (arr: unknown, i: number): unknown => (Array.isArray(arr) ? arr[i] : undefined);

interface ModelSeries {
  cloud: unknown;
  low: unknown;
  mid: unknown;
  high: unknown;
  sun: unknown;
  dni: unknown;
  ghi: unknown;
}

function modelSeries(hourly: Record<string, unknown>, model: string): ModelSeries {
  return {
    cloud: hourly[`cloud_cover_${model}`],
    low: hourly[`cloud_cover_low_${model}`],
    mid: hourly[`cloud_cover_mid_${model}`],
    high: hourly[`cloud_cover_high_${model}`],
    sun: hourly[`sunshine_duration_${model}`],
    dni: hourly[`direct_normal_irradiance_instant_${model}`],
    ghi: hourly[`shortwave_radiation_instant_${model}`],
  };
}

/** GET JSON con límite de tiempo y errores tipados (compartido con `satelliteService`). */
export async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) throw new WeatherError("rate-limit", "Open-Meteo rate limit");
    if (!res.ok) throw new WeatherError("http", `Open-Meteo HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof WeatherError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new WeatherError("timeout", "Open-Meteo timeout");
    }
    throw new WeatherError("network", "Open-Meteo unreachable");
  } finally {
    window.clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/*  Proveedor: Open-Meteo (AROME + ARPEGE)                                     */
/* -------------------------------------------------------------------------- */

interface OpenMeteoLocation {
  hourly?: Record<string, unknown>;
  error?: boolean;
  reason?: string;
}

export const openMeteoProvider: WeatherProvider = {
  id: "open-meteo",
  cacheable: true,

  async fetchGrid(spec) {
    const nodes = gridNodeCoordinates(spec);
    const lats = nodes.map((n) => n.lat).join(",");
    const lngs = nodes.map((n) => n.lng).join(",");

    let url =
      `${WEATHER_API.baseUrl}/v1/forecast?latitude=${lats}&longitude=${lngs}` +
      `&hourly=${HOURLY_VARIABLES.join(",")}` +
      `&models=${PRIMARY.id},${SECONDARY.id}` +
      `&timeformat=unixtime&past_days=${WEATHER_CONFIG.pastDays}&forecast_days=${WEATHER_CONFIG.forecastDays}`;
    if (WEATHER_API.apiKey) url += `&apikey=${encodeURIComponent(WEATHER_API.apiKey)}`;

    const json = await fetchJson(url, WEATHER_CONFIG.requestTimeoutMs);
    const list = (Array.isArray(json) ? json : [json]) as OpenMeteoLocation[];
    if (list.length !== nodes.length || list.some((l) => !l || l.error || !l.hourly)) {
      throw new WeatherError("parse", "Unexpected Open-Meteo response");
    }

    const times = list[0].hourly!["time"];
    if (!Array.isArray(times) || times.length < 3) throw new WeatherError("parse", "No time axis");
    const hours = times.length;
    const t0 = Number(times[0]) * 1000;
    const stepMs = (Number(times[1]) - Number(times[0])) * 1000;
    if (!Number.isFinite(t0) || stepMs !== HOUR_MS) throw new WeatherError("parse", "Unexpected time step");

    // Horas de sol posibles en cada intervalo (para normalizar sunshine_duration) y DNI de cielo
    // despejado en cada marca horaria (para convertir la DNI del modelo en un índice 0-1).
    const b = spec.bounds;
    const cLat = (b.north + b.south) / 2;
    const cLng = (b.east + b.west) / 2;
    const possible = new Float64Array(hours);
    const clearDni = new Float64Array(hours);
    for (let h = 0; h < hours; h++) {
      const t = t0 + h * HOUR_MS;
      possible[h] = daylightSecondsInInterval(t - HOUR_MS, t, cLat, cLng);
      clearDni[h] = calculateClearSkyValues(cLat, cLng, t).dni;
    }
    const sunFraction = (sec: unknown, h: number) =>
      typeof sec === "number" && Number.isFinite(sec) && possible[h] >= MIN_DAYLIGHT_SECONDS
        ? clamp(sec / possible[h], 0, 1)
        : NaN;

    const size = nodes.length * hours;
    const nanF = () => new Float32Array(size).fill(NaN);
    const cloud = nanF();
    const low = nanF();
    const mid = nanF();
    const high = nanF();
    const sunshine = nanF();
    const radiation = nanF();
    const dniRaw = nanF();
    const ghiRaw = nanF();
    const spread = nanF();
    const fallback = new Uint8Array(size);

    for (let n = 0; n < nodes.length; n++) {
      const hourly = list[n].hourly!;
      const P = modelSeries(hourly, PRIMARY.id);
      const S = modelSeries(hourly, SECONDARY.id);
      for (let h = 0; h < hours; h++) {
        const pc = unit(at(P.cloud, h), 100);
        const pl = unit(at(P.low, h), 100);
        const pm = unit(at(P.mid, h), 100);
        const ph = unit(at(P.high, h), 100);
        const ps = sunFraction(at(P.sun, h), h);
        const pd = raw(at(P.dni, h));
        const pg = raw(at(P.ghi, h));
        const pr = dniIndex(pd, clearDni[h]);

        const sc = unit(at(S.cloud, h), 100);
        const sl = unit(at(S.low, h), 100);
        const sm = unit(at(S.mid, h), 100);
        const sh = unit(at(S.high, h), 100);
        const ss = sunFraction(at(S.sun, h), h);
        const sd = raw(at(S.dni, h));
        const sg = raw(at(S.ghi, h));
        const sr = dniIndex(sd, clearDni[h]);
        const idx = n * hours + h;

        if (!Number.isNaN(pc)) {
          cloud[idx] = pc;
          low[idx] = pl;
          mid[idx] = pm;
          high[idx] = ph;
          sunshine[idx] = ps;
          radiation[idx] = pr;
          dniRaw[idx] = pd;
          ghiRaw[idx] = pg;
          if (!Number.isNaN(sc)) {
            const tp = modelTransmission({ cloud: pc, low: pl, mid: pm, high: ph, sunshine: ps, radiation: pr }).value;
            const ts = modelTransmission({ cloud: sc, low: sl, mid: sm, high: sh, sunshine: ss, radiation: sr }).value;
            if (Number.isFinite(tp) && Number.isFinite(ts)) spread[idx] = Math.abs(tp - ts);
          }
        } else if (!Number.isNaN(sc)) {
          cloud[idx] = sc;
          low[idx] = sl;
          mid[idx] = sm;
          high[idx] = sh;
          sunshine[idx] = ss;
          radiation[idx] = sr;
          dniRaw[idx] = sd;
          ghiRaw[idx] = sg;
          fallback[idx] = 1;
        }
      }
    }

    const meta: WeatherMeta = {
      providerId: "open-meteo",
      label: `Open-Meteo · ${PRIMARY.name} ${String(PRIMARY.km).replace(".", ",")} km`,
      attribution: "Open-Meteo.com · Météo-France (CC BY 4.0)",
      primaryModel: PRIMARY.name,
      fallbackModel: SECONDARY.name,
      resolutionKm: PRIMARY.km,
      fallbackResolutionKm: SECONDARY.km,
      baseConfidence: PRIMARY.baseConfidence,
      fallbackBaseConfidence: SECONDARY.baseConfidence,
      simulated: false,
      fetchedAt: Date.now(),
      sunshineSemantics: SUNSHINE_SEMANTICS,
    };

    return {
      spec,
      t0,
      stepMs,
      hours,
      sunshineOffsetMs: -HOUR_MS / 2,
      cloud,
      low,
      mid,
      high,
      sunshine,
      radiation,
      dni: dniRaw,
      ghi: ghiRaw,
      spread,
      fallback,
      meta,
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Proveedor de demostración (solo desarrollo: `?weather=demo`)               */
/* -------------------------------------------------------------------------- */

export const demoProvider: WeatherProvider = {
  id: "demo",
  cacheable: false,

  async fetchGrid(spec) {
    const nodes = gridNodeCoordinates(spec);
    const hours = 72;
    const t0 = Math.floor((Date.now() - 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
    const size = nodes.length * hours;
    const cloud = new Float32Array(size);
    const low = new Float32Array(size);
    const mid = new Float32Array(size);
    const high = new Float32Array(size);
    const sunshine = new Float32Array(size).fill(NaN);
    const radiation = new Float32Array(size).fill(NaN);
    const dni = new Float32Array(size).fill(NaN);
    const ghi = new Float32Array(size).fill(NaN);
    const spread = new Float32Array(size).fill(NaN);
    const fallback = new Uint8Array(size);

    nodes.forEach((node, n) => {
      for (let h = 0; h < hours; h++) {
        const hh = (t0 + h * HOUR_MS) / HOUR_MS;
        const slow = Math.sin(hh * 0.21 + 1.3) * 0.5 + 0.5;
        const patch = Math.sin(node.lng * 53 + node.lat * 37 + hh * 0.35) * 0.5 + 0.5;
        const c = clamp(0.12 + 0.45 * slow + 0.4 * patch * slow, 0.02, 0.98);
        const idx = n * hours + h;
        cloud[idx] = c;
        low[idx] = c * (0.45 + 0.5 * patch);
        mid[idx] = c * 0.35;
        high[idx] = clamp(c * 0.9 + 0.1 * patch, 0, 1);
      }
    });

    return {
      spec,
      t0,
      stepMs: HOUR_MS,
      hours,
      sunshineOffsetMs: -HOUR_MS / 2,
      cloud,
      low,
      mid,
      high,
      sunshine,
      radiation,
      dni,
      ghi,
      spread,
      fallback,
      meta: {
        providerId: "demo",
        label: "Demostración · datos simulados",
        attribution: "Datos sintéticos generados en el navegador",
        primaryModel: "Simulación",
        fallbackModel: null,
        resolutionKm: 5,
        fallbackResolutionKm: null,
        baseConfidence: 0.15,
        fallbackBaseConfidence: 0.15,
        simulated: true,
        fetchedAt: Date.now(),
        sunshineSemantics: "no aplica (datos sintéticos)",
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Caché del modelo (weatherModelCache)                                       */
/* -------------------------------------------------------------------------- */

interface SerializedGrid {
  spec: GridSpec;
  t0: number;
  stepMs: number;
  hours: number;
  sunshineOffsetMs: number;
  meta: WeatherMeta;
  cloud: Array<number | null>;
  low: Array<number | null>;
  mid: Array<number | null>;
  high: Array<number | null>;
  sunshine: Array<number | null>;
  radiation: Array<number | null>;
  dni: Array<number | null>;
  ghi: Array<number | null>;
  spread: Array<number | null>;
  fallback: number[];
}

const pack = (a: Float32Array): Array<number | null> =>
  Array.from(a, (v) => (Number.isNaN(v) ? null : Math.round(v * 1000) / 1000));

const unpack = (a: Array<number | null>): Float32Array =>
  Float32Array.from(a, (v) => (v === null ? NaN : v));

function serialize(d: WeatherGridData): SerializedGrid {
  return {
    spec: d.spec,
    t0: d.t0,
    stepMs: d.stepMs,
    hours: d.hours,
    sunshineOffsetMs: d.sunshineOffsetMs,
    meta: d.meta,
    cloud: pack(d.cloud),
    low: pack(d.low),
    mid: pack(d.mid),
    high: pack(d.high),
    sunshine: pack(d.sunshine),
    radiation: pack(d.radiation),
    dni: pack(d.dni),
    ghi: pack(d.ghi),
    spread: pack(d.spread),
    fallback: Array.from(d.fallback),
  };
}

function deserialize(s: SerializedGrid): WeatherGridData {
  return {
    spec: s.spec,
    t0: s.t0,
    stepMs: s.stepMs,
    hours: s.hours,
    sunshineOffsetMs: s.sunshineOffsetMs,
    meta: s.meta,
    cloud: unpack(s.cloud),
    low: unpack(s.low),
    mid: unpack(s.mid),
    high: unpack(s.high),
    sunshine: unpack(s.sunshine),
    radiation: unpack(s.radiation),
    dni: unpack(s.dni),
    ghi: unpack(s.ghi),
    spread: unpack(s.spread),
    fallback: Uint8Array.from(s.fallback),
  };
}

/**
 * Caché persistente (localStorage) del MODELO. Su TTL sigue la cadencia de AROME (cada 3 h): 30 min.
 * Es independiente de la caché satelital (10 min). Versión 2: el formato añadió DNI/GHI.
 */
export const weatherCache = new TtlCache<SerializedGrid>({
  namespace: "fts:weather",
  ttlMs: WEATHER_CACHE_TTL,
  maxStaleMs: WEATHER_CONFIG.maxStaleMs,
  version: 2,
  persist: true,
});

/* -------------------------------------------------------------------------- */
/*  Servicio                                                                   */
/* -------------------------------------------------------------------------- */

export interface WeatherLoadResult {
  data: WeatherGridData;
  fromCache: boolean;
  /** true si la red falló y se devuelve el último dato guardado (caducado). */
  stale: boolean;
}

const defaultSpec: GridSpec = {
  bounds: WEATHER_GRID.bounds,
  cols: WEATHER_GRID.cols,
  rows: WEATHER_GRID.rows,
};

let provider: WeatherProvider = DATA_SOURCES.weather === "demo" ? demoProvider : openMeteoProvider;
const inflight = new Map<string, Promise<WeatherLoadResult>>();

const cacheKey = (p: WeatherProvider, spec: GridSpec) => {
  const b = spec.bounds;
  return `${p.id}:${b.west},${b.east},${b.south},${b.north}:${spec.cols}x${spec.rows}`;
};

export const weatherService = {
  getProvider: () => provider,
  setProvider(p: WeatherProvider) {
    provider = p;
  },

  /**
   * Devuelve la malla del modelo. Orden de preferencia:
   *   1. caché fresca (sin red)  2. red  3. caché caducada si la red falla  4. error.
   * Las peticiones simultáneas se comparten.
   */
  load(spec: GridSpec = defaultSpec, opts: { force?: boolean } = {}): Promise<WeatherLoadResult> {
    const p = provider;
    const key = cacheKey(p, spec);

    if (p.cacheable && !opts.force) {
      const hit = weatherCache.get(key);
      if (hit) {
        return Promise.resolve({ data: deserialize(hit.value), fromCache: true, stale: false });
      }
    }

    const running = inflight.get(key);
    if (running) return running;

    const task = (async (): Promise<WeatherLoadResult> => {
      try {
        const data = await p.fetchGrid(spec);
        if (p.cacheable) weatherCache.set(key, serialize(data), data.meta.fetchedAt);
        return { data, fromCache: false, stale: false };
      } catch (err) {
        const old = p.cacheable ? weatherCache.getAllowStale(key) : null;
        if (old) return { data: deserialize(old.value), fromCache: true, stale: true };
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, task);
    return task;
  },

  clearCache() {
    weatherCache.clear();
  },
};
