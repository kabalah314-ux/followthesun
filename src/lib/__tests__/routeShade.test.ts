import { describe, expect, it } from "vitest";
import { lineLength, routeWaypoints, sampleLine, shadeSegments, summarizeShade } from "../routeShade";
import type { LngLatPair } from "../terraceShape";

const LAT = 41.39;
const M_LAT = 111_194.9;
const M_LNG = M_LAT * Math.cos(LAT * (Math.PI / 180));
const pt = (e: number, n: number): LngLatPair => [2.17 + e / M_LNG, LAT + n / M_LAT];

describe("routeShade", () => {
  const line = [pt(0, 0), pt(100, 0), pt(100, 50)];

  it("mide y muestrea la ruta cada pocos metros", () => {
    expect(lineLength(line)).toBeCloseTo(150, 1);
    const s = sampleLine(line, 15);
    expect(s[0].distM).toBe(0);
    expect(s[s.length - 1].distM).toBeCloseTo(150, 1);
    expect(s.length).toBe(11);
    // La muestra de 105 m está ya en el segundo tramo, 5 m al norte del giro.
    const s105 = s.find((x) => Math.abs(x.distM - 105) < 1e-6);
    expect(((s105?.lat ?? 0) - LAT) * M_LAT).toBeCloseTo(5, 1);
  });

  it("resume por distancia y junta los tramos con el mismo estado", () => {
    const s = sampleLine(line, 50); // 0, 50, 100, 150
    const shaded = [true, false, false, true];
    const sum = summarizeShade(s, shaded);
    expect(sum.shadePct).toBe(33);
    expect(sum.totalM).toBeCloseTo(150, 1);
    expect(sum.shadedM).toBeCloseTo(50, 1);
    const segs = shadeSegments(s, shaded);
    expect(segs.map((x) => x.shaded)).toEqual([true, false]);
    expect(segs[1].coords).toHaveLength(3);
  });

  it("reparte puntos intermedios para abrir la ruta en otra app", () => {
    const w = routeWaypoints(line, 2);
    expect(w).toHaveLength(2);
    expect((w[0][0] - 2.17) * M_LNG).toBeCloseTo(50, 0);
  });
});
