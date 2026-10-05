import type { GeoBounds } from "../types";
import { clamp } from "./coordinates";

/**
 * Rejilla meteorológica e interpolación — independiente del proveedor y del mapa.
 *
 * Los proveedores entregan, para cada nodo de una malla regular, series HORARIAS. Aquí se resuelve
 * cualquier consulta (lat, lng, instante) con:
 *   · interpolación TEMPORAL lineal entre horas (12:00 → 0,20 y 13:00 → 0,40  ⇒  12:30 → 0,30)
 *   · interpolación ESPACIAL bilineal entre los 4 nodos que rodean el punto
 * Si falta algún nodo o alguna hora, los pesos se renormalizan con lo que hay; si no hay nada, la
 * consulta devuelve "sin dato" (NaN / false) y nunca un valor inventado.
 */

export const HOUR_MS = 3_600_000;

/** Canales por nodo y hora. */
export const NCH = 10;
/** Canales que se mezclan numéricamente (todos menos `fallback`). */
const NUM = 9;
const CH = {
  cloud: 0,
  low: 1,
  mid: 2,
  high: 3,
  sun: 4,
  rad: 5,
  dni: 6,
  ghi: 7,
  spread: 8,
  fallback: 9,
} as const;

export interface GridSpec {
  bounds: GeoBounds;
  cols: number;
  rows: number;
}

export interface WeatherMeta {
  providerId: string;
  /** Texto corto para la interfaz, p. ej. "Open-Meteo · AROME 2,5 km". */
  label: string;
  attribution: string;
  primaryModel: string;
  fallbackModel: string | null;
  resolutionKm: number;
  fallbackResolutionKm: number | null;
  /** Confianza base del modelo principal / del de respaldo. */
  baseConfidence: number;
  fallbackBaseConfidence: number;
  simulated: boolean;
  /** Cuándo se consultó a la fuente (ms). */
  fetchedAt: number;
  /** Cómo se interpreta `sunshine_duration` (ver README). */
  sunshineSemantics: string;
}

/**
 * Datos de la malla: arrays planos `[nodo * hours + hora]` con NaN donde no hay dato.
 * Nodo = fila (sur→norte) * cols + columna (oeste→este).
 */
export interface WeatherGridData {
  spec: GridSpec;
  /** Primera hora (ms epoch) y paso (ms). */
  t0: number;
  stepMs: number;
  hours: number;
  /**
   * `sunshine_duration` es la SUMA de la hora ANTERIOR (verificado: documentación de Open-Meteo y
   * comparación con la serie de 15 min de AROME): el valor i está centrado en t_i − 30 min.
   * La nubosidad y la radiación `_instant` son instantáneas (offset 0).
   */
  sunshineOffsetMs: number;
  cloud: Float32Array;
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
  /** Fracción de sol (0-1), ya normalizada por las horas de sol posibles. ESTIMADA. */
  sunshine: Float32Array;
  /** DNI instantánea del modelo / DNI de cielo despejado calculada (SIN calibrar). NaN con sol bajo. */
  radiation: Float32Array;
  /** DNI y GHI instantáneas del modelo (W/m²), para mostrar. */
  dni: Float32Array;
  ghi: Float32Array;
  /** Desacuerdo entre modelos (0-1) en la transmisión del haz directo; NaN si solo hay un modelo. */
  spread: Float32Array;
  /** 1 donde se usó el modelo de respaldo (menor resolución). */
  fallback: Uint8Array;
  meta: WeatherMeta;
}

/** Resultado (mutable, reutilizable) de muestrear la malla en un punto e instante. */
export interface WeatherSample {
  cloud: number;
  low: number;
  mid: number;
  high: number;
  sunshine: number;
  radiation: number;
  dni: number;
  ghi: number;
  spread: number;
  /** 0-1 · parte del soporte que procede del modelo de respaldo. */
  fallbackShare: number;
  /** 0-1 · peso espacial con dato real (1 = los 4 nodos). */
  coverage: number;
  /** Celdas fuera de la malla (0 = dentro). */
  outside: number;
}

export const createWeatherSample = (): WeatherSample => ({
  cloud: NaN,
  low: NaN,
  mid: NaN,
  high: NaN,
  sunshine: NaN,
  radiation: NaN,
  dni: NaN,
  ghi: NaN,
  spread: NaN,
  fallbackShare: 0,
  coverage: 0,
  outside: 0,
});

export const interpolateLinear = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * Muestrea una serie horaria en el índice fraccionario `idx`.
 * Interpola entre las dos horas vecinas; con una sola válida la usa si está a menos de media hora.
 * Fuera del rango (más de media hora) devuelve NaN: nunca extrapola.
 */
export function sampleHourly(arr: Float32Array, base: number, hours: number, idx: number): number {
  if (idx < -0.5 || idx > hours - 0.5) return NaN;
  const i0 = Math.floor(idx);
  const f = idx - i0;
  const a = i0 >= 0 && i0 < hours ? arr[base + i0] : NaN;
  const b = i0 + 1 >= 0 && i0 + 1 < hours ? arr[base + i0 + 1] : NaN;
  const hasA = !Number.isNaN(a);
  const hasB = !Number.isNaN(b);
  if (hasA && hasB) return a + (b - a) * f;
  if (hasA && f < 0.5) return a;
  if (hasB && f >= 0.5) return b;
  return NaN;
}

/* -------------------------------------------------------------------------- */
/*  Interpolación espacial                                                     */
/* -------------------------------------------------------------------------- */

export interface GridLocation {
  i0: number;
  j0: number;
  fx: number;
  fy: number;
  outside: number;
}

export function locateInGrid(spec: GridSpec, lng: number, lat: number, out: GridLocation): GridLocation {
  const { bounds: b, cols, rows } = spec;
  const gx = ((lng - b.west) / (b.east - b.west)) * (cols - 1);
  const gy = ((lat - b.south) / (b.north - b.south)) * (rows - 1);
  const ox = Math.max(0, -gx, gx - (cols - 1));
  const oy = Math.max(0, -gy, gy - (rows - 1));
  out.outside = Math.hypot(ox, oy);
  const cx = clamp(gx, 0, cols - 1 - 1e-6);
  const cy = clamp(gy, 0, rows - 1 - 1e-6);
  out.i0 = Math.floor(cx);
  out.j0 = Math.floor(cy);
  out.fx = cx - out.i0;
  out.fy = cy - out.j0;
  return out;
}

/** Pesos bilineales y desplazamientos de los 4 nodos que rodean una posición. */
export function bilinearWeights(
  loc: GridLocation,
  cols: number,
  stride: number,
  w: number[],
  offs: number[]
) {
  const n00 = loc.j0 * cols + loc.i0;
  offs[0] = n00 * stride;
  offs[1] = (n00 + 1) * stride;
  offs[2] = (n00 + cols) * stride;
  offs[3] = (n00 + cols + 1) * stride;
  w[0] = (1 - loc.fx) * (1 - loc.fy);
  w[1] = loc.fx * (1 - loc.fy);
  w[2] = (1 - loc.fx) * loc.fy;
  w[3] = loc.fx * loc.fy;
}

/**
 * Mezcla bilineal de 4 nodos con renormalización de pesos donde falta algún dato:
 * `sum[ch] / wsum[ch]` es el valor del canal; `wsum[ch] = 0` significa "sin dato".
 */
export function blendNodes(
  vals: Float64Array,
  offs: readonly number[],
  w: readonly number[],
  nch: number,
  sum: Float64Array,
  wsum: Float64Array
) {
  sum.fill(0);
  wsum.fill(0);
  for (let k = 0; k < 4; k++) {
    const wk = w[k];
    if (wk <= 0) continue;
    const o = offs[k];
    for (let ch = 0; ch < nch; ch++) {
      const v = vals[o + ch];
      if (!Number.isNaN(v)) {
        sum[ch] += wk * v;
        wsum[ch] += wk;
      }
    }
  }
}

const SUM = new Float64Array(NUM);
const WSUM = new Float64Array(NUM);

function blend(
  vals: Float64Array,
  offs: readonly number[],
  w: readonly number[],
  outside: number,
  out: WeatherSample
): boolean {
  blendNodes(vals, offs, w, NUM, SUM, WSUM);
  let fb = 0;
  let fbw = 0;
  for (let k = 0; k < 4; k++) {
    const wk = w[k];
    if (wk <= 0) continue;
    const o = offs[k];
    if (!Number.isNaN(vals[o + CH.cloud])) {
      fb += wk * vals[o + CH.fallback];
      fbw += wk;
    }
  }
  if (WSUM[CH.cloud] <= 1e-6) {
    out.cloud = NaN;
    out.low = NaN;
    out.mid = NaN;
    out.high = NaN;
    out.sunshine = NaN;
    out.radiation = NaN;
    out.dni = NaN;
    out.ghi = NaN;
    out.spread = NaN;
    out.fallbackShare = 0;
    out.coverage = 0;
    out.outside = outside;
    return false;
  }
  const at = (ch: number) => (WSUM[ch] > 1e-6 ? SUM[ch] / WSUM[ch] : NaN);
  out.cloud = SUM[CH.cloud] / WSUM[CH.cloud];
  out.low = at(CH.low);
  out.mid = at(CH.mid);
  out.high = at(CH.high);
  out.sunshine = at(CH.sun);
  out.radiation = at(CH.rad);
  out.dni = at(CH.dni);
  out.ghi = at(CH.ghi);
  out.spread = at(CH.spread);
  out.fallbackShare = fbw > 0 ? fb / fbw : 0;
  out.coverage = WSUM[CH.cloud];
  out.outside = outside;
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Modelo de la malla                                                         */
/* -------------------------------------------------------------------------- */

export type PointSampler = (t: number, out: WeatherSample) => boolean;

export class WeatherGridModel {
  readonly data: WeatherGridData;
  readonly nodes: number;
  /** Primera y última hora con datos (ms). */
  readonly start: number;
  readonly end: number;
  /** Fracción de nodos con datos en al menos el 40 % de las horas. */
  readonly coverageFraction: number;

  constructor(data: WeatherGridData) {
    this.data = data;
    this.nodes = data.spec.cols * data.spec.rows;
    this.start = data.t0;
    this.end = data.t0 + (data.hours - 1) * data.stepMs;

    let valid = 0;
    for (let n = 0; n < this.nodes; n++) {
      let count = 0;
      for (let h = 0; h < data.hours; h++) if (!Number.isNaN(data.cloud[n * data.hours + h])) count++;
      if (count >= data.hours * 0.4) valid++;
    }
    this.coverageFraction = this.nodes > 0 ? valid / this.nodes : 0;
  }

  /** ¿Hay datos para ese instante (con media hora de tolerancia en los extremos)? */
  inRange(t: number, tolMs = 30 * 60_000) {
    return t >= this.start - tolMs && t <= this.end + tolMs;
  }

  /** Interpolación TEMPORAL de un nodo en el instante `t`, escrita en `out[o .. o+NCH)`. */
  nodeAt(n: number, t: number, out: Float64Array, o: number) {
    const d = this.data;
    const base = n * d.hours;
    const idx = (t - d.t0) / d.stepMs;
    const idxSun = (t - d.sunshineOffsetMs - d.t0) / d.stepMs;
    out[o + CH.cloud] = sampleHourly(d.cloud, base, d.hours, idx);
    out[o + CH.low] = sampleHourly(d.low, base, d.hours, idx);
    out[o + CH.mid] = sampleHourly(d.mid, base, d.hours, idx);
    out[o + CH.high] = sampleHourly(d.high, base, d.hours, idx);
    out[o + CH.sun] = sampleHourly(d.sunshine, base, d.hours, idxSun);
    out[o + CH.rad] = sampleHourly(d.radiation, base, d.hours, idx);
    out[o + CH.dni] = sampleHourly(d.dni, base, d.hours, idx);
    out[o + CH.ghi] = sampleHourly(d.ghi, base, d.hours, idx);
    out[o + CH.spread] = sampleHourly(d.spread, base, d.hours, idx);
    const hi = clamp(Math.round(idx), 0, d.hours - 1);
    out[o + CH.fallback] = d.fallback[base + hi];
  }

  /** Parte de los datos de las próximas horas que procede del modelo principal (alta resolución). */
  primaryShare(now: number): number {
    const d = this.data;
    const h0 = clamp(Math.floor((now - 6 * HOUR_MS - d.t0) / d.stepMs), 0, d.hours - 1);
    const h1 = clamp(Math.ceil((now + 12 * HOUR_MS - d.t0) / d.stepMs), 0, d.hours - 1);
    let total = 0;
    let primary = 0;
    for (let n = 0; n < this.nodes; n++) {
      for (let h = h0; h <= h1; h++) {
        const idx = n * d.hours + h;
        if (Number.isNaN(d.cloud[idx])) continue;
        total++;
        if (d.fallback[idx] === 0) primary++;
      }
    }
    return total > 0 ? primary / total : 0;
  }

  /** Instantánea de toda la malla en un instante: consultas espaciales baratas durante un fotograma. */
  snapshotAt(t: number): WeatherSnapshot {
    return new WeatherSnapshot(this, t);
  }

  /** Muestreador optimizado para un punto fijo: precalcula nodos y pesos. */
  pointSampler(lng: number, lat: number): PointSampler {
    const spec = this.data.spec;
    const loc = locateInGrid(spec, lng, lat, { i0: 0, j0: 0, fx: 0, fy: 0, outside: 0 });
    const w = [0, 0, 0, 0];
    // Con paso 1 `nodes` son índices de nodo; `offs` son posiciones LOCALES dentro del búfer de 4 nodos.
    const nodes = [0, 0, 0, 0];
    bilinearWeights(loc, spec.cols, 1, w, nodes);
    const offs = [0, NCH, 2 * NCH, 3 * NCH];
    const buf = new Float64Array(4 * NCH);
    return (t, out) => {
      for (let k = 0; k < 4; k++) this.nodeAt(nodes[k], t, buf, offs[k]);
      return blend(buf, offs, w, loc.outside, out);
    };
  }
}

export class WeatherSnapshot {
  readonly t: number;
  private readonly spec: GridSpec;
  private readonly vals: Float64Array;
  private readonly loc: GridLocation = { i0: 0, j0: 0, fx: 0, fy: 0, outside: 0 };
  private readonly w = [0, 0, 0, 0];
  private readonly offs = [0, 0, 0, 0];

  constructor(model: WeatherGridModel, t: number) {
    this.t = t;
    this.spec = model.data.spec;
    this.vals = new Float64Array(model.nodes * NCH);
    for (let n = 0; n < model.nodes; n++) model.nodeAt(n, t, this.vals, n * NCH);
  }

  /** Interpolación espacial. Devuelve false si no hay ningún dato alrededor del punto. */
  sample(lng: number, lat: number, out: WeatherSample): boolean {
    locateInGrid(this.spec, lng, lat, this.loc);
    bilinearWeights(this.loc, this.spec.cols, NCH, this.w, this.offs);
    return blend(this.vals, this.offs, this.w, this.loc.outside, out);
  }
}
