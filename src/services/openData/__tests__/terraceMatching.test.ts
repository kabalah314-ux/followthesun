import { describe, expect, it } from "vitest";
import type { Venue } from "../../../types";
import type { LicensedTerrace } from "../datasets";
import { LICENSED_TERRACE_SOURCE, licenseSummary, mergeLicensedTerraces, terraceRank } from "../terraceMatching";

const terrace = (over: Partial<LicensedTerrace> = {}): LicensedTerrace => ({
  id: "bcn-terrassa:41.40385,2.17344",
  address: "C. Provença, 419-425",
  neighborhood: "la Sagrada Família",
  district: "Eixample",
  latitude: 41.40385,
  longitude: 2.17344,
  areaM2: 13.5,
  tables: 6,
  chairs: 24,
  seasonal: false,
  privateSpace: false,
  onRoadway: false,
  ...over,
});

const venue = (over: Partial<Venue> = {}): Venue => ({
  id: "osm:node/1",
  name: "Bar Provença",
  category: "bar",
  latitude: 41.40392, // ≈ 8 m al norte de la licencia
  longitude: 2.17344,
  terrace: "likely",
  terraceSource: "OpenStreetMap",
  ...over,
});

describe("cruce de licencias de terraza con OpenStreetMap", () => {
  it("una licencia a ≤ 15 m de un local le da nombre, sello y la posición de las mesas", () => {
    const [v] = mergeLicensedTerraces([venue()], [terrace()]);
    expect(v.id).toBe("osm:node/1");
    expect(v.name).toBe("Bar Provença");
    expect(v.terrace).toBe("confirmed");
    expect(v.terraceSource).toBe(LICENSED_TERRACE_SOURCE);
    expect(v.latitude).toBe(41.40385);
    expect(v.metadata?.named).toBe(true);
    expect((v.metadata?.licensed as { tables: number }).tables).toBe(6);
  });

  it("sin local cerca queda como «Terraza autorizada · dirección»", () => {
    const [v] = mergeLicensedTerraces([venue({ latitude: 41.41 })], [terrace()]);
    expect(v.name).toBe("Terraza autorizada · C. Provença, 419-425");
    expect(v.category).toBe("terrace");
    expect(v.metadata?.named).toBe(false);
  });

  it("sin licencia, un local «probable» desaparece y uno confirmado en OSM se queda", () => {
    const out = mergeLicensedTerraces(
      [venue({ id: "osm:node/2", latitude: 41.39 }), venue({ id: "osm:node/3", latitude: 41.38, terrace: "confirmed" })],
      [terrace()]
    );
    expect(out.map((v) => v.id)).toEqual(["bcn-terrassa:41.40385,2.17344", "osm:node/3"]);
  });

  it("dos licencias del mismo local se suman", () => {
    const [v] = mergeLicensedTerraces(
      [venue()],
      [terrace(), terrace({ id: "bcn-terrassa:41.40388,2.17346", latitude: 41.40388, longitude: 2.17346, tables: 2, chairs: 8, onRoadway: true })]
    );
    const info = v.metadata?.licensed as { tables: number; chairs: number; licenses: number; onRoadway: boolean };
    expect(info.licenses).toBe(2);
    expect(info.tables).toBe(8);
    expect(info.chairs).toBe(32);
    expect(info.onRoadway).toBe(true);
  });

  it("sin conjunto de licencias se devuelve OpenStreetMap tal cual", () => {
    const osm = [venue()];
    expect(mergeLicensedTerraces(osm, null)).toBe(osm);
  });

  it("orden de certeza: licencia > confirmada > probable > desconocida", () => {
    expect(terraceRank("confirmed", true)).toBeGreaterThan(terraceRank("confirmed", false));
    expect(terraceRank("confirmed", false)).toBeGreaterThan(terraceRank("likely", false));
    expect(terraceRank("likely", false)).toBeGreaterThan(terraceRank("unknown", false));
  });

  it("resumen legible de la licencia", () => {
    const info = mergeLicensedTerraces([venue()], [terrace({ seasonal: true })])[0].metadata!.licensed as Parameters<typeof licenseSummary>[0];
    expect(licenseSummary(info)).toBe("Terraza con licencia municipal: 6 mesas y 24 sillas autorizadas, de temporada.");
  });
});
