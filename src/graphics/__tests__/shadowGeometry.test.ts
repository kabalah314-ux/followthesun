import { describe, expect, it } from "vitest";
import { buildBuildingSet } from "../../services/buildingService";
import { latToMy, lngToMx, metersPerMercatorUnit } from "../../lib/coordinates";
import {
  ROOF_EDGE_STRIDE,
  SHADOW_VERTEX_STRIDE,
  buildShadowGeometry,
  shadowSourceKey,
  type ShadowGeometry,
} from "../shadowGeometry";
import { toShadowSource } from "../shadowGeometryClient";

/** Cuadrado de `side` metros con esquina SO en (lng, lat). */
function square(lng: number, lat: number, side: number, props: Record<string, unknown>) {
  const dLat = side / 111_320;
  const dLng = side / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng, lat],
          [lng + dLng, lat],
          [lng + dLng, lat + dLat],
          [lng, lat + dLat],
          [lng, lat],
        ],
      ],
    },
    properties: props,
  };
}

const coverage = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
const set = buildBuildingSet(
  [
    square(2.17, 41.39, 20, { render_height: 30 }),
    square(2.1706, 41.39, 10, { render_height: 6 }),
    square(2.1712, 41.39, 12, { render_height: 40, hide_3d: true }),
  ],
  coverage,
  "test"
);

/** Aplica la misma cuenta que el vertex shader de la máscara. */
function project(g: ShadowGeometry, v: number, azimuth: number, altitude: number, maxLen = 380) {
  const o = v * SHADOW_VERTEX_STRIDE;
  const [x, y, h, k] = [g.vertices[o], g.vertices[o + 1], g.vertices[o + 2], g.vertices[o + 3]];
  const len = Math.min(h / Math.tan(altitude), maxLen);
  const d = k * len;
  return [x - Math.sin(azimuth) * d, y + Math.cos(azimuth) * d] as const;
}

function inTriangle(p: readonly [number, number], a: readonly number[], b: readonly number[], c: readonly number[]) {
  const s = (p1: readonly number[], p2: readonly number[], p3: readonly number[]) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Valor final de la máscara en un punto, pintando en orden (como la GPU). */
function maskAt(g: ShadowGeometry, p: readonly [number, number], azimuth: number, altitude: number) {
  let value = 0;
  for (let b = 0; b < g.ranges.length; b += 4) {
    for (const [start, count, v] of [
      [g.ranges[b], g.ranges[b + 1], 1],
      [g.ranges[b + 2], g.ranges[b + 3], 0],
    ]) {
      for (let i = start; i < start + count; i += 3) {
        const A = project(g, g.indices[i], azimuth, altitude);
        const B = project(g, g.indices[i + 1], azimuth, altitude);
        const C = project(g, g.indices[i + 2], azimuth, altitude);
        if (inTriangle(p, A, B, C)) value = v;
      }
    }
  }
  return value;
}

describe("buildShadowGeometry", () => {
  const g = buildShadowGeometry(toShadowSource(set));

  it("dos anillos por edificio (base y extremo) en metros locales", () => {
    expect(g.buildings).toBe(3);
    expect(g.vertices.length).toBe((2 * 4 + 2 * 4 + 2 * 4) * SHADOW_VERTEX_STRIDE);
    // El origen está cerca: ninguna coordenada local pasa de unos cientos de metros.
    for (let i = 0; i < g.vertices.length; i += SHADOW_VERTEX_STRIDE) {
      expect(Math.abs(g.vertices[i])).toBeLessThan(200);
      expect(Math.abs(g.vertices[i + 1])).toBeLessThan(200);
    }
    expect(g.mpu).toBeCloseTo(metersPerMercatorUnit(41.39), -2);
    expect(g.maxHeight).toBe(40);
  });

  it("índices: sombra (huella proyectada + barridos) y recorte (huella) por clase de altura", () => {
    let shadow = 0;
    let cut = 0;
    for (let b = 0; b < g.ranges.length; b += 4) {
      shadow += g.ranges[b + 1];
      cut += g.ranges[b + 3];
    }
    // Cuadrado: 2 triángulos de huella; 4 aristas × 2 triángulos de barrido.
    expect(shadow).toBe(3 * (6 + 24));
    expect(cut).toBe(3 * 6);
    expect(g.indices.length).toBe(shadow + cut);
  });

  it("aristas de tejado con la altura del mapa, sin los contornos `hide_3d`", () => {
    expect(g.edgeCount).toBe(8);
    expect(g.edges.length).toBe(8 * ROOF_EDGE_STRIDE);
    expect(g.edges[4]).toBe(30);
  });

  it("la sombra cae al lado contrario del sol y el tejado queda iluminado", () => {
    // Sol al sur (azimut 180°) a 45°: el edificio de 30 m proyecta 30 m de sombra hacia el norte.
    const az = Math.PI;
    const alt = Math.PI / 4;
    const ox = (lngToMx(2.17) - g.ox) * g.mpu;
    const oy = (latToMy(41.39) - g.oy) * g.mpu;
    // Norte = y negativa en coordenadas locales (y crece hacia el sur).
    expect(maskAt(g, [ox + 10, oy - 20 - 15], az, alt)).toBe(1);
    expect(maskAt(g, [ox + 10, oy - 20 - 40], az, alt)).toBe(0);
    expect(maskAt(g, [ox + 10, oy + 15], az, alt)).toBe(0);
    // Tejado del propio edificio: iluminado.
    expect(maskAt(g, [ox + 10, oy - 10], az, alt)).toBe(0);
  });

  it("la clave de caché reconoce el mismo conjunto y distingue otro", () => {
    const src = toShadowSource(set);
    expect(shadowSourceKey(src)).toBe(shadowSourceKey(toShadowSource(set)));
    const other = buildBuildingSet([square(2.18, 41.4, 20, { render_height: 30 })], coverage, "test");
    expect(shadowSourceKey(toShadowSource(other))).not.toBe(shadowSourceKey(src));
  });
});
