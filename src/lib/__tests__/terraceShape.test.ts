import { describe, expect, it } from "vitest";
import { distanceMeters, latToMy, lngToMx } from "../coordinates";
import { nearestFacade, terraceDims, terraceShape, TERRACE_GRID } from "../terraceShape";

const LNG = 2.17;
const LAT = 41.39;
const M_LAT = 111_194.9;
const M_LNG = M_LAT * Math.cos(LAT * (Math.PI / 180));

/** Un edificio rectangular de `w` × `h` m cuyo lado sur está `gapM` m al norte del punto. */
function buildingNorthOf(gapM: number, w = 40, h = 20) {
  const ring: Array<[number, number]> = [
    [-w / 2, gapM],
    [w / 2, gapM],
    [w / 2, gapM + h],
    [-w / 2, gapM + h],
  ];
  const coords: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [e, n] of ring) {
    const x = lngToMx(LNG + e / M_LNG);
    const y = latToMy(LAT + n / M_LAT);
    coords.push(x, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { count: 1, coords, offsets: [0, 4], bbox: [minX, minY, maxX, maxY] };
}

describe("terraceShape", () => {
  it("mantiene la superficie con el fondo de una acera", () => {
    for (const a of [6, 20, 45, 120]) {
      const d = terraceDims(a);
      expect(d.depthM).toBeGreaterThanOrEqual(1.5);
      expect(d.depthM).toBeLessThanOrEqual(8);
      expect(d.lengthM).toBeLessThanOrEqual(30);
      expect(d.lengthM * d.depthM).toBeCloseTo(a, 5);
    }
    expect(terraceDims(20).depthM).toBeCloseTo(Math.sqrt(20 / 3), 5);
  });

  it("encuentra la fachada, su rumbo y el lado de la calle", () => {
    const f = nearestFacade(buildingNorthOf(4), LNG, LAT);
    expect(f).not.toBeNull();
    expect(Math.abs(((f?.bearingDeg ?? 0) + 90) % 180 - 90)).toBeGreaterThan(89); // lado este-oeste: 90°
    expect(f?.distM).toBeCloseTo(4, 0);
    // La calle (el punto) queda al sur del edificio.
    expect(f?.outward[1]).toBeLessThan(-0.99);
    expect(nearestFacade(buildingNorthOf(60), LNG, LAT, 30)).toBeNull();
  });

  it("dibuja el rectángulo paralelo a la fachada sin meterse en el edificio", () => {
    const f = nearestFacade(buildingNorthOf(0.5), LNG, LAT);
    const s = terraceShape(LNG, LAT, 20, f);
    expect(s.cells).toHaveLength(TERRACE_GRID * TERRACE_GRID);
    expect(s.ring).toHaveLength(5);
    // Ningún vértice al norte de la fachada (0,5 m al norte del punto).
    for (const [, lat] of s.ring) expect((lat - LAT) * M_LAT).toBeLessThanOrEqual(0.51);
    // Largo a lo largo de la fachada (este-oeste).
    const [a, b] = s.ring;
    expect(distanceMeters(a[0], a[1], b[0], b[1])).toBeCloseTo(s.lengthM, 1);
    expect(Math.abs((b[1] - a[1]) * M_LAT)).toBeLessThan(0.01);
  });

  it("sin fachada conocida queda centrado en el punto", () => {
    const s = terraceShape(LNG, LAT, 12, null);
    const cx = s.cells.reduce((acc, c) => acc + c.center[0], 0) / s.cells.length;
    const cy = s.cells.reduce((acc, c) => acc + c.center[1], 0) / s.cells.length;
    expect(distanceMeters(cx, cy, LNG, LAT)).toBeLessThan(0.01);
  });
});
