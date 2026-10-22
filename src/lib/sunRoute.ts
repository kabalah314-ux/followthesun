import type { SunWindow, SunWindowKind } from "../types";

/**
 * La ruta del sol (guía maestra 2): una tarde encadenando 2–4 sitios para estar siempre al sol (o a
 * la sombra), con paseos cortos entre ellos.
 *
 * Programación dinámica sobre tramos de 15 min y los ~30 mejores candidatos cercanos. Estado:
 * (tramo, sitio, paradas hechas, tramos seguidos en el sitio). Quedarse suma el sol del tramo;
 * cambiar de sitio cuesta el tiempo a pie (λ por minuto, y lo que se tarda en llegar se pierde) y
 * una penalización fija (μ) para no proponer saltos de diez minutos; además hay que quedarse un
 * mínimo en cada parada. Coste: O(T·N²·K) — menos de 50 ms en el navegador con 30 × 32 tramos.
 */

export interface RouteCandidate {
  id: string;
  lat: number;
  lng: number;
  /** Fracción del tramo con sol (o con sombra) en el mejor punto del sitio, 0–1, un valor por tramo. */
  values: number[];
}

export interface RouteParams {
  slotMinutes: number;
  /** Coste de cada minuto a pie (en tramos de sol). */
  lambda: number;
  /** Penalización fija por cambiar de sitio (en tramos de sol). */
  mu: number;
  /** Tramos seguidos como mínimo en cada parada. */
  minStaySlots: number;
  minStops: number;
  maxStops: number;
  /** Paseo máximo entre dos paradas (min). */
  maxWalkMinutes: number;
  walkMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
  /** Desde dónde se sale (el primer paseo resta un poco: mejor empezar cerca). */
  origin?: { lat: number; lng: number } | null;
}

export const ROUTE_DEFAULTS = {
  slotMinutes: 15,
  lambda: 0.02,
  mu: 0.6,
  minStaySlots: 2,
  minStops: 2,
  maxStops: 4,
  maxWalkMinutes: 15,
} as const;

export interface RouteStop {
  /** Índice del candidato. */
  index: number;
  id: string;
  /** Tramo de llegada (incluido) y de salida (excluido). */
  startSlot: number;
  endSlot: number;
  /** Minutos de sol (o de sombra) en la parada. */
  minutes: number;
  /** Minutos a pie desde la parada anterior (o desde el origen). */
  walkBefore: number;
}

export interface SunRoute {
  stops: RouteStop[];
  /** Valor optimizado (tramos de sol menos costes). */
  score: number;
  sunMinutes: number;
  walkMinutes: number;
  slots: number;
}

export function planSunRoute(cands: readonly RouteCandidate[], p: RouteParams): SunRoute | null {
  const N = cands.length;
  if (N === 0) return null;
  const T = Math.min(...cands.map((c) => c.values.length));
  if (T === 0) return null;
  const K = Math.max(1, p.maxStops);
  const C = Math.max(1, p.minStaySlots);
  const slot = p.slotMinutes;

  // Matrices planas (bucles calientes sin cierres ni arrays anidados).
  const walk = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) walk[i * N + j] = i === j ? 0 : p.walkMinutes(cands[i], cands[j]);
  const walk0 = cands.map((c) => (p.origin ? p.walkMinutes(p.origin, c) : 0));
  const vals = new Float64Array(N * T);
  for (let i = 0; i < N; i++) for (let t = 0; t < T; t++) vals[i * T + t] = cands[i].values[t];

  const size = T * N * K * C;
  const V = new Float64Array(size).fill(-Infinity);
  const P = new Int32Array(size).fill(-1);
  /** Fracción del primer tramo que se pierde llegando (para recalcular minutos). */
  const lost = new Float32Array(size);
  const at = (t: number, i: number, k: number, c: number) => ((t * N + i) * K + (k - 1)) * C + (c - 1);

  for (let i = 0; i < N; i++) {
    V[at(0, i, 1, 1)] = vals[i * T] - p.lambda * walk0[i];
  }

  const { lambda, mu, maxWalkMinutes } = p;
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      for (let k = 1; k <= K; k++) {
        for (let c = 1; c <= C; c++) {
          const s = at(t, i, k, c);
          const v = V[s];
          if (v === -Infinity) continue;
          // Quedarse un tramo más.
          if (t + 1 < T) {
            const n = at(t + 1, i, k, c < C ? c + 1 : C);
            const nv = v + vals[i * T + t + 1];
            if (nv > V[n]) {
              V[n] = nv;
              P[n] = s;
              lost[n] = 0;
            }
          }
          // Cambiar de sitio (tras la estancia mínima).
          if (c === C && k < K) {
            const row = i * N;
            for (let j = 0; j < N; j++) {
              if (j === i) continue;
              const w = walk[row + j];
              if (w > maxWalkMinutes) continue;
              const full = Math.floor(w / slot);
              const a = t + 1 + full;
              if (a >= T) continue;
              const frac = (w - full * slot) / slot;
              const n = at(a, j, k + 1, 1);
              const nv = v - lambda * w - mu + vals[j * T + a] * (1 - frac);
              if (nv > V[n]) {
                V[n] = nv;
                P[n] = s;
                lost[n] = frac;
              }
            }
          }
        }
      }
    }
  }

  let best = -1;
  let bestV = -Infinity;
  const lastT = T - 1;
  for (let i = 0; i < N; i++) {
    for (let k = Math.max(1, p.minStops); k <= K; k++) {
      const s = at(lastT, i, k, C);
      if (V[s] > bestV) {
        bestV = V[s];
        best = s;
      }
    }
  }
  if (best < 0) return null;

  // Recorrido hacia atrás: estados (tramo, sitio, parada).
  const path: Array<{ t: number; i: number; k: number; lost: number }> = [];
  for (let s = best; s >= 0; s = P[s]) {
    const c0 = s % C;
    const rest = (s - c0) / C;
    const k0 = rest % K;
    const rest2 = (rest - k0) / K;
    const i0 = rest2 % N;
    const t0 = (rest2 - i0) / N;
    path.push({ t: t0, i: i0, k: k0 + 1, lost: lost[s] });
  }
  path.reverse();

  const stops: RouteStop[] = [];
  for (const st of path) {
    const last = stops[stops.length - 1];
    const value = vals[st.i * T + st.t] * (1 - st.lost);
    if (last && last.index === st.i && stops.length === st.k) {
      last.endSlot = st.t + 1;
      last.minutes += value * slot;
    } else {
      const prev = stops[stops.length - 1];
      stops.push({
        index: st.i,
        id: cands[st.i].id,
        startSlot: st.t,
        endSlot: st.t + 1,
        minutes: value * slot,
        walkBefore: prev ? walk[prev.index * N + st.i] : walk0[st.i],
      });
    }
  }
  for (const s of stops) s.minutes = Math.round(s.minutes);
  return {
    stops,
    score: bestV,
    sunMinutes: stops.reduce((a, s) => a + s.minutes, 0),
    walkMinutes: Math.round(stops.slice(1).reduce((a, s) => a + s.walkBefore, 0)),
    slots: T,
  };
}

const WEIGHT: Record<"sun" | "shade", Record<SunWindowKind, number>> = {
  sun: { sun: 1, partial: 0.5, shadow: 0, cloud: 0, uncertain: 0.3, night: 0 },
  shade: { sun: 0, partial: 0.3, shadow: 1, cloud: 0.6, uncertain: 0.3, night: 0 },
};

/** Ventanas de un lugar → fracción de sol (o de sombra) de cada tramo. */
export function valuesFromWindows(
  windows: readonly SunWindow[],
  start: number,
  slots: number,
  slotMs: number,
  mode: "sun" | "shade"
): number[] {
  const out: number[] = [];
  for (let k = 0; k < slots; k++) {
    const a = start + k * slotMs;
    const b = a + slotMs;
    let v = 0;
    for (const w of windows) {
      const o = Math.min(b, w.end) - Math.max(a, w.start);
      if (o > 0) v += (o / slotMs) * WEIGHT[mode][w.kind];
    }
    out.push(Math.min(1, Math.round(v * 1000) / 1000));
  }
  return out;
}
