import { describe, expect, it } from "vitest";
import { altitudeCrossings, lightSector, photoLight, spotVerdict } from "../photoLight";
import { getSunPosition, getSunTimes } from "../solarCalculations";
import type { SunWindow } from "../../types";

const BCN = { lat: 41.3874, lng: 2.1686 };
// 00:00 en Barcelona (CEST, UTC+2) del 21 de junio y (CET, UTC+1) del 21 de diciembre de 2026.
const JUNE = Date.UTC(2026, 5, 20, 22);
const DEC = Date.UTC(2026, 11, 20, 23);
const MIN = 60_000;

describe("photoLight", () => {
  it("encuentra los cruces con la misma posición del sol que el motor (±0,05°)", () => {
    for (const day of [JUNE, DEC]) {
      for (const deg of [-6, -4, 0, 6]) {
        const c = altitudeCrossings(day, BCN.lat, BCN.lng, deg);
        expect(c.up).not.toBeNull();
        expect(c.down).not.toBeNull();
        expect(Math.abs(getSunPosition(c.up as number, BCN.lat, BCN.lng).altitudeDeg - deg)).toBeLessThan(0.05);
        expect(Math.abs(getSunPosition(c.down as number, BCN.lat, BCN.lng).altitudeDeg - deg)).toBeLessThan(0.05);
        expect(c.up as number).toBeLessThan(c.down as number);
      }
    }
  });

  it("ordena hora azul, dorada, sol y otra vez dorada y azul", () => {
    const p = photoLight(JUNE, BCN.lat, BCN.lng);
    const seq = [p.blueMorning, p.goldenMorning, p.goldenEvening, p.blueEvening];
    for (const r of seq) expect(r).not.toBeNull();
    expect(p.blueMorning?.[1]).toBe(p.goldenMorning?.[0]);
    expect(p.goldenEvening?.[1]).toBe(p.blueEvening?.[0]);
    expect((p.goldenMorning?.[1] as number) < (p.goldenEvening?.[0] as number)).toBe(true);
    // La parte con sol de cada hora dorada empieza o acaba cerca del orto y el ocaso.
    const t = getSunTimes(JUNE, BCN.lat, BCN.lng);
    expect(Math.abs((p.litMorning?.[0] as number) - t.sunrise)).toBeLessThan(2 * MIN);
    expect(Math.abs((p.litEvening?.[1] as number) - t.sunset)).toBeLessThan(2 * MIN);
  });

  it("da duraciones razonables en Barcelona (hora dorada 35–80 min, azul 10–30 min)", () => {
    for (const day of [JUNE, DEC]) {
      const p = photoLight(day, BCN.lat, BCN.lng);
      for (const r of [p.goldenMorning, p.goldenEvening]) {
        const m = ((r?.[1] as number) - (r?.[0] as number)) / MIN;
        expect(m).toBeGreaterThan(35);
        expect(m).toBeLessThan(80);
      }
      for (const r of [p.blueMorning, p.blueEvening]) {
        const m = ((r?.[1] as number) - (r?.[0] as number)) / MIN;
        expect(m).toBeGreaterThan(10);
        expect(m).toBeLessThan(30);
      }
    }
  });

  it("en verano la luz de tarde llega del oeste-noroeste y en invierno del suroeste", () => {
    const june = photoLight(JUNE, BCN.lat, BCN.lng).goldenEvening as readonly [number, number];
    const dec = photoLight(DEC, BCN.lat, BCN.lng).goldenEvening as readonly [number, number];
    const az = (t: number) => getSunPosition(t, BCN.lat, BCN.lng).azimuthDeg;
    // Ocaso en el solsticio de verano ≈ 302° y en el de invierno ≈ 238°; a +6° el sol está algo más al sur.
    expect(az(june[0])).toBeGreaterThan(285);
    expect(az(june[0])).toBeLessThan(303);
    expect(az(dec[0])).toBeGreaterThan(225);
    expect(az(dec[0])).toBeLessThan(240);
    expect(lightSector(az(dec[0]))).toBe(5);
    expect(lightSector(0)).toBe(0);
    expect(lightSector(359)).toBe(0);
    expect(lightSector(-45)).toBe(7);
  });
});

describe("spotVerdict", () => {
  const w = (kind: SunWindow["kind"], a: number, b: number): SunWindow => ({ kind, start: a * MIN, end: b * MIN });
  const R = [0, 40 * MIN] as const;

  it("junta los tramos con sol y descarta los de menos de 3 min", () => {
    const v = spotVerdict([w("shadow", 0, 10), w("sun", 10, 20), w("partial", 20, 25), w("shadow", 25, 38), w("sun", 38, 40)], R);
    expect(v).toEqual({ kind: "lit", ranges: [[10 * MIN, 25 * MIN]] });
  });

  it("dice si lo tapan los edificios o las nubes", () => {
    expect(spotVerdict([w("shadow", 0, 30), w("cloud", 30, 40)], R)).toEqual({ kind: "shadow" });
    expect(spotVerdict([w("cloud", 0, 30), w("shadow", 30, 40)], R)).toEqual({ kind: "cloud" });
    expect(spotVerdict([w("night", 0, 40)], R)).toEqual({ kind: "unknown" });
    expect(spotVerdict([], R)).toEqual({ kind: "unknown" });
  });

  it("recorta las ventanas a la franja", () => {
    const v = spotVerdict([w("sun", -30, 15)], R);
    expect(v).toEqual({ kind: "lit", ranges: [[0, 15 * MIN]] });
  });
});
