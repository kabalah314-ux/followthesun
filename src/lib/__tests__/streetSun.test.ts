import { describe, expect, it } from "vitest";
import { latToMy, lngToMx } from "../coordinates";
import { getSunPosition } from "../solarCalculations";
import { alignmentsIn, facadeDistance, offsetPoint, sectorOf, streetAlignments, streetBearingAt, yearSun } from "../streetSun";

const LNG = 2.17;
const LAT = 41.39;
const M_LAT = 111_194.9;
const M_LNG = M_LAT * Math.cos(LAT * (Math.PI / 180));
const pt = (e: number, n: number): [number, number] => [LNG + e / M_LNG, LAT + n / M_LAT];

describe("streetSun", () => {
  it("da el rumbo del tramo más cercano y el punto del eje", () => {
    // Calle este-oeste 5 m al sur del punto y otra norte-sur a 40 m.
    const hit = streetBearingAt([[pt(-50, -5), pt(50, -5)], [pt(40, -50), pt(40, 50)]], LNG, LAT);
    expect(hit?.bearingDeg).toBeCloseTo(90, 3);
    expect(hit?.distM).toBeCloseTo(5, 2);
    expect(((hit?.lat ?? 0) - LAT) * M_LAT).toBeCloseTo(-5, 2);
    // Diagonal tipo Eixample (≈ 45°).
    const diag = streetBearingAt([[pt(-30, -30), pt(30, 30)]], LNG, LAT);
    expect(diag?.bearingDeg).toBeCloseTo(45, 1);
    expect(streetBearingAt([[pt(-30, 60), pt(30, 60)]], LNG, LAT, 25)).toBeNull();
  });

  it("mide hasta la fachada en cada acera", () => {
    // Edificio al norte, con su fachada a 8 m del eje.
    const ring = [pt(-20, 8), pt(20, 8), pt(20, 30), pt(-20, 30)].map(([lng, lat]) => [lngToMx(lng), latToMy(lat)]);
    const xs = ring.map((r) => r[0]);
    const ys = ring.map((r) => r[1]);
    const set = { count: 1, coords: ring.flat(), offsets: [0, 4], bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    const d = facadeDistance(set, LNG, LAT, 0) ?? 0;
    expect(d).toBeGreaterThan(7.9);
    expect(d).toBeLessThan(8.6); // pasos de 0,5 m
    expect(facadeDistance(set, LNG, LAT, 180)).toBeNull();
    const [lng2, lat2] = offsetPoint(LNG, LAT, 90, 10);
    expect((lng2 - LNG) * M_LNG).toBeCloseTo(10, 3);
    expect(lat2).toBeCloseTo(LAT, 9);
  });

  it("el Paral·lel (este-oeste) alinea el sol con los equinoccios y el Eixample nunca", () => {
    const year = 2026;
    const ew = streetAlignments(year, LAT, LNG, 90);
    const rise = ew.find((a) => a.kind === "rise");
    const set = ew.find((a) => a.kind === "set");
    expect(rise?.days.length).toBe(2);
    expect(set?.days.length).toBe(2);
    const months = (set?.days ?? []).map((d) => new Date(d.time).getUTCMonth());
    expect(months).toEqual([2, 8]); // marzo y septiembre
    for (const d of set?.days ?? []) expect(Math.abs(getSunPosition(d.time, LAT, LNG).azimuthDeg - 270)).toBeLessThan(0.8);
    // Las calles del Eixample (≈ 44,5° y 134,5°) quedan fuera del abanico de salidas y puestas.
    expect(streetAlignments(year, LAT, LNG, 44.5)).toEqual([]);
    expect(streetAlignments(year, LAT, LNG, 134.5)).toEqual([]);
  });

  it("junto al solsticio vale el día más cercano y fuera del abanico no hay nada", () => {
    const ys = yearSun(2026, LAT, LNG);
    const maxRise = Math.max(...ys.rise.map((s) => s?.az ?? 0));
    expect(alignmentsIn(ys.rise, maxRise - 0.1).length).toBeGreaterThanOrEqual(1);
    expect(alignmentsIn(ys.rise, 10)).toEqual([]);
    expect(sectorOf(359)).toBe(0);
    expect(sectorOf(225)).toBe(5);
  });
});
