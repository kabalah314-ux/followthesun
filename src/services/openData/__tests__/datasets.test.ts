import { describe, expect, it } from "vitest";
import {
  inBarcelona,
  mergePlayGroups,
  packPlaces,
  packTerraces,
  parseFountains,
  parseShelters,
  parseTerraces,
  parseToilets,
  parseViewpoints,
  playGroupsFromSql,
  playGroupsToPlaces,
  reorderSpaceName,
  titleCaseAddress,
  unpackPlaces,
  unpackTerraces,
} from "../datasets";

const terraceRow = (over: Record<string, string> = {}) => ({
  OCUPACIO: "Terrasses en Via Pública",
  NOM_DISTRICTE: "Eixample",
  NOM_BARRI: "la Sagrada Família",
  EMPLACAMENT: "C. PROVENÇA, 419-425",
  SUPERFICIE_OCUPADA: "13.5",
  TAULES: "6.00",
  CADIRES: "24.00",
  TAULES_CALCADA: "0.00",
  VIGENCIA: "Anual",
  LATITUD: "41.4038505495035",
  LONGITUD: "2.17344013792974",
  ...over,
});

describe("textos", () => {
  it("las direcciones en mayúsculas pasan a tipo título, con las partículas en minúscula", () => {
    expect(titleCaseAddress("C. PROVENÇA, 419-425")).toBe("C. Provença, 419-425");
    expect(titleCaseAddress("C. MARQUES DE CAMPO SAGRADO, 25")).toBe("C. Marques de Campo Sagrado, 25");
    expect(titleCaseAddress("PG. D'ISABEL II, 14")).toBe("Pg. d'Isabel II, 14");
    expect(titleCaseAddress("PG. FABRA I PUIG, 148")).toBe("Pg. Fabra i Puig, 148");
    expect(titleCaseAddress("Carrer de Tamarit 167")).toBe("Carrer de Tamarit 167");
  });

  it("los espacios verdes ponen el tipo delante", () => {
    expect(reorderSpaceName("Ram de l'Aigüa, Pl.")).toBe("Pl. Ram de l'Aigüa");
    expect(reorderSpaceName("Turó de la Peira, Parc.")).toBe("Parc Turó de la Peira");
    expect(reorderSpaceName("Güell, ParK")).toBe("Parc Güell");
    expect(reorderSpaceName("Grup Montseny")).toBe("Grup Montseny");
    expect(reorderSpaceName("Lineal Gran Via, Parc (Bac de Roda, c. - Extremadura, c.)")).toBe(
      "Lineal Gran Via, Parc (Bac de Roda, c. - Extremadura, c.)"
    );
  });

  it("solo valen coordenadas dentro de Barcelona", () => {
    expect(inBarcelona(41.39, 2.17)).toBe(true);
    expect(inBarcelona(40.4, -3.7)).toBe(false);
    expect(inBarcelona(NaN, 2.17)).toBe(false);
  });
});

describe("terrazas con licencia", () => {
  it("convierte una fila del CSV sin inventar el nombre del local", () => {
    const [t] = parseTerraces([terraceRow()]);
    expect(t.address).toBe("C. Provença, 419-425");
    expect(t.tables).toBe(6);
    expect(t.chairs).toBe(24);
    expect(t.areaM2).toBe(13.5);
    expect(t.seasonal).toBe(false);
    expect(t.privateSpace).toBe(false);
    expect(t.id).toBe("bcn-terrassa:41.40385,2.17344");
  });

  it("suma las licencias del mismo punto y respeta temporada y espacio privado", () => {
    const list = parseTerraces([
      terraceRow({ TAULES: "4.00", CADIRES: "16.00", VIGENCIA: "Temporada" }),
      terraceRow({ TAULES: "2.00", CADIRES: "8.00", TAULES_CALCADA: "2.00", VIGENCIA: "Temporada" }),
      terraceRow({
        LATITUD: "41.3765472689712",
        LONGITUD: "2.16469536043252",
        OCUPACIO: "Terrasses en Espai Privat d'Ús Públic",
      }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].tables).toBe(6);
    expect(list[0].chairs).toBe(24);
    expect(list[0].seasonal).toBe(true);
    expect(list[0].onRoadway).toBe(true);
    expect(list[1].privateSpace).toBe(true);
  });

  it("descarta filas sin coordenadas válidas o sin dirección", () => {
    expect(parseTerraces([terraceRow({ LATITUD: "" }), terraceRow({ EMPLACAMENT: "" })])).toEqual([]);
    expect(parseTerraces([terraceRow({ LATITUD: "40.41", LONGITUD: "-3.70" })])).toEqual([]);
  });

  it("el formato compacto ida y vuelta conserva todo", () => {
    const list = parseTerraces([terraceRow({ VIGENCIA: "Temporada", TAULES_CALCADA: "1.00" })]);
    expect(unpackTerraces(packTerraces(list))).toEqual(list);
  });
});

describe("lugares de Open Data BCN", () => {
  it("fuentes: nombre propio o la dirección", () => {
    const [a, b] = parseFountains([
      { CODI: "01-004", NOM: "Sant Carles", CARRER: "C COMTE DE SANTA CLARA", NUMERO_CARRER: "11", NOM_BARRI: "la Barceloneta", LATITUD: "41.379145587", LONGITUD: "2.188964950" },
      { CODI: "01-099", NOM: "", CARRER: "C BALBOA", NUMERO_CARRER: "9", NOM_BARRI: "la Barceloneta", LATITUD: "41.382159643", LONGITUD: "2.188050773" },
    ]);
    expect(a.type).toBe("fountain");
    expect(a.name).toBe("Sant Carles");
    expect(a.id).toBe("bcn:font:01-004");
    expect(a.metadata?.address).toBe("C Comte de Santa Clara 11");
    expect(b.name).toBe("Fuente · C Balboa 9");
  });

  it("refugios: el nombre propio está en la institución cuando `name` es el tipo", () => {
    const [r] = parseShelters([
      {
        register_id: "﻿99400762003",
        name: "Refugi climàtic",
        institution_name: "Seu del Districte de les Corts",
        addresses_road_name: "Plaça de Comas",
        addresses_start_street_number: "18",
        geo_epgs_4326_lat: "41.38564399418199",
        geo_epgs_4326_lon: "2.129771989264385",
      },
    ]);
    expect(r.type).toBe("climate_shelter");
    expect(r.name).toBe("Seu del Districte de les Corts");
    expect(r.id).toBe("bcn:refugi:99400762003");
    expect(r.metadata?.kind).toBe("Refugi climàtic");
    expect(r.metadata?.address).toBe("Plaça de Comas 18");
  });

  it("lavabos y miradores (coordenadas x/y)", () => {
    const [wc] = parseToilets([
      { register_id: "1", name: "WC Públic *Mercat del Bon Pastor", geo_epgs_4326_lat: "41.436", geo_epgs_4326_lon: "2.2061" },
    ]);
    expect(wc.name).toBe("WC Públic Mercat del Bon Pastor");
    const [m] = parseViewpoints([
      { register_id: "7", name: "Mirador", institution_name: "Torre de Collserola", geo_epgs_4326_x: "2.1145", geo_epgs_4326_y: "41.4176" },
    ]);
    expect(m.type).toBe("viewpoint");
    expect(m.name).toBe("Mirador · Torre de Collserola");
    expect(m.latitude).toBeCloseTo(41.4176, 4);
  });

  it("áreas de juego: grupos del mismo espacio cercanos se unen; edades en castellano", () => {
    const groups = playGroupsFromSql([
      { n: "Ram de l'Aigüa, Pl.", b: "la Verneda i la Pau", k: "7", lat: 41.4202, lon: 2.20146, m2: "350.57", e: "DE 6 A 12 ANYS" },
      { n: "Ram de l'Aigüa, Pl.", b: "la Verneda i la Pau", k: "3", lat: 41.4205, lon: 2.2018, m2: null, e: "FINS A 5 ANYS|MIXTA" },
      { n: "Grup Montseny", b: "la Verneda i la Pau", k: "10", lat: 41.42224, lon: 2.19748, m2: null, e: "FINS A 5 ANYS" },
    ]);
    expect(mergePlayGroups(groups)).toHaveLength(2);
    const places = playGroupsToPlaces(groups);
    const ram = places.find((p) => p.name === "Pl. Ram de l'Aigüa")!;
    expect(ram.type).toBe("playground");
    expect(ram.metadata?.elements).toBe(10);
    expect(ram.metadata?.ages).toEqual(["6–12 años", "0–5 años", "todas las edades"]);
    expect(ram.latitude).toBeCloseTo(41.42029, 4);
  });

  it("el formato compacto de lugares ida y vuelta", () => {
    const places = parseFountains([
      { CODI: "01-004", NOM: "Sant Carles", CARRER: "C X", NUMERO_CARRER: "1", NOM_BARRI: "b", LATITUD: "41.379", LONGITUD: "2.188" },
    ]);
    expect(unpackPlaces(packPlaces(places))).toEqual(places);
  });
});
