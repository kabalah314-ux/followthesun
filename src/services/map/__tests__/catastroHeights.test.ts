import { describe, expect, it } from "vitest";
import { latToMy, lngToMx } from "../../../lib/coordinates";
import { buildBuildingSet } from "../../buildingService";
import {
  decodeHeightTile,
  encodeHeightTiles,
  heightForFootprint,
  heightFromFloors,
  lngLatToUtm,
  parseBuildingParts,
  utmToLngLat,
  zoneFromGml,
  type BuildingPartRecord,
} from "../catastroHeights";

/** Parte de edificio como en el GML INSPIRE del Catastro (anillo en ETRS89 / UTM 31N). */
function part(id: string, floors: number | null, x: number, y: number, w: number, h: number): string {
  const ring = [x, y, x + w, y, x + w, y + h, x, y + h, x, y].join(" ");
  const fl =
    floors === null
      ? '<bu-ext2d:numberOfFloorsAboveGround xsi:nil="true" nilReason="other:unpopulated"/>'
      : `<bu-ext2d:numberOfFloorsAboveGround>${floors}</bu-ext2d:numberOfFloorsAboveGround>`;
  return `<gml:featureMember>
<bu-ext2d:BuildingPart gml:id="ES.SDGC.BU.${id}">
<bu-core2d:beginLifespanVersion>2012-01-01T00:00:00</bu-core2d:beginLifespanVersion>
<bu-ext2d:geometry><bu-core2d:BuildingGeometry><bu-core2d:geometry>
<gml:Surface gml:id="Surface_ES.SDGC.BU.${id}" srsName="urn:ogc:def:crs:EPSG::25831">
<gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing>
<gml:posList srsDimension="2" count="5">${ring}</gml:posList>
</gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches></gml:Surface>
</bu-core2d:geometry></bu-core2d:BuildingGeometry></bu-ext2d:geometry>
${fl}
<bu-ext2d:heightBelowGround uom="m">0</bu-ext2d:heightBelowGround>
<bu-ext2d:numberOfFloorsBelowGround>1</bu-ext2d:numberOfFloorsBelowGround>
</bu-ext2d:BuildingPart>
</gml:featureMember>`;
}

const GML = `<?xml version="1.0" encoding="UTF-8"?><gml:FeatureCollection>${[
  part("0001_part1", 6, 431000, 4582000, 20, 20),
  part("0001_part2", 0, 431030, 4582000, 10, 10),
  part("0002_part1", null, 431060, 4582000, 10, 10),
  part("0003_part1", 2, 431090, 4582000, 10, 5),
].join("\n")}</gml:FeatureCollection>`;

describe("UTM (ETRS89)", () => {
  it("en el meridiano central (3° E) la longitud es exacta y la latitud, la de Barcelona", () => {
    const [lng, lat] = utmToLngLat(500000, 4582000, 31);
    expect(lng).toBeCloseTo(3, 9);
    expect(lat > 41.38 && lat < 41.4).toBe(true);
  });

  it("ida y vuelta sin error apreciable y plaça de Catalunya donde toca", () => {
    for (const [lng, lat] of [
      [2.1734, 41.3851],
      [2.11, 41.42],
      [2.22, 41.36],
    ]) {
      const [e, n] = lngLatToUtm(lng, lat, 31);
      const [lng2, lat2] = utmToLngLat(e, n, 31);
      expect(lng2).toBeCloseTo(lng, 7);
      expect(lat2).toBeCloseTo(lat, 7);
    }
    const [e, n] = lngLatToUtm(2.1734, 41.3851, 31);
    expect(e > 430_800 && e < 431_200).toBe(true);
    expect(n > 4_581_500 && n < 4_582_500).toBe(true);
  });
});

describe("GML de partes de edificio del Catastro", () => {
  it("lee plantas, área y centroide; descarta las que no tienen plantas sobre rasante", () => {
    expect(zoneFromGml(GML)).toBe(31);
    const { parts } = parseBuildingParts(GML, 31);
    expect(parts).toHaveLength(2);
    expect(parts[0].floors).toBe(6);
    expect(parts[0].areaM2).toBeCloseTo(400, 6);
    const [lng, lat] = utmToLngLat(431010, 4582010, 31);
    expect(parts[0].lng).toBeCloseTo(lng, 9);
    expect(parts[0].lat).toBeCloseTo(lat, 9);
    expect(parts[1].floors).toBe(2);
    expect(parts[1].areaM2).toBeCloseTo(50, 6);
  });

  it("por trozos (como al leer el fichero en streaming) sale lo mismo", () => {
    let total = 0;
    for (const cut of [100, 900, 1500, 2600]) {
      const a = parseBuildingParts(GML.slice(0, cut), 31);
      const b = parseBuildingParts(a.rest + GML.slice(cut), 31);
      total = a.parts.length + b.parts.length;
      expect(total).toBe(2);
    }
  });
});

describe("altura de una huella con las partes del Catastro", () => {
  // Huella de OSM sin altura: cuadrado de ~40 m alrededor de un punto del Eixample.
  const LNG = 2.165;
  const LAT = 41.392;
  const dLat = 20 / 111_320;
  const dLng = dLat / Math.cos((LAT * Math.PI) / 180);
  const ring = [
    [LNG - dLng, LAT - dLat],
    [LNG + dLng, LAT - dLat],
    [LNG + dLng, LAT + dLat],
    [LNG - dLng, LAT + dLat],
  ];
  const coords = ring.flatMap(([lng, lat]) => [lngToMx(lng), latToMy(lat)]);
  const bbox = { minX: coords[0], maxX: coords[2], minY: coords[5], maxY: coords[1] };

  const parts: BuildingPartRecord[] = [
    { lng: LNG - dLng / 2, lat: LAT, floors: 6, areaM2: 300 },
    { lng: LNG + dLng / 2, lat: LAT, floors: 1, areaM2: 400 },
    // Caja de ascensor: alta pero diminuta, no cuenta.
    { lng: LNG, lat: LAT + dLat / 2, floors: 9, areaM2: 20 },
    // Fuera de la huella.
    { lng: LNG + 3 * dLng, lat: LAT, floors: 12, areaM2: 500 },
  ];
  const tiles = [...encodeHeightTiles(parts).values()].map((t) => decodeHeightTile(t)!);

  it("plantas × 3 m + 1 m", () => {
    expect(heightFromFloors(6)).toBe(19);
  });

  it("toma la parte más alta de las que pesan (patio de 1 planta incluido)", () => {
    expect(heightForFootprint(tiles, coords, 0, 4, bbox)).toBe(19);
  });

  it("sin partes dentro no inventa nada", () => {
    const far = coords.map((v, i) => (i % 2 === 0 ? v + 0.001 : v));
    const fb = { minX: bbox.minX + 0.001, maxX: bbox.maxX + 0.001, minY: bbox.minY, maxY: bbox.maxY };
    expect(heightForFootprint(tiles, far, 0, 4, fb)).toBeNull();
  });

  it("los edificios sin altura en el mapa la toman del Catastro (solo para sombras)", () => {
    const poly = (h: number | undefined) => ({
      geometry: { type: "Polygon", coordinates: [[...ring, ring[0]]] },
      properties: h === undefined ? {} : { render_height: h },
    });
    const set = buildBuildingSet([poly(5), poly(24)], { minX: 0, minY: 0, maxX: 1, maxY: 1 }, "vector-tiles", (c, s, n, b) =>
      heightForFootprint(tiles, c, s, n, b)
    );
    expect(Array.from(set.heights)).toEqual([19, 24]);
    expect(Array.from(set.renderHeights)).toEqual([5, 24]);
    expect(set.catastro).toBe(1);
    expect(set.source).toBe("vector-tiles+catastro");
  });
});
