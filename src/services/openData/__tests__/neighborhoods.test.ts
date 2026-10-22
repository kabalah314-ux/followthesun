import { describe, expect, it } from "vitest";
import {
  createNeighborhoodIndex,
  parseWktPolygons,
  pointInPolygonRings,
  splitBounds,
  toNeighborhoods,
} from "../neighborhoods";

const SQUARE = "POLYGON ((2.0 41.0, 2.1 41.0, 2.1 41.1, 2.0 41.1, 2.0 41.0))";
const WITH_HOLE =
  "POLYGON ((2.0 41.0, 2.1 41.0, 2.1 41.1, 2.0 41.1, 2.0 41.0), (2.04 41.04, 2.06 41.04, 2.06 41.06, 2.04 41.06, 2.04 41.04))";
const MULTI =
  "MULTIPOLYGON (((2.0 41.0, 2.1 41.0, 2.1 41.1, 2.0 41.1, 2.0 41.0)), ((2.2 41.2, 2.3 41.2, 2.3 41.3, 2.2 41.3, 2.2 41.2)))";

describe("parseWktPolygons", () => {
  it("lee un POLYGON simple como [lng, lat]", () => {
    const p = parseWktPolygons(SQUARE);
    expect(p).toHaveLength(1);
    expect(p[0]).toHaveLength(1);
    expect(p[0][0][0]).toEqual([2.0, 41.0]);
    expect(p[0][0]).toHaveLength(5);
  });

  it("conserva los huecos", () => {
    const p = parseWktPolygons(WITH_HOLE);
    expect(p[0]).toHaveLength(2);
  });

  it("lee un MULTIPOLYGON", () => {
    const p = parseWktPolygons(MULTI);
    expect(p).toHaveLength(2);
    expect(p[1][0][0]).toEqual([2.2, 41.2]);
  });

  it("ignora Z y textos que no son polígonos", () => {
    expect(parseWktPolygons("POLYGON Z ((2 41 5, 3 41 5, 3 42 5, 2 42 5, 2 41 5))")[0][0][1]).toEqual([3, 41]);
    expect(parseWktPolygons("POINT (2 41)")).toEqual([]);
    expect(parseWktPolygons("")).toEqual([]);
  });
});

describe("pointInPolygonRings", () => {
  it("excluye los puntos de un hueco", () => {
    const [rings] = parseWktPolygons(WITH_HOLE);
    expect(pointInPolygonRings(2.02, 41.02, rings)).toBe(true);
    expect(pointInPolygonRings(2.05, 41.05, rings)).toBe(false);
    expect(pointInPolygonRings(2.5, 41.5, rings)).toBe(false);
  });
});

describe("createNeighborhoodIndex", () => {
  const list = toNeighborhoods([
    { codi_barri: "1", nom_barri: "el Raval", codi_districte: "1", nom_districte: "Ciutat Vella", geometria_wgs84: SQUARE },
    { codi_barri: "2", nom_barri: "Gràcia", codi_districte: "6", nom_districte: "Gràcia", geometria_wgs84: MULTI.replace(/2\.0 /g, "9.0 ") },
    { codi_barri: "3", nom_barri: "Sin geometría", geometria_wgs84: "" },
  ]);

  it("descarta los registros sin geometría", () => {
    expect(list.map((n) => n.name)).toEqual(["el Raval", "Gràcia"]);
  });

  it("encuentra el barrio y el distrito de un punto", () => {
    const index = createNeighborhoodIndex(list);
    expect(index.locate(41.05, 2.05)).toEqual({ name: "el Raval", district: "Ciutat Vella", code: "1" });
    expect(index.locate(41.25, 2.25)?.name).toBe("Gràcia");
    expect(index.locate(40, 0)).toBeNull();
  });
});

describe("splitBounds", () => {
  it("cubre la caja entera sin huecos", () => {
    const b = { south: 41.317, west: 2.052, north: 41.468, east: 2.229 };
    const tiles = splitBounds(b, 3, 3);
    expect(tiles).toHaveLength(9);
    expect(tiles[0].south).toBe(b.south);
    expect(tiles[0].west).toBe(b.west);
    expect(tiles[8].north).toBe(b.north);
    expect(tiles[8].east).toBe(b.east);
    expect(tiles[1].west).toBeCloseTo(tiles[0].east, 12);
    expect(tiles[3].south).toBeCloseTo(tiles[0].north, 12);
  });
});
