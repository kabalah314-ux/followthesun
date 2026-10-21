import { describe, expect, it } from "vitest";
import { presentOnDay, timelineRange, TWILIGHT_MARGIN_MS as M } from "../timelineRange";

const H = 3_600_000;
const D = 24 * H;
const sun = { sunrise: 8 * H, sunset: 19 * H, goldenMorningEnd: 9 * H, goldenEveningStart: 18 * H };
const next = { sunrise: 32 * H, sunset: 43 * H, goldenMorningEnd: 33 * H, goldenEveningStart: 42 * H };

describe("rango de la línea de tiempo", () => {
  it("de día enseña el día completo, del amanecer a la puesta con crepúsculo", () => {
    expect(timelineRange(13 * H, sun, next)).toMatchObject({ start: 8 * H - M, end: 19 * H + M, nextDay: false });
  });

  it("de madrugada enseña el día que empieza", () => {
    expect(timelineRange(5 * H, sun, next)).toMatchObject({ start: 8 * H - M, end: 19 * H + M, nextDay: false });
  });

  it("durante el crepúsculo de la tarde sigue en el día de hoy", () => {
    expect(timelineRange(19 * H + 10 * 60_000, sun, next).nextDay).toBe(false);
  });

  it("de noche enseña el día siguiente", () => {
    const r = timelineRange(22 * H, sun, next);
    expect(r).toMatchObject({ start: 32 * H - M, end: 43 * H + M, nextDay: true });
    expect(r.sun).toBe(next);
  });

  it("en otro día ya anochecido se enseña su día completo", () => {
    expect(timelineRange(22 * H, sun)).toMatchObject({ start: 8 * H - M, end: 19 * H + M, nextDay: false });
  });
});

describe("hora presente de un día", () => {
  it("hoy devuelve la hora actual", () => {
    const now = new Date("2026-10-06T12:30:00Z").getTime();
    expect(presentOnDay(now, 0)).toBe(now);
  });

  it("mañana devuelve la misma hora sobre el día siguiente", () => {
    const now = new Date("2026-10-06T12:30:00Z").getTime();
    expect(presentOnDay(now, 1) - presentOnDay(now, 0)).toBe(D);
  });
});
