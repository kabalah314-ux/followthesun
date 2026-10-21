import { describe, expect, it } from "vitest";
import { buildVenueQuery, ovToVenue, packVenueElement, unpackVenue, type OvNode } from "../venueService";

const el = (tags: Record<string, string>, extra: Partial<OvNode> = {}): OvNode => ({
  type: "node",
  id: 42,
  lat: 41.3912345,
  lon: 2.1712345,
  tags: { amenity: "cafe", name: "Café de la Plaça", ...tags },
  ...extra,
});

describe("inventario precalculado de negocios", () => {
  it("empaqueta y desempaqueta con la misma clasificación que en vivo", () => {
    const variants: Array<Record<string, string>> = [
      { outdoor_seating: "yes" },
      {},
      { "building:levels": "5" },
      { opening_hours: "Mo-Su 08:00-20:00" },
    ];
    for (const tags of variants) {
      const source = el(tags);
      const packed = packVenueElement(source);
      expect(packed).not.toBeNull();
      const back = unpackVenue(packed!);
      const live = ovToVenue(source)!;
      expect(back).toMatchObject({
        id: live.id,
        name: live.name,
        category: live.category,
        terrace: live.terrace,
        openingHours: live.openingHours,
      });
      expect(Math.abs(back!.latitude - live.latitude)).toBeLessThan(1e-5);
    }
  });

  it("descarta lo que no es un negocio con nombre", () => {
    expect(packVenueElement(el({ name: "" }))).toBeNull();
    expect(packVenueElement(el({ amenity: "bank" }))).toBeNull();
    expect(unpackVenue(["planet/1", 41.39, 2.17, { name: "X", amenity: "bar" }])).toBeNull();
  });

  it("la consulta del ETL no lleva tope de resultados", () => {
    const b = { south: 41.3, west: 2.1, north: 41.4, east: 2.2 };
    expect(buildVenueQuery(b)).toContain("out center 600;");
    expect(buildVenueQuery(b, null, 240)).toContain("out center;");
    expect(buildVenueQuery(b, null, 240)).toContain("[timeout:240]");
  });
});
