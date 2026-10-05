import { describe, expect, it } from "vitest";
import { timelineRange } from "../timelineRange";

const H = 3_600_000;
const sun = { sunrise: 8 * H, sunset: 19 * H, solarNoon: 0, goldenMorningEnd: 0, goldenEveningStart: 0 };
const nextSunrise = 24 * H + 8 * H;

describe("rango de la línea de tiempo", () => {
  it("de día arranca en la hora presente y termina en la puesta de sol", () => {
    expect(timelineRange(13 * H, sun)).toEqual({ start: 13 * H, end: 19 * H });
  });

  it("de madrugada también arranca en la hora presente y cruza el amanecer", () => {
    expect(timelineRange(5 * H, sun)).toEqual({ start: 5 * H, end: 19 * H });
  });

  it("después de la puesta de sol va hasta la salida del día siguiente", () => {
    expect(timelineRange(22 * H, sun, nextSunrise)).toEqual({ start: 22 * H, end: nextSunrise });
  });

  it("en otro día ya anochecido se enseña su día completo", () => {
    expect(timelineRange(22 * H, sun)).toEqual({ start: 8 * H, end: 19 * H });
  });
});
