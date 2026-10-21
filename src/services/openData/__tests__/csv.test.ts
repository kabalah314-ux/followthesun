import { describe, expect, it } from "vitest";
import { csvToObjects, decodeBytes, detectDelimiter, parseCsv, toNumber } from "../csv";

/** Cabecera y filas tal como vienen en `2026_1S_Data_set_OPENDATA_Terrasses.csv` (separador «;», CRLF). */
const TERRACES =
  '"DATA_EXPLO";"OCUPACIO";"NOM_BARRI";"EMPLACAMENT";"SUPERFICIE_OCUPADA";"TAULES";"CADIRES";"VIGENCIA";"LATITUD";"LONGITUD"\r\n' +
  '1/7/2026 0:00:00;"Terrasses en Via Pública";"la Sagrada Família";"AV. GAUDI, 46";"36";12.00;48.00;"Anual";"41.4083712701906";"2.17453673339805"\r\n' +
  '1/7/2026 0:00:00;"Terrasses en Espai Privat d\'Ús Públic";"Navas";"C. ESPRONCEDA; 367";"4.5";2.00;8.00;"Temporada";"41.4176753827708";"2.18806386878314"\r\n';

/** `2026_Fonts_beure.csv`: separador «,», todo entre comillas. */
const FOUNTAINS =
  '"CODI","NOM","CARRER","NUMERO_CARRER","NOM_BARRI","LATITUD","LONGITUD"\r\n' +
  '"01-004","Sant Carles","C COMTE DE SANTA CLARA","11","la Barceloneta","41.379145587","2.188964950"\r\n';

describe("lector CSV de Open Data BCN", () => {
  it("detecta «;» y «,» por la cabecera", () => {
    expect(detectDelimiter('"A";"B";"C"')).toBe(";");
    expect(detectDelimiter('"A","B","C"')).toBe(",");
    expect(detectDelimiter('"A,1";"B"')).toBe(";");
  });

  it("lee el CSV de terrazas: comillas, CRLF y un «;» dentro de un campo", () => {
    const rows = csvToObjects(TERRACES);
    expect(rows).toHaveLength(2);
    expect(rows[0].EMPLACAMENT).toBe("AV. GAUDI, 46");
    expect(rows[0].TAULES).toBe("12.00");
    expect(rows[1].EMPLACAMENT).toBe("C. ESPRONCEDA; 367");
    expect(rows[1].OCUPACIO).toBe("Terrasses en Espai Privat d'Ús Públic");
    expect(rows[1].LONGITUD).toBe("2.18806386878314");
  });

  it("lee el CSV de fuentes separado por comas", () => {
    const [f] = csvToObjects(FOUNTAINS);
    expect(f.NOM).toBe("Sant Carles");
    expect(f.CARRER).toBe("C COMTE DE SANTA CLARA");
  });

  it("comillas dobladas, saltos de línea dentro de un campo y líneas vacías", () => {
    const rows = parseCsv('a,b\n"di ""hola""","línea 1\nlínea 2"\n\n3,4\n');
    expect(rows).toEqual([
      ["a", "b"],
      ['di "hola"', "línea 1\nlínea 2"],
      ["3", "4"],
    ]);
  });

  it("quita la marca BOM y decodifica UTF-16 (conjuntos NP-NASIA antiguos)", () => {
    expect(csvToObjects("﻿X;Y\r\n1;2")[0]).toEqual({ X: "1", Y: "2" });
    const text = "name,lat\nRefugi climàtic,41.38\n";
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    for (let i = 0; i < text.length; i++) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff;
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    expect(decodeBytes(utf16)).toBe(text);
    const utf8bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeBytes(utf8bom)).toBe("A");
  });

  it("números con punto o coma, y vacíos como NaN", () => {
    expect(toNumber("12.00")).toBe(12);
    expect(toNumber("4,5")).toBe(4.5);
    expect(toNumber("")).toBeNaN();
    expect(toNumber(undefined)).toBeNaN();
  });
});
