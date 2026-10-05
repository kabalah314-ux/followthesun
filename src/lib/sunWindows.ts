import type { NarrativeEvent, SunSample, SunWindow } from "../types";
import { clamp } from "./coordinates";

/**
 * Ventanas de sol — el concepto central de Find the Sun: no se mira «¿hay sol a las 18:00?»,
 * se divide la franja en tramos y se mide cuánto sol hay de verdad.
 *
 *   17:00–17:35 sol · 17:35–18:02 sombra · 18:02–18:47 sol · 18:47–19:00 sombra
 *
 * Todo puro: recibe muestras (una por paso de tiempo) y devuelve tramos y métricas.
 */

const MIN = 60_000;

const minutesOf = (a: number, b: number) => Math.max(0, (b - a) / MIN);
const sampleEnd = (samples: SunSample[], i: number, stepMs: number, endLimit: number) =>
  Math.min(samples[i].time + stepMs, endLimit);

/** Agrupa muestras consecutivas del mismo tipo en tramos [inicio, fin). */
export function groupWindows(samples: SunSample[], stepMs: number, endLimit: number): SunWindow[] {
  const out: SunWindow[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const end = sampleEnd(samples, i, stepMs, endLimit);
    if (end <= s.time) continue;
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && last.end === s.time) {
      last.end = end;
      if (s.unverified) last.unverified = true;
    } else {
      out.push({ kind: s.kind, start: s.time, end, unverified: s.unverified || undefined });
    }
  }
  return out;
}

export interface WindowMetrics {
  startIndex: number;
  endIndex: number;
  start: number;
  end: number;
  minutes: number;
  /** Minutos de sol directo. */
  sunMinutes: number;
  partialMinutes: number;
  /** Sombra de edificios o relieve. */
  shadowMinutes: number;
  /** Solo sombra de edificios. */
  urbanShadowMinutes: number;
  cloudMinutes: number;
  uncertainMinutes: number;
  nightMinutes: number;
  /** Σ puntuación × minutos (los minutos de noche aportan 0). */
  scoreSum: number;
  /** Puntuación media (0-1) sobre toda la ventana. */
  meanScore: number;
  /** Influencia media de las nubes sobre el sol directo (0-1), sin contar la noche. */
  meanCloudInfluence: number;
  meanConfidence: number;
  meanGeometryConfidence: number;
  /** Media sobre las muestras con dato meteorológico (0 si no hay). */
  meanWeatherConfidence: number;
  meanElevationDeg: number;
  /** Tramo ininterrumpido de sol directo más largo (minutos). */
  longestSunRunMinutes: number;
  /** Primer y último instante de sol directo dentro de la ventana (recorte «apretado»). */
  strongStart: number | null;
  strongEnd: number | null;
  /** Alguna muestra de sol sin datos de nubes (sol posible, no confirmado). */
  anyUnverified: boolean;
}

export function analyzeRange(
  samples: SunSample[],
  i0: number,
  i1: number,
  stepMs: number,
  endLimit: number
): WindowMetrics {
  let sun = 0;
  let partial = 0;
  let shadow = 0;
  let urban = 0;
  let cloud = 0;
  let uncertain = 0;
  let night = 0;
  let scoreSum = 0;
  let cloudInf = 0;
  let conf = 0;
  let geo = 0;
  let wx = 0;
  let wxMinutes = 0;
  let elev = 0;
  let active = 0;
  let run = 0;
  let longest = 0;
  let firstSun: number | null = null;
  let lastSun: number | null = null;
  let unverified = false;
  const start = samples[i0].time;
  let end = start;

  for (let i = i0; i <= i1; i++) {
    const s = samples[i];
    const e = sampleEnd(samples, i, stepMs, endLimit);
    const m = minutesOf(s.time, e);
    if (e > end) end = e;

    switch (s.kind) {
      case "sun":
        sun += m;
        break;
      case "partial":
        partial += m;
        break;
      case "shadow":
        shadow += m;
        break;
      case "cloud":
        cloud += m;
        break;
      case "uncertain":
        uncertain += m;
        break;
      case "night":
        night += m;
        break;
    }
    if (s.urbanShadow) urban += m;

    if (s.kind !== "night") {
      active += m;
      scoreSum += s.score * m;
      cloudInf += s.cloudInfluence * m;
      conf += s.confidence * m;
      geo += s.geometryConfidence * m;
      elev += s.elevationDeg * m;
      if (s.weatherConfidence > 0) {
        wx += s.weatherConfidence * m;
        wxMinutes += m;
      }
    }

    if (s.kind === "sun") {
      run += m;
      if (run > longest) longest = run;
      if (firstSun === null) firstSun = s.time;
      lastSun = e;
      if (s.unverified) unverified = true;
    } else {
      run = 0;
    }
  }

  const minutes = minutesOf(start, end);
  const act = Math.max(active, 1e-9);
  return {
    startIndex: i0,
    endIndex: i1,
    start,
    end,
    minutes,
    sunMinutes: sun,
    partialMinutes: partial,
    shadowMinutes: shadow,
    urbanShadowMinutes: urban,
    cloudMinutes: cloud,
    uncertainMinutes: uncertain,
    nightMinutes: night,
    scoreSum,
    meanScore: minutes > 0 ? scoreSum / minutes : 0,
    meanCloudInfluence: active > 0 ? cloudInf / act : 0,
    meanConfidence: active > 0 ? conf / act : 0,
    meanGeometryConfidence: active > 0 ? geo / act : 0,
    meanWeatherConfidence: wxMinutes > 0 ? wx / wxMinutes : 0,
    meanElevationDeg: active > 0 ? elev / act : 0,
    longestSunRunMinutes: longest,
    strongStart: firstSun,
    strongEnd: lastSun,
    anyUnverified: unverified,
  };
}

/**
 * La ventana de `durationMs` con más sol dentro de la franja (ventana deslizante).
 * Aunque la persona pida 17:00–20:00, el mejor periodo puede ser 17:42–19:06.
 *
 * Se maximiza Σ puntuación (el sol parcial cuenta menos que el pleno); en empate gana la que
 * tiene más muestras de sol directo y, después, la más temprana.
 */
export function findBestSunWindow(
  samples: SunSample[],
  stepMs: number,
  durationMs: number,
  endLimit: number
): WindowMetrics | null {
  const n = samples.length;
  if (n === 0) return null;
  const k = clamp(Math.round(durationMs / stepMs), 1, n);

  const P = new Float64Array(n + 1);
  const S = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    P[i + 1] = P[i] + (s.kind === "night" ? 0 : s.score);
    S[i + 1] = S[i] + (s.kind === "sun" ? 1 : 0);
  }

  let bestI = 0;
  let bestSum = -1;
  let bestSun = -1;
  for (let i = 0; i <= n - k; i++) {
    const sum = P[i + k] - P[i];
    const sn = S[i + k] - S[i];
    if (sum > bestSum + 1e-9 || (Math.abs(sum - bestSum) <= 1e-9 && sn > bestSun)) {
      bestSum = sum;
      bestSun = sn;
      bestI = i;
    }
  }
  return analyzeRange(samples, bestI, bestI + k - 1, stepMs, endLimit);
}

/* -------------------------------------------------------------------------- */
/*  Narrativa de la franja («Planear mi tarde»)                                */
/* -------------------------------------------------------------------------- */

const START_LABEL: Record<SunWindow["kind"], string> = {
  sun: "Empieza con sol",
  partial: "Empieza con sol parcial",
  shadow: "Empieza en sombra",
  cloud: "Empieza con nubes",
  uncertain: "Empieza con luz incierta",
  night: "Aún no hay sol",
};

/**
 * Hitos legibles de la franja: cuándo empieza el sol, cuándo llega la sombra urbana, cuándo
 * vuelve el sol y cuál es el mejor momento. Máximo 6.
 */
export function buildNarrative(
  windows: SunWindow[],
  best: { start: number; end: number } | null
): NarrativeEvent[] {
  const day = windows.filter((w) => w.kind !== "night");
  if (day.length === 0) return [];

  const events: NarrativeEvent[] = [
    { time: day[0].start, kind: day[0].kind, label: START_LABEL[day[0].kind] },
  ];

  for (let i = 1; i < day.length; i++) {
    const prev = day[i - 1];
    const cur = day[i];
    let label: string | null = null;
    if (cur.kind === "sun") label = prev.kind === "sun" ? null : "Vuelve el sol";
    else if (cur.kind === "partial") label = "Sol parcial";
    else if (cur.kind === "shadow") label = "Sombra urbana";
    else if (cur.kind === "cloud") label = "Las nubes tapan el sol";
    if (label) events.push({ time: cur.start, kind: cur.kind, label });
  }

  if (best) {
    const near = events.find((e) => Math.abs(e.time - best.start) < 5 * MIN);
    if (near) {
      near.kind = "best";
      near.label = "Mejor sol";
    } else {
      events.push({ time: best.start, kind: "best", label: "Mejor sol" });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events.slice(0, 6);
}
