import { LIGHT_MODEL_CONFIG as C } from "../config";
import {
  bilinearWeights,
  blendNodes,
  locateInGrid,
  type GridLocation,
  type GridSpec,
} from "./cloudInterpolation";
import { clamp } from "./coordinates";
import { calculateClearSkyValues, dniIndex, ghiIndex, median } from "./radiationCalculations";

/**
 * Rejilla de observación satelital — conserva la resolución temporal NATIVA (10 min) y distingue
 * tres tipos de respuesta, que nunca se confunden:
 *
 *   observed      el instante coincide (±90 s) con una muestra real del satélite
 *   interpolated  entre dos muestras reales: estimación, no medida
 *   persistence   posterior a la última muestra: se mantiene el ÍNDICE de transmisión (DNI /
 *                 DNI de cielo despejado), no la DNI, porque la geometría solar sigue cambiando
 *                 ("smart persistence"). Su calidad decae con el tiempo transcurrido.
 *
 * Jamás se extrapola hacia el pasado anterior a la primera muestra ni se acepta como observación
 * nada posterior a la última pasada.
 */

export interface SatelliteMeta {
  providerId: string;
  /** Texto corto para la interfaz. */
  label: string;
  source: string;
  attribution: string;
  /** Lo que se pidió a la API (p. ej. `satellite_radiation_seamless`). */
  requestedSource: string;
  /** Estimada por la alineación de los nodos devueltos con la rejilla de la fuente. */
  resolutionKm: number;
  temporalResolutionMinutes: number;
  /** Cuándo se descargó (ms). Ninguna muestra posterior se acepta como observación. */
  fetchedAt: number;
  /** Distancia media entre el nodo pedido y el centro de la celda devuelta (km). */
  nodeOffsetKm: number;
  hasClearSky: boolean;
  /**
   * La API no indica si la componente directa es nativa o separada del GHI con un modelo de
   * descomposición (así lo hace para Himawari). Se trata como no verificada.
   */
  directProvenance: "native" | "derived" | "unverified";
}

/** Arrays planos `[nodo * steps + paso]` con NaN donde no hay muestra. */
export interface SatelliteGridData {
  spec: GridSpec;
  t0: number;
  stepMs: number;
  steps: number;
  ghi: Float32Array;
  direct: Float32Array;
  diffuse: Float32Array;
  dni: Float32Array;
  /** GHI de cielo despejado de la propia fuente (NaN si no la publica). */
  clearGhi: Float32Array;
  meta: SatelliteMeta;
}

export type SatelliteSampleOrigin = "observed" | "interpolated" | "persistence";

export interface SatelliteRaw {
  /** DNI / DNI de cielo despejado calibrada (0-1). NaN con el sol bajo. */
  tDir: number;
  /** GHI / GHI de cielo despejado. */
  kt: number;
  ghi: number;
  direct: number;
  diffuse: number;
  dni: number;
  clearGhi: number;
  origin: SatelliteSampleOrigin;
  /** Instante de la observación en la que se basa el valor (ms). */
  sampleTime: number;
  /** ms entre la observación y el instante pedido (solo persistencia). */
  leadMs: number;
  coverage: number;
  outside: number;
}

export interface SatellitePlan {
  mode: SatelliteSampleOrigin;
  i0: number;
  i1: number;
  f: number;
  sampleTime: number;
  leadMs: number;
}

/** Canales por nodo y paso al muestrear. */
const SCH = 7;
const S = { tDir: 0, kt: 1, ghi: 2, direct: 3, diffuse: 4, dni: 5, clearGhi: 6 } as const;
/** Una muestra se considera "en ese instante" si dista menos que esto. */
const TOLERANCE_MS = 90_000;
/** Pasos hacia atrás que se buscan para persistir el índice cuando la última muestra es nocturna. */
const BACK_STEPS = 6;

export interface ClearSkyCalibration {
  factor: number;
  source: "satellite" | "none";
  samples: number;
}

const SUM = new Float64Array(SCH);
const WSUM = new Float64Array(SCH);

export class SatelliteGridModel {
  readonly data: SatelliteGridData;
  readonly nodes: number;
  readonly steps: number;
  /** Último paso con datos en al menos el 40 % de los nodos (−1 si no hay ninguno). */
  readonly lastIndex: number;
  readonly lastObservedTime: number | null;
  readonly firstTime: number;
  readonly calibration: ClearSkyCalibration;
  readonly coverageFraction: number;

  private readonly tDir: Float32Array;
  private readonly kt: Float32Array;
  private readonly center: { lat: number; lng: number };

  constructor(data: SatelliteGridData) {
    this.data = data;
    this.nodes = data.spec.cols * data.spec.rows;
    this.steps = data.steps;
    this.firstTime = data.t0;
    const b = data.spec.bounds;
    this.center = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };

    // Último paso observado (dato real: los ceros nocturnos también cuentan).
    let last = -1;
    for (let s = this.steps - 1; s >= 0 && last < 0; s--) {
      let count = 0;
      for (let n = 0; n < this.nodes; n++) if (!Number.isNaN(data.ghi[n * this.steps + s])) count++;
      if (count >= this.nodes * 0.4) last = s;
    }
    this.lastIndex = last;
    this.lastObservedTime = last >= 0 ? data.t0 + last * data.stepMs : null;

    let valid = 0;
    for (let n = 0; n < this.nodes; n++) {
      let count = 0;
      for (let s = 0; s <= last; s++) if (!Number.isNaN(data.ghi[n * this.steps + s])) count++;
      if (last >= 0 && count >= (last + 1) * 0.4) valid++;
    }
    this.coverageFraction = this.nodes > 0 ? valid / this.nodes : 0;

    // Cielo despejado de referencia (calculado) en cada paso, y calibración con el del satélite.
    const clearGhiCalc = new Float64Array(this.steps);
    const clearDniCalc = new Float64Array(this.steps);
    for (let s = 0; s < this.steps; s++) {
      const cs = calculateClearSkyValues(this.center.lat, this.center.lng, data.t0 + s * data.stepMs);
      clearGhiCalc[s] = cs.ghi;
      clearDniCalc[s] = cs.dni;
    }

    const ratios: number[] = [];
    for (let s = 0; s <= last; s++) {
      if (clearGhiCalc[s] < C.CLEAR_SKY.calibrationMinGhiWm2) continue;
      let sum = 0;
      let count = 0;
      for (let n = 0; n < this.nodes; n++) {
        const v = data.clearGhi[n * this.steps + s];
        if (!Number.isNaN(v)) {
          sum += v;
          count++;
        }
      }
      if (count > 0) ratios.push(sum / count / clearGhiCalc[s]);
    }
    const [lo, hi] = C.CLEAR_SKY.calibrationRange;
    this.calibration =
      ratios.length >= 3
        ? { factor: clamp(median(ratios), lo, hi), source: "satellite", samples: ratios.length }
        : { factor: 1, source: "none", samples: ratios.length };

    // Índices de transmisión por nodo y paso (calibrados).
    const size = this.nodes * this.steps;
    this.tDir = new Float32Array(size).fill(NaN);
    this.kt = new Float32Array(size).fill(NaN);
    const k = this.calibration.factor;
    for (let n = 0; n < this.nodes; n++) {
      for (let s = 0; s <= last; s++) {
        const i = n * this.steps + s;
        const t = dniIndex(data.dni[i], clearDniCalc[s]);
        if (!Number.isNaN(t)) this.tDir[i] = clamp(t / k, 0, 1);
        const ref = !Number.isNaN(data.clearGhi[i]) ? data.clearGhi[i] : clearGhiCalc[s] * k;
        const g = ghiIndex(data.ghi[i], ref);
        if (!Number.isNaN(g)) this.kt[i] = g;
      }
    }
  }

  /** Decide cómo responder en `t`. null si no hay observaciones aplicables. */
  plan(t: number): SatellitePlan | null {
    const d = this.data;
    if (this.lastIndex < 0 || this.lastObservedTime === null) return null;
    const lastT = this.lastObservedTime;
    if (t > lastT + TOLERANCE_MS) {
      return { mode: "persistence", i0: this.lastIndex, i1: this.lastIndex, f: 0, sampleTime: lastT, leadMs: t - lastT };
    }
    const s = (t - d.t0) / d.stepMs;
    if (s < -TOLERANCE_MS / d.stepMs) return null;
    const nearest = clamp(Math.round(s), 0, this.lastIndex);
    if (Math.abs(s - nearest) * d.stepMs <= TOLERANCE_MS) {
      return { mode: "observed", i0: nearest, i1: nearest, f: 0, sampleTime: d.t0 + nearest * d.stepMs, leadMs: 0 };
    }
    const i0 = Math.floor(s);
    const i1 = Math.min(i0 + 1, this.lastIndex);
    return {
      mode: "interpolated",
      i0: clamp(i0, 0, this.lastIndex),
      i1,
      f: s - i0,
      sampleTime: d.t0 + clamp(i0, 0, this.lastIndex) * d.stepMs,
      leadMs: 0,
    };
  }

  /** Valores de un nodo en el plan dado, escritos en `out[o .. o+SCH)`. */
  nodeAt(n: number, p: SatellitePlan, out: Float64Array, o: number) {
    const d = this.data;
    const base = n * this.steps;
    const chans: Array<[number, Float32Array]> = [
      [S.tDir, this.tDir],
      [S.kt, this.kt],
      [S.ghi, d.ghi],
      [S.direct, d.direct],
      [S.diffuse, d.diffuse],
      [S.dni, d.dni],
      [S.clearGhi, d.clearGhi],
    ];

    for (const [ch, arr] of chans) {
      let v = NaN;
      if (p.mode === "observed") {
        v = arr[base + p.i0];
      } else if (p.mode === "interpolated") {
        const a = arr[base + p.i0];
        const b = arr[base + p.i1];
        const hasA = !Number.isNaN(a);
        const hasB = !Number.isNaN(b);
        v = hasA && hasB ? a + (b - a) * p.f : hasA ? a : hasB ? b : NaN;
      } else {
        // Persistencia: los ÍNDICES se buscan hacia atrás si la última muestra es nocturna.
        const isIndex = ch === S.tDir || ch === S.kt;
        v = arr[base + p.i0];
        if (isIndex) {
          for (let k = 1; k <= BACK_STEPS && Number.isNaN(v) && p.i0 - k >= 0; k++) {
            v = arr[base + p.i0 - k];
          }
        }
      }
      out[o + ch] = v;
    }
  }

  private fromBlend(plan: SatellitePlan, outside: number): SatelliteRaw | null {
    const at = (ch: number) => (WSUM[ch] > 1e-6 ? SUM[ch] / WSUM[ch] : NaN);
    const coverage = Math.max(WSUM[S.tDir], WSUM[S.kt], WSUM[S.ghi]);
    if (coverage <= 1e-6) return null;
    return {
      tDir: at(S.tDir),
      kt: at(S.kt),
      ghi: at(S.ghi),
      direct: at(S.direct),
      diffuse: at(S.diffuse),
      dni: at(S.dni),
      clearGhi: at(S.clearGhi),
      origin: plan.mode,
      sampleTime: plan.sampleTime,
      leadMs: plan.leadMs,
      coverage,
      outside,
    };
  }

  /** Muestreador optimizado para un punto fijo (precalcula nodos y pesos). */
  pointSampler(lng: number, lat: number): (t: number) => SatelliteRaw | null {
    const spec = this.data.spec;
    const loc = locateInGrid(spec, lng, lat, { i0: 0, j0: 0, fx: 0, fy: 0, outside: 0 });
    const w = [0, 0, 0, 0];
    // Con paso 1 `nodes` son índices de nodo; `offs` son posiciones LOCALES dentro del búfer de 4 nodos.
    const nodes = [0, 0, 0, 0];
    bilinearWeights(loc, spec.cols, 1, w, nodes);
    const offs = [0, SCH, 2 * SCH, 3 * SCH];
    const buf = new Float64Array(4 * SCH);
    return (t) => {
      const plan = this.plan(t);
      if (!plan) return null;
      for (let k = 0; k < 4; k++) this.nodeAt(nodes[k], plan, buf, offs[k]);
      blendNodes(buf, offs, w, SCH, SUM, WSUM);
      return this.fromBlend(plan, loc.outside);
    };
  }

  snapshotAt(t: number): SatelliteSnapshot | null {
    const plan = this.plan(t);
    return plan ? new SatelliteSnapshot(this, plan) : null;
  }
}

/** Instantánea de toda la rejilla en un instante: consultas espaciales baratas durante un fotograma. */
export class SatelliteSnapshot {
  readonly plan: SatellitePlan;
  private readonly model: SatelliteGridModel;
  private readonly spec: GridSpec;
  private readonly vals: Float64Array;
  private readonly loc: GridLocation = { i0: 0, j0: 0, fx: 0, fy: 0, outside: 0 };
  private readonly w = [0, 0, 0, 0];
  private readonly offs = [0, 0, 0, 0];

  constructor(model: SatelliteGridModel, plan: SatellitePlan) {
    this.model = model;
    this.plan = plan;
    this.spec = model.data.spec;
    this.vals = new Float64Array(model.nodes * SCH);
    for (let n = 0; n < model.nodes; n++) model.nodeAt(n, plan, this.vals, n * SCH);
  }

  /** Devuelve los valores en un punto, o null si no hay datos alrededor. */
  sample(lng: number, lat: number): SatelliteRaw | null {
    locateInGrid(this.spec, lng, lat, this.loc);
    bilinearWeights(this.loc, this.spec.cols, SCH, this.w, this.offs);
    blendNodes(this.vals, this.offs, this.w, SCH, SUM, WSUM);
    const at = (ch: number) => (WSUM[ch] > 1e-6 ? SUM[ch] / WSUM[ch] : NaN);
    const coverage = Math.max(WSUM[S.tDir], WSUM[S.kt], WSUM[S.ghi]);
    if (coverage <= 1e-6) return null;
    return {
      tDir: at(S.tDir),
      kt: at(S.kt),
      ghi: at(S.ghi),
      direct: at(S.direct),
      diffuse: at(S.diffuse),
      dni: at(S.dni),
      clearGhi: at(S.clearGhi),
      origin: this.plan.mode,
      sampleTime: this.plan.sampleTime,
      leadMs: this.plan.leadMs,
      coverage,
      outside: this.loc.outside,
    };
  }

  get nodeCount() {
    return this.model.nodes;
  }
}
