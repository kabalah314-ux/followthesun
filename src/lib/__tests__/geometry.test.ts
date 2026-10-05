import { describe, expect, it } from "vitest";
import { pointInRing } from "../coordinates";
import {
  interiorPoint,
  pathLengthM,
  ringAreaM2,
  ringCentroid,
  samplePath,
  samplePolygon,
  stitchRings,
  type LL,
} from "../geometry";

const rect = (lng: number, lat: number, dLng: number, dLat: number): number[][] => [
  [lng, lat],
  [lng + dLng, lat],
  [lng + dLng, lat + dLat],
  [lng, lat + dLat],
  [lng, lat],
];

const SAMPLING = { areaPerPointM2: 2500, minPoints: 1, maxPoints: 12, minSpacingM: 18 };

describe("áreas y centroides", () => {
  // 0,002° de longitud ≈ 167 m y 0,001° de latitud ≈ 111 m a 41,39° N.
  const park = rect(2.17, 41.39, 0.002, 0.001);

  it("calcula la superficie en m²", () => {
    const a = ringAreaM2(park);
    expect(a).toBeGreaterThan(18_000);
    expect(a).toBeLessThan(19_200);
  });

  it("el centroide de un rectángulo es su centro", () => {
    const [lng, lat] = ringCentroid(park);
    expect(lng).toBeCloseTo(2.171, 5);
    expect(lat).toBeCloseTo(41.3905, 5);
  });

  it("el punto interior cae DENTRO aunque el centroide quede fuera (polígono en L)", () => {
    const k = 0.001;
    const L: number[][] = [
      [2.17, 41.39],
      [2.17 + 4 * k, 41.39],
      [2.17 + 4 * k, 41.39 + k],
      [2.17 + k, 41.39 + k],
      [2.17 + k, 41.39 + 4 * k],
      [2.17, 41.39 + 4 * k],
      [2.17, 41.39],
    ];
    const [cx, cy] = ringCentroid(L);
    expect(pointInRing(cx, cy, L)).toBe(false); // el centroide de una L cae en el hueco
    const [ix, iy] = interiorPoint(L);
    expect(pointInRing(ix, iy, L)).toBe(true);
  });
});

describe("muestreo dentro de un polígono", () => {
  it("un parque grande se muestrea con varios puntos, todos dentro", () => {
    const park = rect(2.17, 41.39, 0.002, 0.001);
    const pts = samplePolygon(park, SAMPLING);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts.length).toBeLessThanOrEqual(12);
    for (const [lng, lat] of pts) expect(pointInRing(lng, lat, park)).toBe(true);
  });

  it("una plazoleta pequeña se resume en un solo punto interior", () => {
    const small = rect(2.17, 41.39, 0.0004, 0.0003); // ≈ 37 m × 33 m
    const pts = samplePolygon(small, SAMPLING);
    expect(pts).toHaveLength(1);
    expect(pointInRing(pts[0][0], pts[0][1], small)).toBe(true);
  });

  it("nunca supera el máximo de puntos", () => {
    const huge = rect(2.17, 41.39, 0.02, 0.01); // ≈ 1,7 km × 1,1 km
    expect(samplePolygon(huge, SAMPLING).length).toBeLessThanOrEqual(12);
  });
});

describe("líneas", () => {
  // 0,0133° de longitud a 41,39° N ≈ 1,11 km (1° de longitud ≈ 83,5 km a esa latitud).
  const path: number[][] = [
    [2.17, 41.39],
    [2.1833, 41.39],
  ];

  it("mide la longitud en metros", () => {
    const len = pathLengthM(path);
    expect(len).toBeGreaterThan(1_090);
    expect(len).toBeLessThan(1_130);
  });

  it("reparte puntos a lo largo, extremos incluidos y con tope", () => {
    const pts = samplePath(path, 120, 8);
    expect(pts).toHaveLength(8);
    expect(pts[0][0]).toBeCloseTo(2.17, 6);
    expect(pts[7][0]).toBeCloseTo(2.1833, 6);
  });
});

describe("unir vías en anillos (relaciones multipolígono de OSM)", () => {
  const a: LL[] = [
    [0, 0],
    [1, 0],
    [1, 1],
  ];

  it("cierra un anillo con dos vías orientadas igual", () => {
    const b: LL[] = [
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const rings = stitchRings([a, b]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
  });

  it("cierra el anillo aunque una vía venga al revés", () => {
    const b: LL[] = [
      [0, 0],
      [0, 1],
      [1, 1],
    ];
    const rings = stitchRings([a, b]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it("descarta las vías que no llegan a cerrar", () => {
    expect(stitchRings([a])).toHaveLength(0);
  });
});
