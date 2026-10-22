import { describe, expect, it } from "vitest";
import { planSunRoute, ROUTE_DEFAULTS, valuesFromWindows, type RouteCandidate } from "../sunRoute";

const MIN = 60_000;
/** 1 grado de latitud ≈ 111 km: 0,001° ≈ 111 m ≈ 1,5 min a pie (con rodeo). */
const walkMinutes = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  (Math.hypot(a.lat - b.lat, (a.lng - b.lng) * 0.75) * 111_000 * 1.3) / 80;

const params = { ...ROUTE_DEFAULTS, walkMinutes };
const ones = (n: number) => Array.from({ length: n }, () => 1);
const zeros = (n: number) => Array.from({ length: n }, () => 0);

describe("la ruta del sol", () => {
  it("sigue al sol: de A (primera hora) a B (segunda hora)", () => {
    const cands: RouteCandidate[] = [
      { id: "A", lat: 41.39, lng: 2.17, values: [...ones(4), ...zeros(4)] },
      { id: "B", lat: 41.392, lng: 2.17, values: [...zeros(4), ...ones(4)] },
    ];
    const r = planSunRoute(cands, params)!;
    expect(r.stops.map((s) => s.id)).toEqual(["A", "B"]);
    expect(r.stops[0]).toMatchObject({ startSlot: 0, endSlot: 4 });
    expect(r.stops[1].startSlot).toBe(4);
    expect(r.stops[1].endSlot).toBe(8);
    // Llegar a B cuesta unos minutos del primer tramo.
    expect(r.sunMinutes).toBeGreaterThan(110);
    expect(r.sunMinutes).toBeLessThanOrEqual(120);
    expect(r.walkMinutes).toBeGreaterThan(0);
  });

  it("no propone sitios demasiado lejos ni saltos más cortos que la estancia mínima", () => {
    const far: RouteCandidate[] = [
      { id: "A", lat: 41.39, lng: 2.17, values: [...ones(4), ...zeros(4)] },
      { id: "LEJOS", lat: 41.42, lng: 2.17, values: [...zeros(4), ...ones(4)] },
      { id: "C", lat: 41.391, lng: 2.171, values: [0.2, 0.2, 0.2, 0.2, 0.6, 0.6, 0.6, 0.6] },
    ];
    const r = planSunRoute(far, params)!;
    expect(r.stops.map((s) => s.id)).not.toContain("LEJOS");
    for (const s of r.stops) expect(s.endSlot - s.startSlot).toBeGreaterThanOrEqual(2);
  });

  it("entre 2 y 4 paradas; null si no cabe ninguna ruta", () => {
    const zigzag: RouteCandidate[] = ["A", "B", "C", "D", "E"].map((id, n) => ({
      id,
      lat: 41.39 + n * 0.0008,
      lng: 2.17,
      values: Array.from({ length: 16 }, (_, t) => (Math.floor(t / 3) === n ? 1 : 0)),
    }));
    const r = planSunRoute(zigzag, params)!;
    expect(r.stops.length).toBeGreaterThanOrEqual(2);
    expect(r.stops.length).toBeLessThanOrEqual(4);
    expect(planSunRoute([zigzag[0]], params)).toBeNull();
    expect(planSunRoute([], params)).toBeNull();
  });

  it("también a la sombra: los valores vienen de las ventanas de cada sitio", () => {
    const start = 0;
    const windows = [
      { kind: "sun" as const, start: 0, end: 60 * MIN },
      { kind: "shadow" as const, start: 60 * MIN, end: 120 * MIN },
    ];
    expect(valuesFromWindows(windows, start, 8, 15 * MIN, "sun")).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
    expect(valuesFromWindows(windows, start, 8, 15 * MIN, "shade")).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(valuesFromWindows([{ kind: "partial", start: 0, end: 7.5 * MIN }], 0, 1, 15 * MIN, "sun")).toEqual([0.25]);
  });

  it("30 candidatos y 32 tramos en menos de 50 ms", () => {
    const cands: RouteCandidate[] = Array.from({ length: 30 }, (_, n) => ({
      id: `c${n}`,
      lat: 41.38 + (n % 6) * 0.002,
      lng: 2.16 + Math.floor(n / 6) * 0.002,
      values: Array.from({ length: 32 }, (_, t) => (Math.sin((t + n * 3) / 5) + 1) / 2),
    }));
    planSunRoute(cands, params); // primera vuelta: el motor de JS compila la función
    const t0 = performance.now();
    const r = planSunRoute(cands, params);
    const ms = performance.now() - t0;
    expect(r).not.toBeNull();
    expect(ms).toBeLessThan(50);
  });
});
