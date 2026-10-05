import { describe, expect, it } from "vitest";
import { analyzeRange, buildNarrative, findBestSunWindow, groupWindows } from "../sunWindows";
import type { SunSample, SunWindowKind } from "../../types";

const MIN = 60_000;
const STEP = 10 * MIN;
const T0 = Date.UTC(2026, 5, 21, 15, 0);

const SCORE: Record<SunWindowKind, number> = {
  sun: 0.95,
  partial: 0.45,
  shadow: 0,
  cloud: 0.05,
  uncertain: 0.3,
  night: 0,
};

function samples(kinds: SunWindowKind[]): SunSample[] {
  return kinds.map((kind, i) => ({
    time: T0 + i * STEP,
    kind,
    score: SCORE[kind],
    urbanShadow: kind === "shadow",
    terrainShadow: false,
    cloudInfluence: kind === "cloud" ? 0.9 : 0.05,
    confidence: 0.8,
    geometryConfidence: 0.85,
    weatherConfidence: 0.7,
    unverified: false,
    origin: "forecast",
    elevationDeg: 40,
  }));
}

const endOf = (n: number) => T0 + n * STEP;

describe("groupWindows — dividir la franja en tramos", () => {
  it("agrupa muestras consecutivas del mismo tipo", () => {
    const w = groupWindows(samples(["sun", "sun", "shadow", "shadow", "shadow", "sun"]), STEP, endOf(6));
    expect(w.map((x) => x.kind)).toEqual(["sun", "shadow", "sun"]);
    expect(w.map((x) => (x.end - x.start) / MIN)).toEqual([20, 30, 10]);
  });

  it("el último tramo no pasa del final de la franja", () => {
    const w = groupWindows(samples(["sun", "sun"]), STEP, T0 + 15 * MIN);
    expect(w[0].end).toBe(T0 + 15 * MIN);
  });
});

describe("findBestSunWindow — la mejor ventana de la duración pedida", () => {
  it("no está obligada a empezar al principio de la franja", () => {
    const s = samples([
      "shadow",
      "shadow",
      "sun",
      "sun",
      "sun",
      "sun",
      "sun",
      "sun",
      "shadow",
      "shadow",
    ]);
    const best = findBestSunWindow(s, STEP, 60 * MIN, endOf(10));
    expect(best).not.toBeNull();
    expect(best!.startIndex).toBe(2);
    expect(best!.sunMinutes).toBe(60);
    expect(best!.longestSunRunMinutes).toBe(60);
    expect(best!.start).toBe(endOf(2));
  });

  it("recorta el tramo de sol «apretado» dentro de la ventana", () => {
    const s = samples(["partial", "sun", "sun", "sun", "partial", "shadow"]);
    const best = findBestSunWindow(s, STEP, 60 * MIN, endOf(6));
    expect(best!.sunMinutes).toBe(30);
    expect(best!.partialMinutes).toBe(20);
    expect(best!.strongStart).toBe(endOf(1));
    expect(best!.strongEnd).toBe(endOf(4));
  });

  it("a igualdad gana la ventana más temprana", () => {
    const s = samples(["sun", "sun", "sun", "sun", "sun", "sun", "sun", "sun"]);
    expect(findBestSunWindow(s, STEP, 30 * MIN, endOf(8))!.startIndex).toBe(0);
  });

  it("la noche cuenta como cero", () => {
    const s = samples(["night", "night", "sun", "sun", "sun"]);
    const best = findBestSunWindow(s, STEP, 30 * MIN, endOf(5));
    expect(best!.startIndex).toBe(2);
    expect(best!.nightMinutes).toBe(0);
  });

  it("si la duración pedida supera la franja, analiza toda la franja", () => {
    const s = samples(["sun", "shadow", "sun"]);
    const best = findBestSunWindow(s, STEP, 5 * 60 * MIN, endOf(3));
    expect(best!.startIndex).toBe(0);
    expect(best!.endIndex).toBe(2);
  });

  it("sin muestras no hay ventana", () => {
    expect(findBestSunWindow([], STEP, 60 * MIN, T0)).toBeNull();
  });
});

describe("analyzeRange — qué hay dentro de una ventana", () => {
  it("separa sol, parcial, sombra urbana, nubes e incierto", () => {
    const s = samples(["sun", "partial", "shadow", "cloud", "uncertain", "sun"]);
    const m = analyzeRange(s, 0, 5, STEP, endOf(6));
    expect(m.sunMinutes).toBe(20);
    expect(m.partialMinutes).toBe(10);
    expect(m.urbanShadowMinutes).toBe(10);
    expect(m.cloudMinutes).toBe(10);
    expect(m.uncertainMinutes).toBe(10);
    expect(m.longestSunRunMinutes).toBe(10);
  });

  it("la influencia de nubes y la confianza son medias de la ventana, sin NaN", () => {
    const m = analyzeRange(samples(["sun", "sun"]), 0, 1, STEP, endOf(2));
    expect(m.meanConfidence).toBeCloseTo(0.8, 6);
    expect(m.meanGeometryConfidence).toBeCloseTo(0.85, 6);
    expect(m.meanWeatherConfidence).toBeCloseTo(0.7, 6);
    expect(Number.isFinite(m.meanCloudInfluence)).toBe(true);
  });
});

describe("buildNarrative — «Planear mi tarde»", () => {
  it("cuenta la franja en hitos y marca el mejor momento", () => {
    const s = samples(["sun", "sun", "shadow", "shadow", "sun", "sun"]);
    const windows = groupWindows(s, STEP, endOf(6));
    const events = buildNarrative(windows, { start: endOf(4), end: endOf(6) });
    expect(events.map((e) => e.label)).toEqual(["Empieza con sol", "Sombra urbana", "Mejor sol"]);
    expect(events[2].time).toBe(endOf(4));
  });

  it("sin sol directo en toda la franja no inventa un «mejor sol»", () => {
    const windows = groupWindows(samples(["shadow", "shadow"]), STEP, endOf(2));
    const events = buildNarrative(windows, null);
    expect(events).toHaveLength(1);
    expect(events[0].label).toBe("Empieza en sombra");
  });
});
