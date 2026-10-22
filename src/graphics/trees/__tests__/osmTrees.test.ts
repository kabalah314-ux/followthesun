import { describe, expect, it } from "vitest";
import { mergeTrees, osmTreeRecord } from "../osmTrees";
import { TREE_KIND } from "../species";
import type { TreeRecord } from "../treeTiles";

const tree = (lng: number, lat: number): TreeRecord => ({ lng, lat, kind: TREE_KIND.deciduous, heightM: 9, crownM: 5 });

const NOW = new Date("2026-10-22T12:00:00Z");

describe("osmTreeRecord", () => {
  it("usa el porte de la especie", () => {
    const t = osmTreeRecord(2.17, 41.39, { species: "Platanus x hispanica" }, NOW);
    expect(t.kind).toBe(TREE_KIND.deciduous);
    expect(t.heightM).toBeGreaterThanOrEqual(15);
  });

  it("respeta la altura y la copa medidas", () => {
    const t = osmTreeRecord(2.17, 41.39, { genus: "Celtis", height: "9,5 m", diameter_crown: "7" }, NOW);
    expect(t.heightM).toBe(9.5);
    expect(t.crownM).toBe(7);
  });

  it("sin especie, decide por el tipo de hoja; las palmeras por el género", () => {
    expect(osmTreeRecord(2.17, 41.39, { leaf_type: "needleleaved" }, NOW).kind).toBe(TREE_KIND.conifer);
    expect(osmTreeRecord(2.17, 41.39, { leaf_cycle: "evergreen" }, NOW).kind).toBe(TREE_KIND.evergreen);
    expect(osmTreeRecord(2.17, 41.39, { species: "Washingtonia robusta" }, NOW).kind).toBe(TREE_KIND.palm);
  });

  it("descarta medidas absurdas", () => {
    const t = osmTreeRecord(2.17, 41.39, { height: "300" }, NOW);
    expect(t.heightM).toBeLessThanOrEqual(45);
  });
});

describe("mergeTrees", () => {
  const base = [tree(2.17, 41.39)];

  it("no repite el mismo árbol de las dos fuentes", () => {
    // ~1,1 m al norte: el mismo árbol.
    const r = mergeTrees(base, [tree(2.17, 41.39001)]);
    expect(r.added).toBe(0);
    expect(r.trees).toHaveLength(1);
  });

  it("añade los que están lejos", () => {
    // ~11 m al norte y ~8 m al este.
    const r = mergeTrees(base, [tree(2.17, 41.3901), tree(2.1701, 41.39)]);
    expect(r.added).toBe(2);
    expect(r.trees).toHaveLength(3);
  });

  it("funciona sin base", () => {
    expect(mergeTrees([], [tree(2.17, 41.39)]).added).toBe(1);
    expect(mergeTrees([], []).trees).toHaveLength(0);
  });
});
