import { describe, expect, it } from "vitest";
import { bestMoment, hourCells, sunMinutesOf } from "../weekGrid";
import { dayStartFor, zonedMs } from "../planningTime";

const DAY0 = dayStartFor(Date.UTC(2026, 9, 21, 10), 0);
const at = (h: number, m = 0) => zonedMs(DAY0, h * 60 + m);

describe("esta semana: cuadrícula de horas", () => {
  const windows = [
    { kind: "shadow" as const, start: at(8), end: at(10, 40) },
    { kind: "sun" as const, start: at(10, 40), end: at(14) },
    { kind: "cloud" as const, start: at(14), end: at(15, 10) },
    { kind: "sun" as const, start: at(15, 10), end: at(16), unverified: true },
  ];

  it("cada hora toma el estado que más dura", () => {
    const cells = hourCells(windows, DAY0, [9, 10, 11, 14, 15, 20]);
    expect(cells.map((c) => c.state)).toEqual(["shade", "shade", "sun", "cloud", "sun", "night"]);
    expect(cells[4].unverified).toBe(true);
    expect(cells[2].unverified).toBe(false);
  });

  it("el mejor momento es el tramo de sol más largo", () => {
    expect(bestMoment(windows)).toEqual({ start: at(10, 40), end: at(14) });
    expect(bestMoment([{ kind: "sun", start: at(9), end: at(9, 20) }])).toBeNull();
  });

  it("los minutos de sol cuentan el sol suave a medias", () => {
    expect(sunMinutesOf([{ kind: "sun", start: at(9), end: at(10) }, { kind: "partial", start: at(10), end: at(11) }])).toBe(90);
  });
});
