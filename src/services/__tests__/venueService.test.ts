import { describe, expect, it } from "vitest";
import {
  combineTerrace,
  googlePlacesProvider,
  osmVenueProvider,
  ovToVenue,
  venueToSunPlace,
  type OvNode,
} from "../venueService";

const cafe = (tags: Record<string, string>, extra: Partial<OvNode> = {}): OvNode => ({
  type: "node",
  id: 1,
  lat: 41.39,
  lon: 2.17,
  tags: { amenity: "cafe", name: "Cafè", ...tags },
  ...extra,
});

describe("certeza de terraza — nunca inventar", () => {
  it("outdoor_seating=yes es una terraza confirmada", () => {
    const v = ovToVenue(cafe({ outdoor_seating: "yes" }))!;
    expect(v.terrace).toBe("confirmed");
    expect(v.terraceSource).toContain("OpenStreetMap");
  });

  it("outdoor_seating=no es que no tiene", () => {
    expect(ovToVenue(cafe({ outdoor_seating: "no" }))!.terrace).toBe("none");
  });

  it("sin etiqueta y en planta baja es solo un CANDIDATO, no un hecho", () => {
    const v = ovToVenue(cafe({}))!;
    expect(v.terrace).toBe("likely");
    expect(v.terraceSource).toContain("Candidato");
  });

  it("sin etiqueta y con muchas plantas no se puede afirmar", () => {
    expect(ovToVenue(cafe({ "building:levels": "6" }))!.terrace).toBe("unknown");
  });

  it("con 1 o 2 plantas sí es candidato", () => {
    expect(ovToVenue(cafe({ "building:levels": "1" }))!.terrace).toBe("likely");
    expect(ovToVenue(cafe({ "building:levels": "2" }))!.terrace).toBe("likely");
    expect(ovToVenue(cafe({ "building:levels": "3" }))!.terrace).toBe("unknown");
  });

  it("descarta lo que no es un negocio con nombre", () => {
    expect(ovToVenue(cafe({ amenity: "bank" }))).toBeNull();
    expect(ovToVenue({ type: "node", id: 2, lat: 41, lon: 2, tags: { amenity: "cafe" } })).toBeNull();
  });

  it("una vía sin geometría utilizable se descarta", () => {
    expect(ovToVenue({ type: "way", id: 3, tags: { amenity: "cafe", name: "X" } })).toBeNull();
  });

  it("una vía con geometría usa su punto medio", () => {
    const v = ovToVenue({
      type: "way",
      id: 4,
      tags: { amenity: "bar", name: "Bar" },
      geometry: [
        { lat: 41.38, lon: 2.16 },
        { lat: 41.4, lon: 2.18 },
      ],
    })!;
    expect(v.latitude).toBe(41.4);
    expect(v.longitude).toBe(2.18);
  });
});

describe("combinar fuente externa con lo que confirma la gente", () => {
  it("sin feedback manda la fuente", () => {
    expect(combineTerrace("likely")).toBe("likely");
    expect(combineTerrace("confirmed", undefined)).toBe("confirmed");
  });

  it("una persona que ha estado allí gana a la heurística", () => {
    expect(combineTerrace("likely", "confirmed")).toBe("confirmed");
    expect(combineTerrace("confirmed", "none")).toBe("none");
  });

  it("una persona no puede bajar de 'none' a 'likely' lo que ya estaba confirmado", () => {
    expect(combineTerrace("confirmed", "likely")).toBe("confirmed");
  });
});

describe("adaptador al motor de búsqueda", () => {
  it("un negocio se convierte en un lugar de tipo terraza", () => {
    const place = venueToSunPlace({
      id: "osm:node/1",
      name: "Cafè",
      category: "cafe",
      latitude: 41.39,
      longitude: 2.17,
      terrace: "likely",
      terraceSource: "osm",
    });
    expect(place.type).toBe("terrace");
    expect(place.metadata?.venue).toBe(true);
    expect(place.metadata?.terrace).toBe("likely");
    expect(place.polygon).toBeUndefined();
  });
});

describe("proveedores", () => {
  it("OpenStreetMap se puede usar", () => {
    expect(osmVenueProvider.info.available).toBe(true);
    expect(osmVenueProvider.info.costPerThousand).toBe(0);
    expect(osmVenueProvider.info.allowsCaching).toBe(true);
    expect(osmVenueProvider.info.allowsThirdPartyMap).toBe(true);
  });

  it("Google Places está bloqueado y explica por qué", () => {
    expect(googlePlacesProvider.info.available).toBe(false);
    expect(googlePlacesProvider.info.reason).toContain("14.2");
    expect(googlePlacesProvider.info.allowsThirdPartyMap).toBe(false);
    expect(googlePlacesProvider.info.allowsCaching).toBe(false);
  });

  it("pedirle datos a Google falla con la razón, no en silencio", async () => {
    await expect(googlePlacesProvider.loadVenues({ west: 2, east: 2.3, south: 41.3, north: 41.5 })).rejects.toThrow(
      /no-Google map|14\.2/
    );
  });
});
