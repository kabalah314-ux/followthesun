import { describe, expect, it } from "vitest";
import { latToMy, lngToMx, metersPerMercatorUnit } from "../../../lib/coordinates";
import { createTreeShadeTester } from "../treeShade";
import { TREE_INSTANCE_STRIDE, type TreeBatch } from "../treeStore";
import { TREE_KIND } from "../species";

const LNG = 2.1734;
const LAT = 41.3851;
const DEG = Math.PI / 180;
const SOUTH = Math.PI;
const SUMMER = [0.82, 0.8, 0.55, 0.85, 0.78];
const WINTER = [0.82, 0.2, 0.55, 0.85, 0.66];

/** Lote con árboles en metros desde el punto (x = este, y = sur). */
function batchOf(trees: Array<{ x: number; y: number; h: number; crown: number; kind: number }>): TreeBatch {
  const instances = new Float32Array(trees.length * TREE_INSTANCE_STRIDE);
  trees.forEach((t, i) => {
    const o = i * TREE_INSTANCE_STRIDE;
    instances[o] = t.x;
    instances[o + 1] = t.y;
    instances[o + 2] = t.h;
    instances[o + 3] = t.crown / 2;
    instances[o + 4] = t.kind;
    instances[o + 5] = 0.5;
  });
  return {
    ox: lngToMx(LNG),
    oy: latToMy(LAT),
    mpu: metersPerMercatorUnit(LAT),
    count: trees.length,
    instances,
    maxHeight: Math.max(0, ...trees.map((t) => t.h)),
    version: 1,
  };
}

const platano = (y: number) => ({ x: 0, y, h: 12, crown: 8, kind: TREE_KIND.deciduous });

describe("sombra de árboles en un punto (CPU)", () => {
  it("un plátano 6 m al sur tapa el sol de mediodía con la hoja de verano", () => {
    const t = createTreeShadeTester(batchOf([platano(6)]), LNG, LAT);
    expect(t.candidates).toBe(1);
    expect(t.shadeAt(SOUTH, 50 * DEG, SUMMER)).toBeCloseTo(0.8, 5);
  });

  it("en invierno, sin hoja, deja pasar casi todo el sol", () => {
    const t = createTreeShadeTester(batchOf([platano(6)]), LNG, LAT);
    expect(t.shadeAt(SOUTH, 50 * DEG, WINTER)).toBeCloseTo(0.2, 5);
  });

  it("con el sol muy alto o del otro lado no tapa", () => {
    const t = createTreeShadeTester(batchOf([platano(6)]), LNG, LAT);
    expect(t.shadeAt(SOUTH, 80 * DEG, SUMMER)).toBe(0);
    expect(t.shadeAt(0, 50 * DEG, SUMMER)).toBe(0);
    expect(t.shadeAt(SOUTH, -2 * DEG, SUMMER)).toBe(0);
  });

  it("dos copas en fila se suman como filtros (1 − (1 − d)²)", () => {
    const t = createTreeShadeTester(batchOf([platano(6), platano(14)]), LNG, LAT);
    expect(t.shadeAt(SOUTH, 35 * DEG, SUMMER)).toBeCloseTo(1 - 0.2 * 0.2, 5);
  });

  it("los árboles lejanos ni se miran", () => {
    const t = createTreeShadeTester(batchOf([platano(6), { ...platano(0), x: 300 }]), LNG, LAT);
    expect(t.candidates).toBe(1);
  });
});
