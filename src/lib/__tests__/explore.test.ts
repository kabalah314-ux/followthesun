import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyFilters,
  chipSpec,
  collectionsFor,
  curate,
  exploreRequest,
  exploreWindow,
  homeSpec,
  mergeFilters,
  NO_FILTERS,
  placeExtra,
  querySpec,
  sanitizeFilters,
  specIntent,
  whyParts,
} from "../explore";
import { BCN_AREAS } from "../areas";
import { parseQuery } from "../searchParser";
import { EMPTY_TASTE, recordTaste, tasteFactor } from "../taste";
import type { SunPlace, SunSearchResult } from "../../types";

const H = 3_600_000;
const MIN = 60_000;
// Miércoles 21 de octubre de 2026, 12:00 en Barcelona (10:00 UTC). Orto 08:15 y ocaso 18:45.
const NOW = Date.UTC(2026, 9, 21, 10, 0);
const sunDay = (off: number) => ({
  sunrise: Date.UTC(2026, 9, 21 + off, 6, 15),
  sunset: Date.UTC(2026, 9, 21 + off, 16, 45),
});
const ctx = (now = NOW, selected: number | null = null) => ({ now, selected, sunDay });

const place = (id: string, metadata: Record<string, unknown> = {}, lat = 41.39, lng = 2.17): SunPlace => ({
  id,
  name: id,
  type: "terrace",
  latitude: lat,
  longitude: lng,
  source: "test",
  metadata,
});

const result = (id: string, rankingValue: number, lat: number, lng: number, extra: Partial<SunSearchResult> = {}): SunSearchResult =>
  ({
    rank: 1,
    placeId: id,
    place: place(id, {}, lat, lng),
    locationType: "terrace",
    spot: { latitude: lat, longitude: lng, offsetMeters: 0 },
    rankingValue,
    windows: [{ kind: "sun", start: NOW - H, end: NOW + 2 * H }],
    searchWindow: { start: NOW, end: NOW + 2 * H },
    ...extra,
  }) as unknown as SunSearchResult;

describe("chips y búsquedas escritas → misma forma", () => {
  it("cada chip busca lo suyo", () => {
    expect(chipSpec("terraces")).toMatchObject({ types: ["terrace"], venues: true, mode: null });
    expect(chipSpec("shade")).toMatchObject({ mode: "shade", types: null });
    expect(chipSpec("kids").types).toEqual(["playground"]);
    expect(chipSpec("sunset")).toMatchObject({ mode: "sun", when: { kind: "sunset", dayOffset: null }, durationMinutes: 30 });
    expect(chipSpec("work")).toMatchObject({ venues: true, durationMinutes: 120, preferWifi: true });
    expect(chipSpec("dog").types).toEqual(["park", "open_space"]);
  });

  it("la intención del motor sigue al modo de la app salvo que el chip lo fije", () => {
    expect(specIntent(chipSpec("parks"), "sun")).toBe("sun");
    expect(specIntent(chipSpec("parks"), "shade")).toBe("shade");
    expect(specIntent(chipSpec("terraces"), "sun")).toBe("coffee");
    expect(specIntent(chipSpec("sun"), "shade")).toBe("sun");
    expect(specIntent(chipSpec("sunset"), "shade")).toBe("sunset");
  });

  it("«terraza con sol mañana a las 11» y «sombra para niños en Gràcia»", () => {
    const a = querySpec(parseQuery("terraza con sol mañana a las 11", { areas: BCN_AREAS, weekday: 2 }))!;
    expect(a).toMatchObject({ source: "query", mode: "sun", types: ["terrace"], venues: true, when: { kind: "at", dayOffset: 1, minutes: 660 } });
    const b = querySpec(parseQuery("sombra para niños en Gràcia", { areas: BCN_AREAS, weekday: 2 }))!;
    expect(b.mode).toBe("shade");
    expect(b.types).toEqual(["playground"]);
    expect(b.area?.name).toBe("Gràcia");
  });

  it("atardecer, un día sin hora y filtros escritos", () => {
    const s = querySpec(parseQuery("atardecer mañana", { areas: BCN_AREAS, weekday: 2 }))!;
    expect(s.when).toEqual({ kind: "sunset", dayOffset: 1 });
    expect(s.types).toEqual(["viewpoint", "beach", "open_space", "park"]);
    expect(querySpec(parseQuery("playa el sábado", { areas: BCN_AREAS, weekday: 2 }))!.when).toEqual({ kind: "day", dayOffset: 3 });
    const f = querySpec(parseQuery("café abierto con wifi", { areas: BCN_AREAS, weekday: 2 }))!;
    expect(f.filters).toEqual({ open: true, wifi: true });
    expect(mergeFilters(NO_FILTERS, f)).toMatchObject({ open: true, wifi: true, licensed: false });
    expect(querySpec(parseQuery("Ciutadella", { areas: BCN_AREAS, weekday: 2 }))).toBeNull();
  });
});

describe("franja de la búsqueda", () => {
  it("ahora: dos horas, hasta la puesta si se busca sol", () => {
    expect(exploreWindow(homeSpec(), "sun", ctx())).toEqual({ start: NOW, end: NOW + 2 * H, minutes: 60, movedToTomorrow: false });
    const late = Date.UTC(2026, 9, 21, 15, 30); // 17:30
    const w = exploreWindow(homeSpec(), "sun", ctx(late));
    expect(w.end).toBe(sunDay(0).sunset);
    expect(w.minutes).toBe(60);
  });

  it("sin sol suficiente hoy: primeras horas de mañana (en sombra no hace falta)", () => {
    const t = Date.UTC(2026, 9, 21, 16, 30); // 18:30, la puesta a las 18:45
    const w = exploreWindow(homeSpec(), "sun", ctx(t));
    expect(w.movedToTomorrow).toBe(true);
    expect(w.start).toBe(sunDay(1).sunrise + 90 * MIN);
    expect(exploreWindow(homeSpec(), "shade", ctx(t))).toEqual({ start: t, end: t + 2 * H, minutes: 60, movedToTomorrow: false });
  });

  it("la hora elegida en la línea de tiempo manda", () => {
    const sel = Date.UTC(2026, 9, 21, 13, 0); // 15:00
    expect(exploreWindow(homeSpec(), "sun", ctx(NOW, sel)).start).toBe(sel);
  });

  it("puesta de sol: los 75 minutos anteriores (mañana si ya ha pasado)", () => {
    const w = exploreWindow(chipSpec("sunset"), "sun", ctx());
    expect(w).toEqual({ start: sunDay(0).sunset - 75 * MIN, end: sunDay(0).sunset, minutes: 30, movedToTomorrow: false });
    const after = exploreWindow(chipSpec("sunset"), "sun", ctx(Date.UTC(2026, 9, 21, 16, 40)));
    expect(after.movedToTomorrow).toBe(true);
    expect(after.end).toBe(sunDay(1).sunset);
  });

  it("una hora de otro día y «dentro de un rato»", () => {
    const spec = querySpec(parseQuery("mañana a las 11", { areas: BCN_AREAS, weekday: 2 }))!;
    const w = exploreWindow(spec, "sun", ctx());
    expect(w.start).toBe(Date.UTC(2026, 9, 22, 9, 0));
    expect(w.end).toBe(Date.UTC(2026, 9, 22, 11, 0));
    const inSpec = querySpec(parseQuery("sol en 30 min", { areas: BCN_AREAS, weekday: 2 }))!;
    expect(exploreWindow(inSpec, "sun", ctx()).start).toBe(NOW + 30 * MIN);
  });

  it("la petición lleva los tipos, la intención y la distancia", () => {
    const window = exploreWindow(chipSpec("dog"), "shade", ctx());
    const req = exploreRequest(chipSpec("dog"), { mode: "shade", window, origin: { lng: 2.17, lat: 41.39 }, originIsReal: false, maxWalk: null });
    expect(req).toMatchObject({ locationTypes: ["park", "open_space"], intent: "shade", preference: "maximum_sun", maximumWalkingMinutes: 30, limit: 8 });
    const r2 = exploreRequest(chipSpec("terraces"), { mode: "sun", window, origin: { lng: 2.17, lat: 41.39 }, originIsReal: true, maxWalk: 10 });
    expect(r2).toMatchObject({ intent: "coffee", preference: "balanced", maximumWalkingMinutes: 10 });
  });
});

describe("filtros", () => {
  const places = [
    place("a", { wifi: true, openingHours: "Mo-Su 08:00-20:00", licensed: { tables: 4 } }),
    place("b", { wifi: "no", openingHours: "Mo-Su 18:00-23:00", dog: "yes" }),
    place("c", { wheelchair: "limited" }),
  ];

  it("abierto quita lo que se sabe cerrado y deja lo desconocido", () => {
    expect(applyFilters(places, { ...NO_FILTERS, open: true }, NOW).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("wifi, perros, accesible y licencia exigen el dato", () => {
    expect(applyFilters(places, { ...NO_FILTERS, wifi: true }, NOW).map((p) => p.id)).toEqual(["a"]);
    expect(applyFilters(places, { ...NO_FILTERS, dog: true }, NOW).map((p) => p.id)).toEqual(["b"]);
    expect(applyFilters(places, { ...NO_FILTERS, accessible: true }, NOW).map((p) => p.id)).toEqual(["c"]);
    expect(applyFilters(places, { ...NO_FILTERS, licensed: true }, NOW).map((p) => p.id)).toEqual(["a"]);
  });

  it("cuenta los filtros activos y limpia lo guardado", () => {
    expect(activeFilterCount({ ...NO_FILTERS, open: true, maxWalk: 10 })).toBe(2);
    expect(sanitizeFilters({ open: true, maxWalk: 7, wifi: "sí" })).toEqual({ ...NO_FILTERS, open: true });
    expect(sanitizeFilters(null)).toEqual(NO_FILTERS);
  });
});

describe("«Para ti»", () => {
  it("variedad: nunca dos sitios a menos de 300 m; como mucho cinco", () => {
    const rs = [
      result("a", 90, 41.39, 2.17),
      result("b", 85, 41.3905, 2.1702), // a ~60 m de a
      result("c", 80, 41.4, 2.17),
      result("d", 70, 41.41, 2.17),
      result("e", 60, 41.42, 2.17),
      result("f", 50, 41.43, 2.17),
      result("g", 40, 41.44, 2.17),
    ];
    expect(curate(rs).map((r) => r.placeId)).toEqual(["a", "c", "d", "e", "f"]);
  });

  it("el gusto aprendido y el wifi ajustan como mucho un 10 %", () => {
    const rs = [result("a", 100, 41.39, 2.17), result("b", 95, 41.4, 2.17)];
    const taste = (r: SunSearchResult) => (r.placeId === "b" ? 2 : 1);
    expect(curate(rs, { taste }).map((r) => r.placeId)).toEqual(["b", "a"]);
    const far = [result("a", 100, 41.39, 2.17), result("b", 80, 41.4, 2.17)];
    expect(curate(far, { taste }).map((r) => r.placeId)).toEqual(["a", "b"]);
  });

  it("el porqué en piezas cortas", () => {
    const r = result("a", 90, 41.39, 2.17, { walking: { distanceMeters: 400, durationMinutes: 6, exact: false, method: "straight_line_estimate" } });
    r.place.metadata = { licensed: { tables: 8 } };
    const parts = whyParts(r, { now: NOW, mode: "sun", showWalk: true, comfort: "21 °C al sol" });
    expect(parts).toHaveLength(4);
    expect(parts[1]).toBe("6 min a pie");
    expect(parts[2]).toBe("21 °C al sol");
    expect(parts[3]).toBe("terraza con 8 mesas");
    expect(whyParts(r, { now: NOW, mode: "sun", showWalk: false })).toHaveLength(2);
  });

  it("dato propio del sitio: hasta cuándo abre, wifi o accesible", () => {
    expect(placeExtra({ metadata: { openingHours: "Mo-Su 08:00-20:00" } }, NOW)).toBe("abierto hasta las 20:00");
    expect(placeExtra({ metadata: { wifi: true } }, NOW)).toBe("con wifi");
    expect(placeExtra({ metadata: {} }, NOW)).toBeNull();
  });

  it("gusto aprendido: neutro al principio y acotado", () => {
    expect(tasteFactor(EMPTY_TASTE, "park")).toBe(1);
    let t = EMPTY_TASTE;
    for (let i = 0; i < 6; i++) t = recordTaste(t, "park");
    t = recordTaste(t, "beach", 3);
    expect(tasteFactor(t, "park")).toBeGreaterThan(1.05);
    expect(tasteFactor(t, "park")).toBeLessThanOrEqual(1.1);
    expect(tasteFactor(t, "playground")).toBeLessThan(1);
    expect(tasteFactor(t, "playground")).toBeGreaterThanOrEqual(0.9);
  });
});

describe("colecciones del momento", () => {
  it("octubre por la mañana: desayunos, terrazas hasta tarde, niños al sol y atardeceres", () => {
    expect(collectionsFor({ month: 10, hour: 10, hot: false }).map((c) => c.id)).toEqual(["breakfast", "terraces-late", "kids-sun", "sunsets"]);
  });

  it("julio con calor: sombra para niños, atardeceres, refugios y paseos a la sombra", () => {
    expect(collectionsFor({ month: 7, hour: 12, hot: true }).map((c) => c.id)).toEqual(["kids-shade", "sunsets", "cool-refuges", "shade-walks"]);
  });

  it("de noche quedan los atardeceres (de mañana) y la playa temprano en verano", () => {
    expect(collectionsFor({ month: 8, hour: 22, hot: false }).map((c) => c.id)).toEqual(["sunsets", "beach-early"]);
  });
});
