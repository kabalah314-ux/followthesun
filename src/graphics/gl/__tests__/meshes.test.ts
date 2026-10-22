import { describe, expect, it } from "vitest";
import { icosphere, trunkPrism } from "../meshes";

describe("mallas de los árboles", () => {
  it("la icosfera con una subdivisión tiene 42 vértices y 80 caras, todos en la esfera unidad", () => {
    const m = icosphere(1);
    expect(m.vertices.length / 6).toBe(42);
    expect(m.indices.length / 3).toBe(80);
    for (let i = 0; i < m.vertices.length; i += 6) {
      expect(Math.hypot(m.vertices[i], m.vertices[i + 1], m.vertices[i + 2])).toBeCloseTo(1, 5);
    }
    expect(Math.max(...m.indices) < 42).toBe(true);
  });

  it("el tronco es un prisma de 6 caras entre z = 0 y z = 1", () => {
    const t = trunkPrism(6);
    expect(t.vertices.length / 6).toBe(12);
    expect(t.indices.length / 3).toBe(12);
    const zs = new Set<number>();
    for (let i = 2; i < t.vertices.length; i += 6) zs.add(t.vertices[i]);
    expect([...zs].sort()).toEqual([0, 1]);
  });
});
