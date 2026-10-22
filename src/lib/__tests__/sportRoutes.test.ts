import { describe, expect, it } from "vitest";
import { lineLength } from "../routeShade";
import { CIRCUITS, circuitsFor, fileSlug, gpxOf, loopWaypoints, pickSlot, sportMapsUrl, sportSlots } from "../sportRoutes";

const MIN = 60_000;
const HOUR = 3_600_000;

describe("circuitos", () => {
  it("todos empiezan y acaban en el mismo sitio y caen en Barcelona", () => {
    for (const c of CIRCUITS) {
      expect(c.points[0]).toEqual(c.points[c.points.length - 1]);
      for (const [lng, lat] of c.points) {
        expect(lng).toBeGreaterThan(2.05);
        expect(lng).toBeLessThan(2.23);
        expect(lat).toBeGreaterThan(41.32);
        expect(lat).toBeLessThan(41.47);
      }
    }
  });

  it("filtra por deporte", () => {
    expect(circuitsFor("run").some((c) => c.id === "ciutadella")).toBe(true);
    expect(circuitsFor("bike").some((c) => c.id === "ciutadella")).toBe(false);
    expect(circuitsFor("bike").length).toBeGreaterThanOrEqual(4);
  });
});

describe("loopWaypoints", () => {
  it("sale y vuelve al mismo punto con un perímetro proporcional a la distancia", () => {
    const start = { lng: 2.17, lat: 41.39 };
    const pts = loopWaypoints(start, 5, 45);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual([2.17, 41.39]);
    expect(pts[4]).toEqual([2.17, 41.39]);
    // Cuadrado de 4 km (5 km / 1,25 de rodeo por calles).
    const per = lineLength(pts);
    expect(per).toBeGreaterThan(3900);
    expect(per).toBeLessThan(4100);
  });

  it("el rumbo cambia hacia dónde va la vuelta", () => {
    const start = { lng: 2.17, lat: 41.39 };
    const north = loopWaypoints(start, 5, 0);
    const south = loopWaypoints(start, 5, 180);
    const midLat = (p: Array<[number, number]>) => p.slice(1, 4).reduce((s, q) => s + q[1], 0) / 3;
    expect(midLat(north)).toBeGreaterThan(41.39);
    expect(midLat(south)).toBeLessThan(41.39);
  });
});

describe("sportSlots", () => {
  const day = Date.UTC(2026, 6, 15, 0, 0);
  const sunrise = day + 4 * HOUR + 32 * MIN; // 6:32 en Barcelona (UTC+2)
  const sunset = day + 19 * HOUR + 22 * MIN; // 21:22

  it("cada media hora a primera y a última hora", () => {
    const s = sportSlots(sunrise, sunset);
    expect(s.morning[0]).toBe(day + 4 * HOUR + 45 * MIN);
    expect(s.morning).toHaveLength(6);
    expect(s.evening[0]).toBe(day + 16 * HOUR);
    expect(s.evening[s.evening.length - 1]).toBeLessThanOrEqual(sunset - 30 * MIN);
  });

  it("quita las horas que ya han pasado", () => {
    const s = sportSlots(sunrise, sunset, day + 6 * HOUR);
    expect(s.morning.every((t) => t >= day + 6 * HOUR)).toBe(true);
    expect(s.morning.length).toBeLessThan(6);
  });
});

describe("pickSlot", () => {
  const slots = [1, 2, 3, 4];

  it("la más tardía que llega al umbral (mañana a la sombra)", () => {
    const p = pickSlot(slots, [95, 88, 76, 40], "latest");
    expect(p).toMatchObject({ index: 2, good: true });
  });

  it("la más temprana que llega al umbral (tarde a la sombra)", () => {
    const p = pickSlot(slots, [30, 60, 80, 90], "earliest");
    expect(p).toMatchObject({ index: 2, good: true });
  });

  it("si ninguna llega, la mejor", () => {
    const p = pickSlot(slots, [30, 60, 50, 20], "latest");
    expect(p).toMatchObject({ index: 1, good: false, pct: 60 });
    expect(pickSlot([], [], "earliest")).toBe(null);
  });
});

describe("GPX, mapas y nombres", () => {
  it("GPX válido con todos los puntos", () => {
    const g = gpxOf("Vuelta <5 km> & más", [
      [2.17, 41.39],
      [2.171, 41.391],
    ]);
    expect(g).toMatch(/^<\?xml/);
    expect(g).toMatch(/&lt;5 km&gt; &amp; más/);
    expect(g.match(/<trkpt /g)).toHaveLength(2);
  });

  it("Google Maps a pie o en bici", () => {
    const c: Array<[number, number]> = [
      [2.17, 41.39],
      [2.18, 41.4],
      [2.17, 41.39],
    ];
    expect(sportMapsUrl(c, "bike")).toMatch(/travelmode=bicycling/);
    expect(sportMapsUrl(c, "run")).toMatch(/travelmode=walking/);
    expect(sportMapsUrl(c, "run")).toMatch(/waypoints=/);
  });

  it("nombre de fichero", () => {
    expect(fileSlug("Passeig Marítim")).toBe("passeig-maritim");
    expect(fileSlug("¡¿")).toBe("ruta");
  });
});
