import { describe, expect, it } from "vitest";
import { TREE_KIND, genusOf, treeDims } from "../species";
import {
  TREE_FIELDS,
  crownShape,
  decodeTreeTile,
  encodeTreeTiles,
  leafDensities,
  tileOf,
  tilesForBounds,
} from "../treeTiles";

describe("porte de los árboles", () => {
  it("reconoce el género aunque el nombre traiga variedad o símbolos", () => {
    expect(genusOf("Platanus × hispanica")).toBe("platanus");
    expect(genusOf("Fraxinus angustifolia 'Raywood'")).toBe("fraxinus");
    expect(genusOf("")).toBe("");
  });

  it("un plátano adulto es grande y caducifolio", () => {
    const d = treeDims({ scientific: "Platanus x hispanica", category: "PRIMERA" });
    expect(d.kind).toBe(TREE_KIND.deciduous);
    expect(d.heightM).toBe(18);
    expect(d.crownM).toBe(13);
  });

  it("las palmeras lo son aunque la especie no esté en la tabla", () => {
    const d = treeDims({ scientific: "Palmera rara", palm: true });
    expect(d.kind).toBe(TREE_KIND.palm);
  });

  it("un chopo lombardo es estrecho", () => {
    expect(treeDims({ scientific: "Populus nigra 'Italica'" }).crownM).toBe(3);
  });

  it("sin especie conocida usa la categoría", () => {
    expect(treeDims({ scientific: "Xyz abc", category: "TERCERA" }).heightM).toBe(7);
    expect(treeDims({ scientific: "Xyz abc", category: "PRIMERA" }).heightM).toBe(15);
  });

  it("un árbol plantado hace poco es más pequeño", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const young = treeDims({ scientific: "Platanus x hispanica", category: "PRIMERA", planted: "2024-10-22", now });
    const adult = treeDims({ scientific: "Platanus x hispanica", category: "PRIMERA", planted: "1990-01-01", now });
    expect(young.heightM < adult.heightM).toBe(true);
    expect(adult.heightM).toBe(18);
  });
});

describe("teselas del arbolado", () => {
  const trees = [
    { lng: 2.1734, lat: 41.3851, kind: 1 as const, heightM: 18, crownM: 13 },
    { lng: 2.1735, lat: 41.3852, kind: 0 as const, heightM: 8, crownM: 6 },
    { lng: 2.1201, lat: 41.4021, kind: 3 as const, heightM: 15, crownM: 11 },
  ];

  it("codifica y decodifica sin perder más de medio metro", () => {
    const tiles = encodeTreeTiles(trees);
    let total = 0;
    for (const [key, file] of tiles) {
      expect(file.t.length).toBe(file.n * TREE_FIELDS);
      const d = decodeTreeTile(file)!;
      expect(d.key).toBe(key);
      total += d.count;
      for (let i = 0; i < d.count; i++) {
        const lng = d.coords[2 * i] * 360 - 180;
        const near = trees.find((t) => Math.abs(t.lng - lng) < 1e-5);
        expect(near !== undefined).toBe(true);
        expect(d.heightM[i]).toBe(near!.heightM);
        expect(d.crownM[i]).toBe(near!.crownM);
        expect(d.kind[i]).toBe(near!.kind);
      }
    }
    expect(total).toBe(3);
  });

  it("la tesela z14 del centro de Barcelona", () => {
    const t = tileOf(2.1734, 41.3851);
    expect(Math.floor(t.x)).toBe(8290);
    expect(Math.floor(t.y)).toBe(6119);
  });

  it("lista las teselas que tocan una caja", () => {
    const list = tilesForBounds({ west: 2.17, south: 41.38, east: 2.18, north: 41.39 });
    expect(list.length >= 1 && list.length <= 4).toBe(true);
    expect(list).toContain("8290/6119");
  });

  it("rechaza ficheros mal formados", () => {
    expect(decodeTreeTile({ v: 1, z: 14, x: 0, y: 0, n: 1, t: [1, 2, 3] })).toBeNull();
  });
});

describe("estaciones y copa", () => {
  it("los caducifolios pierden la hoja en invierno y la recuperan en verano", () => {
    const winter = leafDensities(new Date("2026-01-15T12:00:00Z"));
    const summer = leafDensities(new Date("2026-07-15T12:00:00Z"));
    expect(winter[1] < 0.35).toBe(true);
    expect(summer[1] > 0.7).toBe(true);
    // Los perennes no cambian.
    expect(winter[0]).toBe(summer[0]);
  });

  it("la copa de una palmera es plana y la de una conífera, alta", () => {
    const palm = crownShape(2, 12, 8);
    const pine = crownShape(3, 15, 6);
    expect(palm.rv < palm.rh).toBe(true);
    expect(pine.rv > pine.rh).toBe(true);
    expect(palm.hc + palm.rv <= 12.0001).toBe(true);
  });
});
