import { describe, expect, it } from "vitest";
import { detectLang, getLang, interpolate, intlLocale, LANGS, tr, trIn, trPlural } from "..";
import { ca } from "../ca";
import { en } from "../en";
import { es, type MessageKey } from "../es";

const KEYS = Object.keys(es).sort() as MessageKey[];
const marks = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("diccionarios", () => {
  it("catalán e inglés tienen exactamente las claves del castellano", () => {
    expect(Object.keys(ca).sort()).toEqual(KEYS);
    expect(Object.keys(en).sort()).toEqual(KEYS);
  });

  it("cada traducción conserva los marcadores {…} del castellano", () => {
    for (const [lang, dict] of [["ca", ca], ["en", en]] as const) {
      for (const k of KEYS) expect(marks(dict[k]), `${lang} · ${k}`).toEqual(marks(es[k]));
    }
  });

  it("ningún texto está vacío", () => {
    for (const dict of [es, ca, en]) for (const k of KEYS) expect(dict[k].trim(), k).not.toBe("");
  });

  it("catalán e inglés no arrastran signos del castellano (¿, ¡, ñ)", () => {
    for (const dict of [ca, en]) for (const k of KEYS) expect(dict[k], k).not.toMatch(/[¿¡ñ]/);
  });

  it("la rosa de los vientos tiene ocho rumbos distintos en cada idioma", () => {
    for (const l of LANGS) {
      const c = trIn(l.id, "solarCalculations.compass").split(",");
      expect(c).toHaveLength(8);
      expect(new Set(c).size).toBe(8);
    }
    expect(trIn("en", "solarCalculations.compass")).toBe("N,NE,E,SE,S,SW,W,NW");
  });
});

describe("detectLang", () => {
  it("manda la preferencia guardada", () => {
    expect(detectLang("en", ["ca-ES"])).toBe("en");
    expect(detectLang("ca", [])).toBe("ca");
  });

  it("ignora una preferencia que no es un idioma de la app", () => {
    expect(detectLang("fr", ["ca"])).toBe("ca");
  });

  it("catalán → ca; castellano, gallego y euskera → es; inglés → en", () => {
    expect(detectLang(null, ["ca-ES"])).toBe("ca");
    expect(detectLang(null, ["ca"])).toBe("ca");
    expect(detectLang(null, ["es-ES"])).toBe("es");
    expect(detectLang(null, ["es-419"])).toBe("es");
    expect(detectLang(null, ["gl-ES"])).toBe("es");
    expect(detectLang(null, ["eu"])).toBe("es");
    expect(detectLang(null, ["en-US"])).toBe("en");
  });

  it("gana el primer idioma de la lista que la app sabe hablar", () => {
    expect(detectLang(null, ["fr-FR", "es-ES", "en"])).toBe("es");
    expect(detectLang(null, ["EN-gb", "ca"])).toBe("en");
  });

  it("cualquier otro idioma → inglés; sin información → castellano", () => {
    expect(detectLang(null, ["de-DE", "fr"])).toBe("en");
    expect(detectLang(null, [])).toBe("es");
  });
});

describe("interpolate", () => {
  it("sustituye cada {marca} por su valor", () => {
    expect(interpolate("Sol a {p0}° · {p1}", { p0: 35, p1: "SO" })).toBe("Sol a 35° · SO");
  });

  it("deja la marca si falta la variable y no toca textos sin variables", () => {
    expect(interpolate("De {p0} a {p1}", { p0: "10:00" })).toBe("De 10:00 a {p1}");
    expect(interpolate("Sin marcas")).toBe("Sin marcas");
  });
});

describe("tr, trIn y trPlural", () => {
  it("fuera del navegador (tests, ETL) el idioma es el castellano", () => {
    expect(getLang()).toBe("es");
    expect(intlLocale()).toBe("es-ES");
    expect(tr("answer.quedan", { p0: "5 h" })).toBe("Quedan 5 h");
  });

  it("trIn da el texto de cualquier idioma", () => {
    expect(trIn("ca", "answer.quedan", { p0: "5 h" })).toBe("Queden 5 h");
    expect(trIn("en", "answer.quedan", { p0: "5 h" })).toBe("5 h left");
    expect(trIn("ca", "answer.por_el_este")).toBe("per l'est");
  });

  it("locale de Intl por idioma", () => {
    expect(intlLocale("es")).toBe("es-ES");
    expect(intlLocale("ca")).toBe("ca-ES");
    expect(intlLocale("en")).toBe("en-GB");
  });

  it("trPlural elige singular o plural y admite el número ya formateado", () => {
    const forms = { one: "terraceMatching.mesa_one", other: "terraceMatching.mesa_other" } as const;
    expect(trPlural(1, forms)).toBe("1 mesa");
    expect(trPlural(6, forms)).toBe("6 mesas");
    expect(trPlural(0, forms)).toBe("0 mesas");
    expect(trPlural(1.5, forms, { n: "1,5" })).toBe("1,5 mesas");
  });
});
