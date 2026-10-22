import { describe, expect, it } from "vitest";
import { parseTerraces } from "../datasets";
import { normalizeRow } from "../openDataService";

describe("normalizeRow", () => {
  it("pone las claves en mayúsculas y los números como texto (registros del datastore)", () => {
    expect(normalizeRow({ Latitud: 41.38, longitud: 2.17, _id: 3, NOM: "Font", vacio: null })).toEqual({
      LATITUD: "41.38",
      LONGITUD: "2.17",
      _ID: "3",
      NOM: "Font",
    });
  });

  it("una fila del datastore normalizada se lee igual que una del CSV", () => {
    const row = normalizeRow({
      EMPLACAMENT: "CARRER DE BALMES, 120",
      NOM_BARRI: "la Dreta de l'Eixample",
      NOM_DISTRICTE: "Eixample",
      SUPERFICIE_OCUPADA: 12.5,
      TAULES: 4,
      CADIRES: 16,
      TAULES_CALCADA: 0,
      VIGENCIA: "Anual",
      OCUPACIO: "Vorera",
      LATITUD: 41.3936,
      LONGITUD: 2.1561,
    });
    const [t] = parseTerraces([row]);
    expect(t.areaM2).toBe(12.5);
    expect(t.tables).toBe(4);
    expect(t.latitude).toBeCloseTo(41.3936, 4);
  });
});
