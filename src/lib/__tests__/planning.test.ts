import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNER,
  buildSearchRequest,
  durationLabel,
  planAfternoon,
  sunAt,
} from "../planning";
import { dayStartFor, hhmm, parseHHMM, zonedMs } from "../planningTime";

/**
 * 21 de junio de 2026, 12:00 en Barcelona (CEST, UTC+2) = 10:00 UTC.
 * Todos los cálculos son en la zona horaria de Barcelona, no la del dispositivo.
 */
const NOW = Date.UTC(2026, 5, 21, 10, 0);
const MIN = 60_000;
const ctx = { now: NOW, origin: null };

describe("franjas de tiempo del planificador", () => {
  it("«Ahora» dura lo que se pida", () => {
    const r = buildSearchRequest({ ...DEFAULT_PLANNER, when: "now", durationMinutes: 60 }, ctx);
    expect(r.startTime).toBe(NOW);
    expect(r.endTime).toBe(NOW + 60 * MIN);
    expect(r.minimumSunlightMinutes).toBe(60);
  });

  it("«En 30 min» y «En 1 h» desplazan el inicio", () => {
    const a = buildSearchRequest({ ...DEFAULT_PLANNER, when: "in30" }, ctx);
    const b = buildSearchRequest({ ...DEFAULT_PLANNER, when: "in60" }, ctx);
    expect(a.startTime).toBe(NOW + 30 * MIN);
    expect(b.startTime).toBe(NOW + 60 * MIN);
  });

  it("«Esta tarde» va de las 14:00 hasta las 21:00 locales (o la puesta de sol)", () => {
    const r = buildSearchRequest({ ...DEFAULT_PLANNER, when: "afternoon", durationMinutes: 60 }, ctx);
    expect(r.startTime).toBe(Date.UTC(2026, 5, 21, 12, 0)); // 14:00 CEST
    expect(r.endTime).toBe(Date.UTC(2026, 5, 21, 19, 0)); // 21:00 CEST
  });

  it("«Mañana» cubre del amanecer a la puesta de sol del día siguiente", () => {
    const r = buildSearchRequest({ ...DEFAULT_PLANNER, when: "tomorrow" }, ctx);
    expect(r.startTime).toBeGreaterThan(Date.UTC(2026, 5, 22, 3, 0));
    expect(r.startTime).toBeLessThan(Date.UTC(2026, 5, 22, 5, 30));
    expect(r.endTime).toBeGreaterThan(Date.UTC(2026, 5, 22, 18, 30));
    expect(r.endTime).toBeLessThan(Date.UTC(2026, 5, 22, 20, 30));
  });

  it("«Al atardecer» termina en la puesta de sol", () => {
    const r = buildSearchRequest({ ...DEFAULT_PLANNER, intent: "sunset", when: "sunset", durationMinutes: 30 }, ctx);
    expect(r.endTime).toBeGreaterThan(Date.UTC(2026, 5, 21, 18, 30));
    expect(r.endTime).toBeLessThan(Date.UTC(2026, 5, 21, 20, 30));
    expect(r.endTime - r.startTime).toBe(45 * MIN);
  });

  it("«Elegir hora» usa el día y las horas LOCALES elegidas", () => {
    const r = buildSearchRequest(
      { ...DEFAULT_PLANNER, when: "custom", dayOffset: 0, fromMinutes: 17 * 60, toMinutes: 19 * 60 },
      ctx
    );
    expect(r.startTime).toBe(Date.UTC(2026, 5, 21, 15, 0)); // 17:00 CEST
    expect(r.endTime).toBe(Date.UTC(2026, 5, 21, 17, 0)); // 19:00 CEST
  });

  it("la duración nunca supera la franja elegida", () => {
    const r = buildSearchRequest(
      {
        ...DEFAULT_PLANNER,
        when: "custom",
        fromMinutes: 17 * 60,
        toMinutes: 17 * 60 + 30,
        durationMinutes: 120,
      },
      ctx
    );
    expect(r.minimumSunlightMinutes).toBe(30);
  });

  it("pasa los límites de distancia, tipo y preferencias a la petición", () => {
    const origin = { lng: 2.17, lat: 41.39 };
    const r = buildSearchRequest(
      {
        ...DEFAULT_PLANNER,
        maxWalkingMinutes: 10,
        locationType: "park",
        preference: "balanced",
        avoidClouds: true,
      },
      { now: NOW, origin }
    );
    expect(r.maximumWalkingMinutes).toBe(10);
    expect(r.locationType).toBe("park");
    expect(r.preference).toBe("balanced");
    expect(r.avoidClouds).toBe(true);
    expect(r.origin).toEqual(origin);
  });
});

describe("atajos", () => {
  it("«Quiero sol a las 17:30 durante 1 h» es hoy si aún no ha pasado", () => {
    const p = sunAt(17 * 60 + 30, 60, NOW);
    expect(p.dayOffset).toBe(0);
    expect(p.fromMinutes).toBe(17 * 60 + 30);
    expect(p.toMinutes).toBe(18 * 60 + 30);
  });

  it("…y mañana si esa franja ya pasó", () => {
    const late = Date.UTC(2026, 5, 21, 18, 0); // 20:00 CEST
    expect(sunAt(17 * 60 + 30, 60, late).dayOffset).toBe(1);
  });

  it("«Planear mi tarde» es 14:00 → 19:00 (mañana si ya es tarde)", () => {
    const p = planAfternoon(NOW);
    expect([p.fromMinutes, p.toMinutes, p.dayOffset]).toEqual([14 * 60, 19 * 60, 0]);
    expect(planAfternoon(Date.UTC(2026, 5, 21, 17, 0)).dayOffset).toBe(1);
  });
});

describe("tiempo local", () => {
  it("el cambio de hora no desplaza las horas locales", () => {
    // El 29 de marzo de 2026 (domingo) se pasa al horario de verano; el 28 aún es CET (UTC+1).
    const before = Date.UTC(2026, 2, 27, 12, 0);
    const day = dayStartFor(before, 1);
    expect(zonedMs(day, 17 * 60)).toBe(Date.UTC(2026, 2, 28, 16, 0)); // 17:00 CET (UTC+1) aún
    const after = dayStartFor(before, 2); // 29 de marzo, ya CEST
    expect(zonedMs(after, 17 * 60)).toBe(Date.UTC(2026, 2, 29, 15, 0)); // 17:00 CEST (UTC+2)
  });

  it("formatea y lee horas HH:MM", () => {
    expect(hhmm(17 * 60 + 5)).toBe("17:05");
    expect(parseHHMM("17:05")).toBe(17 * 60 + 5);
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("mañana")).toBeNull();
  });

  it("etiquetas de duración legibles", () => {
    expect(durationLabel(30)).toBe("30 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(75)).toBe("1 h 15 min");
  });
});
