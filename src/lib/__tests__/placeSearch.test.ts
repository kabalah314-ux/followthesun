import { describe, expect, it } from "vitest";
import { areasFromPlaces, BCN_AREAS, mergeAreas } from "../areas";
import { buildNameIndex, searchPlaces } from "../placeSearch";
import { nameKey, normalizeText } from "../text";
import type { SunPlace, SunPlaceType } from "../../types";

const place = (id: string, name: string, type: SunPlaceType, lat = 41.39, lng = 2.17, metadata?: Record<string, unknown>): SunPlace => ({
  id,
  name,
  type,
  latitude: lat,
  longitude: lng,
  source: "test",
  metadata,
});

const places = [
  place("a", "Parc de la Ciutadella", "park", 41.388, 2.187),
  place("b", "Park Güell", "park", 41.414, 2.152),
  place("c", "Plaça del Sol", "square", 41.401, 2.157),
  place("d", "Bar del Sol", "terrace", 41.402, 2.158),
  place("e", "Platja de la Barceloneta", "beach", 41.378, 2.192),
  place("f", "Plaça del Sol", "square", 41.4011, 2.1571),
];

describe("texto normalizado", () => {
  it("quita acentos, apóstrofos y guiones; conserva las horas", () => {
    expect(normalizeText("L'Antiga Esquerra de l'Eixample")).toBe("l antiga esquerra de l eixample");
    expect(normalizeText("Poble-sec · Col·legi")).toBe("poble sec collegi");
    expect(normalizeText("a las 17.30 o 17h30")).toBe("a las 17:30 o 17:30");
    expect(nameKey("la Vila de Gràcia")).toBe("vila de gracia");
  });
});

describe("búsqueda por nombre", () => {
  const index = buildNameIndex(places);

  it("el nombre exacto gana; un mismo sitio no se repite", () => {
    const r = searchPlaces(index, "Plaça del Sol");
    expect(r[0].place.id).toBe("c");
    expect(r.filter((x) => x.place.name === "Plaça del Sol")).toHaveLength(1);
  });

  it("encuentra por una palabra y sin acentos", () => {
    expect(searchPlaces(index, "ciutadella")[0].place.id).toBe("a");
    expect(searchPlaces(index, "guell")[0].place.id).toBe("b");
    expect(searchPlaces(index, "parque guell")[0].place.id).toBe("b");
    expect(searchPlaces(index, "barcelone")[0].place.id).toBe("e");
  });

  it("entre nombres parecidos, primero el destino conocido", () => {
    const r = searchPlaces(index, "del sol");
    expect(r[0].place.type).toBe("square");
    expect(r.map((x) => x.place.id)).toContain("d");
  });

  it("textos de menos de dos letras no buscan", () => {
    expect(searchPlaces(index, "p")).toEqual([]);
  });
});

describe("barrios", () => {
  it("salen del inventario (centro = media de sus lugares) y se unen a la lista corta", () => {
    const inv = [
      place("x1", "Font 1", "fountain", 41.4, 2.15, { neighborhood: "la Vila de Gràcia", district: "Gràcia" }),
      place("x2", "Font 2", "fountain", 41.402, 2.157, { neighborhood: "la Vila de Gràcia", district: "Gràcia" }),
      place("x3", "Joc", "playground", 41.404, 2.16, { neighborhood: "la Vila de Gràcia", district: "Gràcia" }),
      place("y1", "WC", "toilet", 41.43, 2.18, { neighborhood: "la Prosperitat" }),
    ];
    const derived = areasFromPlaces(inv);
    expect(derived.map((a) => a.name).sort()).toEqual(["Gràcia", "La Vila de Gràcia"]);
    const merged = mergeAreas(BCN_AREAS, derived);
    const gracia = merged.find((a) => a.name === "Gràcia" && a.kind === "barrio")!;
    expect(gracia.lat).toBe(41.402);
    expect(gracia.lng).toBe(2.15567);
    // «La Vila de Gràcia» ya era un alias de «Gràcia»: no se duplica.
    expect(merged.filter((a) => nameKey(a.name) === "vila de gracia")).toHaveLength(0);
    // El distrito de Gràcia se llama igual que el barrio: una sola entrada (y la Prosperitat no
    // llega a 3 lugares).
    expect(merged.filter((a) => nameKey(a.name) === "gracia")).toHaveLength(1);
    expect(merged.some((a) => a.name.includes("Prosperitat"))).toBe(false);
  });
});
