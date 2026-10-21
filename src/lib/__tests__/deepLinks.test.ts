import { describe, expect, it } from "vitest";
import {
  parsePlaceSlug,
  parseTimeParams,
  placeSlug,
  readDeepLink,
  shortPlaceId,
  slugify,
  timeParams,
  withTimeQuery,
} from "../deepLinks";

describe("slugs de lugar", () => {
  it("quita acentos y signos", () => {
    expect(slugify("Plaça del Sol, Gràcia!")).toBe("placa-del-sol-gracia");
    expect(slugify("¡¿?!")).toBe("lugar");
  });

  it("identificador corto de OpenStreetMap", () => {
    expect(shortPlaceId("osm:way/123")).toBe("w123");
    expect(shortPlaceId("osm:node/9")).toBe("n9");
    expect(shortPlaceId("saved:raro")).toBeNull();
  });

  it("ida y vuelta de un lugar de OpenStreetMap", () => {
    const slug = placeSlug({ id: "osm:relation/42", name: "Parc de la Ciutadella" });
    expect(slug).toBe("parc-de-la-ciutadella--r42");
    expect(parsePlaceSlug(slug!)).toEqual({ id: "osm:relation/42", name: "Parc de la ciutadella" });
  });

  it("ida y vuelta de un punto del mapa", () => {
    const slug = placeSlug({ id: "point:41.38123,2.17012", name: "Mi ubicación" })!;
    expect(slug).toBe("mi-ubicacion--p41.38123_2.17012");
    expect(parsePlaceSlug(slug)).toEqual({
      id: "point:41.38123,2.17012",
      name: "Mi ubicacion",
      point: { lat: 41.38123, lng: 2.17012 },
    });
  });

  it("un slug sin identificador no es un lugar", () => {
    expect(parsePlaceSlug("solo-un-nombre")).toBeNull();
    expect(parsePlaceSlug("nombre--x12")).toBeNull();
  });
});

describe("hora y día en la URL", () => {
  // 21/10/2026 a las 12:00 en Barcelona (horario de verano, UTC+2).
  const now = Date.parse("2026-10-21T10:00:00Z");

  it("ida y vuelta", () => {
    const t = Date.parse("2026-10-23T15:30:00Z");
    const q = timeParams(t);
    expect(q).toEqual({ hora: "17:30", dia: "2026-10-23" });
    expect(parseTimeParams(q.hora, q.dia, now)).toBe(t);
  });

  it("sin día es hoy", () => {
    expect(parseTimeParams("09:15", null, now)).toBe(Date.parse("2026-10-21T07:15:00Z"));
  });

  it("fuera de los 7 días o mal escrita: nada", () => {
    expect(parseTimeParams("17:30", "2026-11-30", now)).toBeNull();
    expect(parseTimeParams("17:30", "2026-10-20", now)).toBeNull();
    expect(parseTimeParams("25:00", null, now)).toBeNull();
    expect(parseTimeParams("17:30", "ayer", now)).toBeNull();
  });

  it("query legible que conserva otros parámetros", () => {
    expect(withTimeQuery("?debug=weather", Date.parse("2026-10-23T15:30:00Z"))).toBe(
      "?debug=weather&hora=17:30&dia=2026-10-23"
    );
    expect(withTimeQuery("?hora=10:00&dia=2026-10-21", null)).toBe("");
  });
});

describe("enlace completo", () => {
  it("lee lugar, hora y vista del mapa", () => {
    const now = Date.parse("2026-10-21T10:00:00Z");
    const link = readDeepLink("/lugar/bogatell--w55", "?hora=17:30&dia=2026-10-21&c=41.39,2.2&z=16", now);
    expect(link.place?.id).toBe("osm:way/55");
    expect(link.time).toBe(Date.parse("2026-10-21T15:30:00Z"));
    expect(link.view).toEqual({ lat: 41.39, lng: 2.2, zoom: 16 });
  });

  it("la raíz sin parámetros no trae nada", () => {
    expect(readDeepLink("/", "", Date.now())).toEqual({ place: null, time: null, view: null });
  });
});
