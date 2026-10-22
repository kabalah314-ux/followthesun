import { describe, expect, it } from "vitest";
import { BCN_AREAS } from "../areas";
import { parseQuery, queryMinutes } from "../searchParser";

// Miércoles (0 = lunes).
const ctx = { areas: BCN_AREAS, weekday: 2 };
const p = (q: string, lang?: "es" | "ca" | "en") => parseQuery(q, { ...ctx, lang });

describe("intérprete del buscador universal", () => {
  it("terraza con sol mañana a las 11", () => {
    const q = p("Terraza con sol mañana a las 11");
    expect(q.mode).toBe("sun");
    expect(q.topics).toEqual(["terrace"]);
    expect(q.time).toEqual({ dayOffset: 1, minutes: 11 * 60, part: null, inMinutes: null, now: false });
    expect(q.rest).toBe("");
    expect(q.understood).toBe(true);
  });

  it("sombra para niños en un barrio", () => {
    const q = p("sombra para niños en Gràcia");
    expect(q.mode).toBe("shade");
    expect(q.topics).toEqual(["kids"]);
    expect(q.area?.name).toBe("Gràcia");
    expect(q.rest).toBe("");
  });

  it("catalán: vermut al sol a l'Eixample", () => {
    const q = p("on fer un vermut al sol a l'Eixample", "ca");
    expect(q.mode).toBe("sun");
    expect(q.topics).toEqual(["terrace"]);
    expect(q.time?.part).toBe("noon");
    expect(q.area?.name).toBe("Eixample");
  });

  it("catalán: «places» son plazas solo en catalán", () => {
    expect(p("places amb sol al Born", "ca").topics).toEqual(["square"]);
    expect(p("places amb sol al Born", "ca").area?.name).toBe("El Born");
    expect(p("places in the sun", "en").topics).toEqual([]);
  });

  it("inglés: atardecer en un mirador mañana", () => {
    const q = p("sunset viewpoint tomorrow", "en");
    expect(q.topics.sort()).toEqual(["sunset", "viewpoint"]);
    expect(q.time?.dayOffset).toBe(1);
  });

  it("horas: de la tarde, pm, 17:30 y sin indicación", () => {
    expect(p("parque a las 5 de la tarde").time?.minutes).toBe(17 * 60);
    expect(p("parc a les 5 de la tarda", "ca").time?.minutes).toBe(17 * 60);
    expect(p("beach at 5pm", "en").time?.minutes).toBe(17 * 60);
    expect(p("plaza 17:30").time?.minutes).toBe(17 * 60 + 30);
    expect(p("plaza 17.30").time?.minutes).toBe(17 * 60 + 30);
    expect(p("terraza a las 6").time?.minutes).toBe(18 * 60);
    expect(p("café a las 9").time?.minutes).toBe(9 * 60);
    expect(p("terraza 11h").time?.minutes).toBe(11 * 60);
    expect(p("comer a las 2 del mediodía").time?.minutes).toBe(14 * 60);
  });

  it("«mañana» es mañana, pero «por la mañana» es una parte del día", () => {
    expect(p("playa mañana").time).toEqual({ dayOffset: 1, minutes: null, part: null, inMinutes: null, now: false });
    expect(p("playa por la mañana").time).toEqual({ dayOffset: 0, minutes: null, part: "morning", inMinutes: null, now: false });
    expect(p("playa mañana por la mañana").time).toEqual({ dayOffset: 1, minutes: null, part: "morning", inMinutes: null, now: false });
    expect(p("pasado mañana").time?.dayOffset).toBe(2);
    expect(p("demà passat", "ca").time?.dayOffset).toBe(2);
    expect(p("aquesta tarda", "ca").time).toEqual({ dayOffset: 0, minutes: null, part: "afternoon", inMinutes: null, now: false });
  });

  it("días de la semana y fin de semana (hoy es miércoles)", () => {
    expect(p("parque el sábado").time?.dayOffset).toBe(3);
    expect(p("parc dissabte", "ca").time?.dayOffset).toBe(3);
    expect(p("park on monday", "en").time?.dayOffset).toBe(5);
    expect(p("miércoles").time?.dayOffset).toBe(0);
    expect(p("playa el finde").time?.dayOffset).toBe(3);
  });

  it("en un rato: en 30 min, en una hora, in half an hour", () => {
    expect(p("sol en 30 min").time?.inMinutes).toBe(30);
    expect(p("sombra en una hora").time?.inMinutes).toBe(60);
    expect(p("d'aquí a una hora", "ca").time?.inMinutes).toBe(60);
    expect(p("in half an hour", "en").time?.inMinutes).toBe(30);
    expect(p("ahora").time?.now).toBe(true);
  });

  it("desayunar al sol = terraza por la mañana; las intenciones no pisan una hora dicha", () => {
    const q = p("desayunar al sol");
    expect(q.topics).toEqual(["terrace"]);
    expect(q.time?.part).toBe("morning");
    expect(p("desayuno a las 10:30").time).toEqual({ dayOffset: 0, minutes: 10 * 60 + 30, part: null, inMinutes: null, now: false });
  });

  it("filtros: abierto, wifi, accesible y con licencia", () => {
    const q = p("café abierto con wifi accesible");
    expect(q.topics).toEqual(["terrace"]);
    expect(q.filters.sort()).toEqual(["accessible", "open", "wifi"]);
    expect(p("terrassa amb llicència", "ca").filters).toEqual(["licensed"]);
  });

  it("refugio climático = sombra; trabajar y perro son temas", () => {
    expect(p("refugio climático").mode).toBe("shade");
    expect(p("refugio climático").topics).toEqual(["shelter"]);
    expect(p("teletrabajo al sol").topics).toEqual(["work"]);
    expect(p("pasear con el perro").topics.sort()).toEqual(["dog", "walk"]);
  });

  it("un número suelto no es una hora y lo que no se entiende queda para el nombre", () => {
    const q = p("Bar 7 Portes");
    expect(q.time).toBeNull();
    expect(q.rest).toContain("portes");
    expect(p("Ciutadella").rest).toBe("ciutadella");
    expect(p("Ciutadella").understood).toBe(false);
  });

  it("minutos de la consulta: hora exacta o parte del día", () => {
    expect(queryMinutes({ dayOffset: 0, minutes: 600, part: null, inMinutes: null, now: false })).toBe(600);
    expect(queryMinutes({ dayOffset: 0, minutes: null, part: "afternoon", inMinutes: null, now: false })).toBe(16 * 60 + 30);
    expect(queryMinutes({ dayOffset: 1, minutes: null, part: null, inMinutes: null, now: false })).toBeNull();
  });
});
