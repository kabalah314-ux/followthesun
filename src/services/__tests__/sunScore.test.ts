import { describe, expect, it } from "vitest";
import type { SunSearchResult } from "../../types";
import {
  buildReasons,
  calculateRankingValue,
  calculateSunScore,
  comfortMultiplier,
  compareResults,
  shadeBreakFit,
  type ReasonSubject,
  type SunScoreInputs,
} from "../sunScoreService";

const BASE: SunScoreInputs = {
  requestedMinutes: 60,
  sunMinutes: 60,
  longestSunRunMinutes: 60,
  meanScore: 1,
  urbanShadowMinutes: 0,
  meanCloudInfluence: 0,
  areaSunShare: null,
  preference: "maximum_sun",
  avoidClouds: false,
  preferShadeBreaks: false,
  comfort: null,
};

describe("Sun Score — explicable", () => {
  it("sol directo todo el tiempo → 100", () => {
    expect(calculateSunScore(BASE).score).toBe(100);
  });

  it("los pesos suman 1 y las contribuciones suman el score", () => {
    // 42/60 = 0,7 de cobertura → 0,7·0,7 + 0,2·0,7 + 0,1·0,5 = 0,68 (lejos de un empate de redondeo).
    const s = calculateSunScore({ ...BASE, sunMinutes: 42, longestSunRunMinutes: 30, meanScore: 0.7 });
    expect(s.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 6);
    const total = s.components.reduce((a, c) => a + c.contribution, 0);
    expect(Math.round(total)).toBe(s.score);
  });

  it("la mitad del sol → 50", () => {
    const s = calculateSunScore({ ...BASE, sunMinutes: 30, longestSunRunMinutes: 30, meanScore: 0.5 });
    expect(s.score).toBe(50);
  });

  it("sin sol → 0", () => {
    const s = calculateSunScore({ ...BASE, sunMinutes: 0, longestSunRunMinutes: 0, meanScore: 0 });
    expect(s.score).toBe(0);
  });

  it("si solo brilla un rincón del lugar, se resta y se explica", () => {
    const s = calculateSunScore({ ...BASE, areaSunShare: 0 });
    expect(s.score).toBe(88);
    expect(s.adjustments.map((a) => a.key)).toContain("spatial");
    expect(s.adjustments[0].delta).toBeLessThan(0);
  });

  it("«evitar nubes» penaliza en proporción a la influencia de las nubes", () => {
    const s = calculateSunScore({ ...BASE, avoidClouds: true, meanCloudInfluence: 0.4 });
    expect(s.score).toBe(90);
  });

  it("el modo equilibrado resta con mucho calor; el de máximo sol no", () => {
    const hot = { meanTemperatureC: 33, meanApparentC: 36, maxWindKmh: 5, source: "test" };
    expect(calculateSunScore({ ...BASE, preference: "balanced", comfort: hot }).score).toBe(70);
    expect(calculateSunScore({ ...BASE, preference: "maximum_sun", comfort: hot }).score).toBe(100);
  });

  it("«pausas de sombra» premia entre el 5 % y el 25 % de sombra", () => {
    expect(shadeBreakFit(0.1)).toBe(1);
    expect(shadeBreakFit(0)).toBeCloseTo(0.6, 6);
    expect(shadeBreakFit(0.6)).toBe(0);
  });

  it("el confort explica sus notas", () => {
    const m = comfortMultiplier({ meanTemperatureC: 33, meanApparentC: 35, maxWindKmh: 35, source: "test" });
    expect(m.value).toBeLessThan(0.7);
    expect(m.notes.join(" ")).toContain("Calor");
    expect(m.notes.join(" ")).toContain("Viento");
    expect(comfortMultiplier(null).value).toBe(1);
  });
});

describe("ranking — la confianza cuenta", () => {
  it("un 95 con confianza baja NO gana a un 91 con confianza alta", () => {
    const low = calculateRankingValue(95, 0.35);
    const high = calculateRankingValue(91, 0.85);
    expect(low.value).toBeCloseTo(82, 6);
    expect(high.value).toBeCloseTo(88, 6);
    expect(high.value).toBeGreaterThan(low.value);
  });

  it("pero un 95 sí gana a un 70 aunque dude más", () => {
    expect(calculateRankingValue(95, 0.35).value).toBeGreaterThan(calculateRankingValue(70, 0.9).value);
  });

  it("la distancia solo desempata: 0,2 puntos por minuto con tope de 8", () => {
    expect(calculateRankingValue(90, 1, 10).distanceAdjustment).toBeCloseTo(-2, 6);
    expect(calculateRankingValue(90, 1, 100).distanceAdjustment).toBe(-8);
    expect(calculateRankingValue(90, 1).distanceAdjustment).toBe(0);
  });

  it("a igualdad de valor, más minutos de sol; después, más confianza", () => {
    const a = { rankingValue: 80, sunlightMinutes: 50, confidence: 0.5, placeId: "a" };
    const b = { rankingValue: 80.1, sunlightMinutes: 60, confidence: 0.5, placeId: "b" };
    const c = { rankingValue: 80, sunlightMinutes: 50, confidence: 0.7, placeId: "c" };
    expect([a, b].sort(compareResults).map((x) => x.placeId)).toEqual(["b", "a"]);
    expect([a, c].sort(compareResults).map((x) => x.placeId)).toEqual(["c", "a"]);
    const far = { rankingValue: 60, sunlightMinutes: 10, confidence: 0.1, placeId: "z" };
    expect([far, a].sort(compareResults)[0].placeId).toBe("a");
  });
});

function subject(over: Partial<ReasonSubject> = {}): ReasonSubject {
  const scoreDetail = calculateSunScore(BASE);
  const rankingDetail = calculateRankingValue(scoreDetail.score, 0.8, 8);
  const base: Omit<SunSearchResult, "rank" | "reasons"> = {
    placeId: "p1",
    place: {
      id: "p1",
      name: "Parc de Prova",
      type: "park",
      latitude: 41.39,
      longitude: 2.17,
      source: "test",
    },
    locationType: "park",
    spot: { latitude: 41.39, longitude: 2.17, offsetMeters: 0 },
    score: scoreDetail.score,
    scoreDetail,
    rankingValue: rankingDetail.value,
    rankingDetail,
    requestedMinutes: 60,
    sunlightMinutes: 60,
    partialMinutes: 0,
    urbanShadowMinutes: 0,
    cloudMinutes: 0,
    uncertainMinutes: 0,
    longestSunRunMinutes: 60,
    directSunPercentage: 100,
    cloudInfluence: 0.05,
    meanElevationDeg: 45,
    areaSunShare: null,
    sampledPoints: 4,
    confidence: 0.8,
    confidenceDetail: { geometry: 0.85, weather: 0.7, overall: 0.8 },
    origin: "forecast",
    searchWindow: { start: 0, end: 3_600_000 },
    bestWindow: { start: 0, end: 3_600_000 },
    windows: [],
    narrative: [],
    walking: { distanceMeters: 640, durationMinutes: 8, exact: false, method: "straight_line_estimate" },
    meetsRequest: true,
    weatherAvailable: true,
    buildingsKnown: true,
  };
  return { ...base, ...over };
}

describe("«¿Por qué este lugar?»", () => {
  it("un lugar con sol pleno, sin sombra y cerca explica sus ventajas con hechos", () => {
    const s = subject();
    const texts = buildReasons(s, [s], "maximum_sun").map((r) => r.text);
    expect(texts.some((t) => t.includes("de sol directo"))).toBe(true);
    expect(texts).toContain("Poca influencia de nubes");
    expect(texts).toContain("Casi sin sombra de edificios");
    expect(texts.some((t) => t.includes("8 min andando"))).toBe(true);
  });

  it("cuando tiene la ventana más larga lo dice comparando con los demás", () => {
    const winner = subject({ placeId: "w", longestSunRunMinutes: 60 });
    const other = subject({ placeId: "o", longestSunRunMinutes: 30 });
    const texts = buildReasons(winner, [winner, other], "maximum_sun").map((r) => r.text);
    expect(texts.some((t) => t.startsWith("Ventana de sol directo más larga"))).toBe(true);
  });

  it("sin datos de nubes avisa de que el sol es solo posible", () => {
    const s = subject({ weatherAvailable: false });
    const reasons = buildReasons(s, [s], "maximum_sun");
    expect(reasons.some((r) => r.tone === "minus" && r.text.includes("Sin datos de nubes"))).toBe(true);
  });

  it("sin edificios cargados no afirma que no haya sombra urbana", () => {
    const s = subject({ buildingsKnown: false });
    const texts = buildReasons(s, [s], "maximum_sun").map((r) => r.text);
    expect(texts).not.toContain("Casi sin sombra de edificios");
    expect(texts.some((t) => t.includes("no está verificada"))).toBe(true);
  });

  it("la confianza baja se dice sin tecnicismos", () => {
    const s = subject({ confidence: 0.3 });
    const texts = buildReasons(s, [s], "maximum_sun").map((r) => r.text);
    expect(texts.some((t) => t.includes("Confianza baja"))).toBe(true);
  });

  it("nunca pasa de seis motivos", () => {
    const s = subject({ confidence: 0.2, buildingsKnown: false, weatherAvailable: false, areaSunShare: 0.1 });
    expect(buildReasons(s, [s], "balanced").length).toBeLessThanOrEqual(6);
  });
});
