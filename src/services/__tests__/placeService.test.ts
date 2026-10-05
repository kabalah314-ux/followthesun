import { describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  classifyTags,
  countByType,
  createCoordinatePlace,
  elementToPlace,
  normalizeOverpass,
  type OvElement,
} from "../placeService";

/**
 * Se prueba la NORMALIZACIÓN con elementos en el formato documentado de Overpass (`out geom`).
 * No se ha podido contrastar la respuesta real del servidor desde el entorno de desarrollo.
 */

const pt = (lat: number, lon: number) => ({ lat, lon });

const parkWay: OvElement = {
  type: "way",
  id: 1,
  tags: { leisure: "park", name: "Parc de Prova" },
  // ≈ 334 m × 333 m
  geometry: [pt(41.39, 2.17), pt(41.39, 2.174), pt(41.393, 2.174), pt(41.393, 2.17), pt(41.39, 2.17)],
};

const squareRelation: OvElement = {
  type: "relation",
  id: 2,
  tags: { type: "multipolygon", place: "square", name: "Plaça de Prova" },
  members: [
    { type: "way", ref: 10, role: "outer", geometry: [pt(41.4, 2.18), pt(41.4, 2.184), pt(41.403, 2.184)] },
    { type: "way", ref: 11, role: "outer", geometry: [pt(41.403, 2.184), pt(41.403, 2.18), pt(41.4, 2.18)] },
  ],
};

const terraceNode: OvElement = {
  type: "node",
  id: 3,
  lat: 41.4,
  lon: 2.17,
  tags: { amenity: "cafe", outdoor_seating: "yes", name: "Cafè de Prova" },
};

describe("clasificación de etiquetas OSM", () => {
  it("reconoce cada tipo de lugar", () => {
    expect(classifyTags({ natural: "beach" })).toBe("beach");
    expect(classifyTags({ leisure: "park" })).toBe("park");
    expect(classifyTags({ leisure: "garden" })).toBe("park");
    expect(classifyTags({ place: "square" })).toBe("square");
    expect(classifyTags({ tourism: "viewpoint" })).toBe("viewpoint");
    expect(classifyTags({ highway: "pedestrian", area: "yes" })).toBe("open_space");
    expect(classifyTags({ leisure: "common" })).toBe("open_space");
    expect(classifyTags({ amenity: "bar", outdoor_seating: "yes" })).toBe("terrace");
  });

  it("una plaza que además es zona peatonal es plaza; un café sin terraza no es nada", () => {
    expect(classifyTags({ place: "square", highway: "pedestrian", area: "yes" })).toBe("square");
    expect(classifyTags({ amenity: "cafe" })).toBeNull();
    expect(classifyTags({ amenity: "cafe", outdoor_seating: "no" })).toBeNull();
    expect(classifyTags({ shop: "bakery" })).toBeNull();
  });
});

describe("normalización de elementos Overpass", () => {
  it("una vía cerrada se convierte en un polígono con superficie y punto interior", () => {
    const p = elementToPlace(parkWay);
    expect(p).not.toBeNull();
    expect(p!.type).toBe("park");
    expect(p!.id).toBe("osm:way/1");
    expect(p!.polygon!.coordinates[0]).toHaveLength(5);
    expect(p!.areaM2!).toBeGreaterThan(100_000);
    expect(p!.latitude).toBeGreaterThan(41.39);
    expect(p!.latitude).toBeLessThan(41.393);
  });

  it("una relación multipolígono une sus vías exteriores en un anillo", () => {
    const p = elementToPlace(squareRelation);
    expect(p).not.toBeNull();
    expect(p!.type).toBe("square");
    expect(p!.polygon).toBeDefined();
    expect(p!.areaM2!).toBeGreaterThan(100_000);
  });

  it("una terraza es un punto con la ubicación marcada como aproximada", () => {
    const p = elementToPlace(terraceNode);
    expect(p!.type).toBe("terrace");
    expect(p!.polygon).toBeUndefined();
    expect(p!.metadata?.locationApproximate).toBe(true);
    expect(p!.metadata?.amenity).toBe("cafe");
  });

  it("un mirador en un nodo es válido", () => {
    const p = elementToPlace({ type: "node", id: 4, lat: 41.42, lon: 2.16, tags: { tourism: "viewpoint", name: "Mirador de Prova" } });
    expect(p!.type).toBe("viewpoint");
  });

  it("una playa mapeada como línea abierta se analiza a lo largo del trazado", () => {
    const p = elementToPlace({
      type: "way",
      id: 6,
      tags: { natural: "beach", name: "Platja de Prova" },
      geometry: [pt(41.38, 2.19), pt(41.38, 2.1969)], // ≈ 576 m
    });
    expect(p!.type).toBe("beach");
    expect(p!.polygon).toBeUndefined();
    expect(p!.path!.length).toBe(2);
  });

  it("descarta lo que no se puede ofrecer: sin nombre, demasiado pequeño o un parque en un nodo", () => {
    expect(elementToPlace({ ...parkWay, tags: { leisure: "park" } })).toBeNull();
    const tiny: OvElement = {
      type: "way",
      id: 7,
      tags: { leisure: "park", name: "Jardinet" },
      geometry: [pt(41.39, 2.17), pt(41.39, 2.1705), pt(41.3904, 2.1705), pt(41.3904, 2.17), pt(41.39, 2.17)], // ≈ 40 × 45 m
    };
    expect(elementToPlace(tiny)).toBeNull();
    expect(elementToPlace({ type: "node", id: 8, lat: 41.4, lon: 2.17, tags: { leisure: "park", name: "Punt" } })).toBeNull();
  });

  it("una misma entidad mapeada dos veces (vía y relación) cuenta una sola vez", () => {
    const dup: OvElement = { ...parkWay, id: 99 };
    const places = normalizeOverpass([parkWay, dup, terraceNode]);
    expect(places.filter((p) => p.type === "park")).toHaveLength(1);
    expect(places).toHaveLength(2);
  });

  it("cuenta los lugares por tipo, incluidos los tipos sin datos", () => {
    const counts = countByType(normalizeOverpass([parkWay, squareRelation, terraceNode]));
    expect(counts.park).toBe(1);
    expect(counts.square).toBe(1);
    expect(counts.terrace).toBe(1);
    expect(counts.beach).toBe(0);
    expect(counts.viewpoint).toBe(0);
  });
});

describe("consulta Overpass y puntos exactos", () => {
  it("pide cada categoría dentro de Barcelona y devuelve la geometría", () => {
    const q = buildOverpassQuery();
    expect(q).toContain('nwr["natural"="beach"]');
    expect(q).toContain('nwr["tourism"="viewpoint"]');
    expect(q).toContain('["outdoor_seating"="yes"]');
    expect(q).toContain("(41.317,2.052,41.468,2.229)");
    expect(q.endsWith("out geom;")).toBe(true);
  });

  it("un punto exacto puede ser un lugar (para futuros bancos, árboles, rejilla…)", () => {
    const p = createCoordinatePlace(41.3874, 2.1686);
    expect(p.source).toBe("coordinate");
    expect(p.id).toBe("point:41.38740,2.16860");
    expect(p.polygon).toBeUndefined();
  });
});
