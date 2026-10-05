import { SUN_SCORE_CONFIG as SC } from "../config";
import { clamp } from "../lib/coordinates";
import { fmtMin } from "../lib/formatSun";
import { influenceLevel } from "../lib/sunlightCalculations";
import type {
  ComfortSummary,
  RankingDetail,
  ResultReason,
  SunPreference,
  SunScore,
  SunScoreAdjustment,
  SunScoreComponent,
  SunSearchResult,
} from "../types";

/**
 * sunScoreService — el Sun Score y el ranking. Todo explicable y centralizado.
 *
 * El Sun Score (0-100) es una combinación lineal de TRES magnitudes que la persona puede leer en
 * el resultado (pesos en `SUN_SCORE_CONFIG`):
 *
 *   70 %  tiempo de sol directo    minutos de sol directo / minutos pedidos
 *   20 %  intensidad del sol       puntuación media de luz efectiva (el sol pleno pesa más que el parcial)
 *   10 %  continuidad              tramo ininterrumpido más largo / minutos pedidos
 *
 * Después, ajustes visibles (cada uno con su efecto en puntos): reparto del sol en la zona,
 * «evitar nubes» y confort (calor y viento) en el modo equilibrado.
 *
 * La confianza NO entra en el Sun Score (que mide sol), sino en el ranking: ver
 * `calculateRankingValue`. Así «94» significa lo mismo con confianza alta o baja, y lo que cambia
 * es qué lugar se recomienda antes.
 */

const clamp01 = (v: number) => clamp(Number.isFinite(v) ? v : 0, 0, 1);

/** 1 si las pausas de sombra están entre el 5 % y el 25 % del tiempo; decae fuera de esa banda. */
export function shadeBreakFit(share: number): number {
  const { minShare, maxShare } = SC.shadeBreaks;
  if (share >= minShare && share <= maxShare) return 1;
  if (share < minShare) return 0.6 + 0.4 * clamp01(share / minShare);
  return clamp01(1 - (share - maxShare) / 0.35);
}

export interface ComfortFactor {
  value: number;
  notes: string[];
}

/** Factor de confort 0,6–1: el calor y el viento fuertes restan. Reglas simples y visibles. */
export function comfortMultiplier(c: ComfortSummary | null): ComfortFactor {
  if (!c) return { value: 1, notes: [] };
  const k = SC.comfort;
  const heatT = clamp01((c.meanApparentC - k.heatFrom) / (k.heatTo - k.heatFrom));
  const windT = clamp01((c.maxWindKmh - k.windFrom) / (k.windTo - k.windFrom));
  const heat = 1 - (1 - k.heatFloor) * heatT;
  const wind = 1 - (1 - k.windFloor) * windT;
  const notes: string[] = [];
  if (heatT > 0.15) notes.push(`Calor (${Math.round(c.meanApparentC)} °C de sensación): el sol aprieta`);
  if (windT > 0.15) notes.push(`Viento de hasta ${Math.round(c.maxWindKmh)} km/h`);
  return { value: heat * wind, notes };
}

export interface SunScoreInputs {
  requestedMinutes: number;
  sunMinutes: number;
  longestSunRunMinutes: number;
  /** Puntuación media de luz efectiva en la ventana (0-1). */
  meanScore: number;
  urbanShadowMinutes: number;
  meanCloudInfluence: number;
  areaSunShare: number | null;
  preference: SunPreference;
  avoidClouds: boolean;
  preferShadeBreaks: boolean;
  comfort: ComfortSummary | null;
}

export function calculateSunScore(i: SunScoreInputs): SunScore {
  const W = SC.weights;
  const D = Math.max(1, i.requestedMinutes);
  const coverage = clamp01(i.sunMinutes / D);
  const strength = clamp01(i.meanScore);
  const continuity = clamp01(i.longestSunRunMinutes / D);
  const third = i.preferShadeBreaks
    ? { key: "shade_breaks", label: "Pausas de sombra", value: shadeBreakFit(i.urbanShadowMinutes / D) }
    : { key: "continuity", label: "Sol sin interrupciones", value: continuity };

  const base = [
    { key: "coverage", label: "Tiempo de sol directo", value: coverage, weight: W.coverage },
    { key: "strength", label: "Intensidad del sol", value: strength, weight: W.strength },
    { ...third, weight: W.continuity },
  ];
  const components: SunScoreComponent[] = base.map((c) => ({
    ...c,
    contribution: 100 * c.value * c.weight,
  }));

  let raw = base.reduce((s, c) => s + c.value * c.weight, 0);
  const adjustments: SunScoreAdjustment[] = [];
  const apply = (key: string, label: string, next: number) => {
    const delta = 100 * (next - raw);
    if (Math.abs(delta) >= 0.05) adjustments.push({ key, label, delta });
    raw = next;
  };

  if (i.areaSunShare !== null) {
    apply(
      "spatial",
      "Reparto del sol en la zona",
      raw * (SC.spatial.floor + (1 - SC.spatial.floor) * clamp01(i.areaSunShare))
    );
  }
  if (i.avoidClouds) {
    apply("clouds", "Evitar nubes", raw * (1 - SC.avoidCloudsPenalty * clamp01(i.meanCloudInfluence)));
  }
  if (i.preference !== "maximum_sun" && i.comfort) {
    apply("comfort", "Confort (calor y viento)", raw * comfortMultiplier(i.comfort).value);
  }

  return { score: Math.round(100 * clamp01(raw)), components, adjustments };
}

/**
 * Valor de ordenación (no es el Sun Score):
 *
 *   valor = score − 20·(1 − confianza) − min(8, 0,2 · minutos a pie)
 *
 * Un 95 con confianza 0,35 queda en 82 y pierde frente a un 91 con confianza 0,85 (88); pero un 95
 * sigue ganando a un 70. La distancia solo desempata a favor de lo cercano.
 */
export function calculateRankingValue(
  score: number,
  confidence: number,
  walkingMinutes?: number
): RankingDetail {
  const R = SC.ranking;
  const confidenceAdjustment = -(R.confidencePenalty * 100 * (1 - clamp01(confidence)));
  const distanceAdjustment =
    walkingMinutes === undefined
      ? 0
      : -Math.min(R.walkPenaltyCap, R.walkPenaltyPerMinute * Math.max(0, walkingMinutes));
  return {
    score,
    confidenceAdjustment,
    distanceAdjustment,
    value: score + confidenceAdjustment + distanceAdjustment,
  };
}

interface Rankable {
  rankingValue: number;
  sunlightMinutes: number;
  confidence: number;
  placeId: string;
}

/** Orden de ranking: valor ajustado; a igualdad (±0,25) más minutos de sol, más confianza, id. */
export function compareResults(a: Rankable, b: Rankable): number {
  const d = b.rankingValue - a.rankingValue;
  if (Math.abs(d) > 0.25) return d;
  if (Math.abs(b.sunlightMinutes - a.sunlightMinutes) > 1) return b.sunlightMinutes - a.sunlightMinutes;
  if (Math.abs(b.confidence - a.confidence) > 0.01) return b.confidence - a.confidence;
  return a.placeId.localeCompare(b.placeId);
}

/* -------------------------------------------------------------------------- */
/*  «¿Por qué este lugar?»                                                     */
/* -------------------------------------------------------------------------- */

export type ReasonSubject = Omit<SunSearchResult, "reasons" | "rank">;

/**
 * Motivos legibles de un resultado, con hechos medidos y comparación con los demás resultados.
 * Primero lo que suma, después lo que resta (máx. 6).
 */
export function buildReasons(
  r: ReasonSubject,
  peers: ReasonSubject[],
  preference: SunPreference
): ResultReason[] {
  const D = Math.max(1, r.requestedMinutes);
  const plus: ResultReason[] = [];
  const minus: ResultReason[] = [];
  const neutral: ResultReason[] = [];

  if (!r.weatherAvailable) {
    minus.push({ tone: "minus", text: "Sin datos de nubes: el sol es posible, no confirmado" });
  }

  // Tiempo de sol.
  const cov = r.sunlightMinutes / D;
  if (cov >= 0.9) {
    plus.push({ tone: "plus", text: `${fmtMin(r.sunlightMinutes)} de sol directo de ${fmtMin(D)}` });
  } else if (cov >= 0.5) {
    neutral.push({ tone: "neutral", text: `${fmtMin(r.sunlightMinutes)} de sol directo de ${fmtMin(D)}` });
  } else {
    minus.push({ tone: "minus", text: `Solo ${fmtMin(r.sunlightMinutes)} de sol directo de ${fmtMin(D)}` });
  }

  // Continuidad (y comparación con los demás).
  const others = peers.filter((p) => p.placeId !== r.placeId).map((p) => p.longestSunRunMinutes);
  const second = others.length ? Math.max(...others) : 0;
  if (others.length > 0 && r.longestSunRunMinutes > 0 && r.longestSunRunMinutes >= second + 5) {
    plus.push({
      tone: "plus",
      text: `Ventana de sol directo más larga de los resultados (${fmtMin(r.longestSunRunMinutes)})`,
    });
  } else if (r.longestSunRunMinutes >= 0.75 * D) {
    plus.push({ tone: "plus", text: `Sol ininterrumpido durante ${fmtMin(r.longestSunRunMinutes)}` });
  }

  // Nubes.
  const level = influenceLevel(r.cloudInfluence);
  if (r.weatherAvailable && level === "low") plus.push({ tone: "plus", text: "Poca influencia de nubes" });
  else if (r.weatherAvailable && level === "high") {
    minus.push({ tone: "minus", text: "Las nubes restan mucho sol" });
  }

  // Sombra de edificios.
  if (r.buildingsKnown) {
    if (r.urbanShadowMinutes <= 0.05 * D) plus.push({ tone: "plus", text: "Casi sin sombra de edificios" });
    else minus.push({ tone: "minus", text: `${fmtMin(r.urbanShadowMinutes)} de sombra de edificios` });
  } else {
    minus.push({ tone: "minus", text: "Sin edificios cargados: la sombra urbana no está verificada" });
  }

  // Reparto en la zona.
  if (r.areaSunShare !== null) {
    if (r.areaSunShare >= 0.7) plus.push({ tone: "plus", text: "El sol llega a buena parte de la zona" });
    else if (r.areaSunShare < 0.35) minus.push({ tone: "minus", text: "Solo un rincón recibe sol" });
  }

  // Distancia.
  if (r.walking) {
    const text = `A ≈ ${r.walking.durationMinutes} min andando`;
    if (r.walking.durationMinutes <= 10) plus.push({ tone: "plus", text });
    else neutral.push({ tone: "neutral", text });
  }

  // Luz débil con el sol bajo.
  if (r.sunlightMinutes > 0 && r.meanElevationDeg < 12) {
    minus.push({ tone: "minus", text: "Sol bajo: la luz es más débil" });
  }

  // Confort (solo en el modo equilibrado).
  if (preference !== "maximum_sun" && r.comfort) {
    for (const note of comfortMultiplier(r.comfort).notes) minus.push({ tone: "minus", text: note });
  }

  if (r.confidence < 0.4) {
    minus.push({
      tone: "minus",
      text: "Confianza baja: la meteorología es de escala de barrio, no de calle",
    });
  }

  return [...plus.slice(0, 5), ...minus.slice(0, 3), ...neutral].slice(0, 6);
}

export const sunScoreService = {
  calculateSunScore,
  calculateRankingValue,
  compareResults,
  buildReasons,
  comfortMultiplier,
};
