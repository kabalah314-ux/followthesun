import { describe, expect, it } from "vitest";
import { sampleSeries, seaLine } from "../seaService";

const H = 3_600_000;

describe("seaService", () => {
  it("interpola la serie horaria y no inventa fuera de ella", () => {
    const arr = [20, 22, NaN, 24];
    expect(sampleSeries(0, arr, 0)).toBe(20);
    expect(sampleSeries(0, arr, 0.5 * H)).toBeCloseTo(21);
    expect(sampleSeries(0, arr, 1.5 * H)).toBe(22);
    expect(Number.isNaN(sampleSeries(0, arr, 2 * H))).toBe(true);
    expect(Number.isNaN(sampleSeries(0, arr, -H))).toBe(true);
    expect(Number.isNaN(sampleSeries(0, arr, 4 * H))).toBe(true);
  });

  it("describe el mar en una línea", () => {
    expect(seaLine({ waterC: 21.6, waveM: 0.44 })).toBe("Agua a 22 °C · olas de 0,4 m");
    expect(seaLine({ waterC: 18.2, waveM: 0.1 })).toBe("Agua a 18 °C · mar en calma");
    expect(seaLine({ waterC: 18.2, waveM: null })).toBe("Agua a 18 °C");
  });
});
