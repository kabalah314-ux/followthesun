import { afterEach, describe, expect, it, vi } from "vitest";
import type { SunPlace, SunSample, SunSearchRequest, SunWindowKind } from "../../types";

// Los edificios se descargan de la red: en los tests no hay ninguno cargado.
vi.mock("../urbanGeometryService", () => ({
  urbanGeometryService: {
    load: async () => ({
      buildings: null,
      known: () => false,
      stats: { tiles: 0, loaded: 0, failed: 0, buildings: 0 },
    }),
  },
}));

import {
  allowedTypes,
  buildTimes,
  findBestSunPlaces,
  invertForShade,
  normalizeRequest,
  selectCandidates,
} from "../sunSearchService";

const MIN = 60_000;
const HOUR = 3_600_000;
/** 21 de junio de 2026, 12:00 en Barcelona. */
const NOON = Date.UTC(2026, 5, 21, 10, 0);

const square = (id: string, name: string, lng: number, lat: number, d = 0.002): SunPlace => ({
  id,
  name,
  type: "park",
  latitude: lat + d / 2,
  longitude: lng + d / 2,
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + d, lat],
        [lng + d, lat + d],
        [lng, lat + d],
        [lng, lat],
      ],
    ],
  },
  areaM2: 40_000,
  source: "test",
});

const PARK_A = square("t:a", "Parc A", 2.168, 41.389);
const PARK_B = square("t:b", "Parc B", 2.2, 41.4);
const TERRACE: SunPlace = {
  id: "t:terrace",
  name: "Cafè",
  type: "terrace",
  latitude: 41.39,
  longitude: 2.171,
  source: "test",
};
const VIEWPOINT: SunPlace = {
  id: "t:view",
  name: "Mirador",
  type: "viewpoint",
  latitude: 41.41,
  longitude: 2.15,
  source: "test",
};

const REQUEST: SunSearchRequest = {
  startTime: NOON,
  endTime: NOON + 2 * HOUR,
  minimumSunlightMinutes: 60,
};

describe("petición", () => {
  it("la franja nunca es más corta que la duración pedida", () => {
    const r = normalizeRequest({ startTime: NOON, endTime: NOON + 20 * MIN, minimumSunlightMinutes: 60 });
    expect(r.endTime - r.startTime).toBe(60 * MIN);
  });

  it("limita la duración a valores razonables y rellena los valores por defecto", () => {
    const r = normalizeRequest({ startTime: NOON, endTime: NOON + HOUR, minimumSunlightMinutes: 1 });
    expect(r.minimumSunlightMinutes).toBe(10);
    expect(r.locationType).toBe("any");
    expect(r.preference).toBe("maximum_sun");
    expect(r.limit).toBe(3);
  });

  it("las franjas largas usan un paso mayor", () => {
    expect(normalizeRequest(REQUEST).stepMs).toBe(10 * MIN);
    const long = normalizeRequest({ startTime: NOON, endTime: NOON + 6 * HOUR, minimumSunlightMinutes: 60 });
    expect(long.stepMs).toBe(15 * MIN);
  });

  it("divide la franja en instantes", () => {
    expect(buildTimes(NOON, NOON + HOUR, 10 * MIN)).toHaveLength(6);
    expect(buildTimes(NOON, NOON, 10 * MIN)).toHaveLength(1);
  });
});

describe("candidatos", () => {
  const all = [PARK_A, PARK_B, TERRACE, VIEWPOINT];

  it("«cualquier lugar» no incluye terrazas; «Café» sí (y solo terrazas)", () => {
    expect(allowedTypes({ locationType: "any" })).not.toContain("terrace");
    const any = selectCandidates(all, normalizeRequest(REQUEST));
    expect(any.map((c) => c.place.id)).not.toContain("t:terrace");
    const coffee = selectCandidates(all, normalizeRequest({ ...REQUEST, intent: "coffee" }));
    expect(coffee.map((c) => c.place.id)).toEqual(["t:terrace"]);
  });

  it("un tipo elegido manda sobre la intención", () => {
    const r = selectCandidates(all, normalizeRequest({ ...REQUEST, intent: "coffee", locationType: "viewpoint" }));
    expect(r.map((c) => c.place.id)).toEqual(["t:view"]);
  });

  it("el límite de minutos a pie descarta lo lejano (solo con ubicación)", () => {
    const origin = { lng: 2.169, lat: 41.39 };
    const near = selectCandidates(all, normalizeRequest({ ...REQUEST, origin, maximumWalkingMinutes: 10 }));
    expect(near.map((c) => c.place.id)).toEqual(["t:a"]);
    expect(near[0].walkingMinutes).toBeLessThanOrEqual(10);
    // Sin ubicación no hay distancia que limitar.
    const noOrigin = selectCandidates(all, normalizeRequest({ ...REQUEST, maximumWalkingMinutes: 10 }));
    expect(noOrigin.length).toBe(3);
  });

  it("con ubicación se ordena por cercanía", () => {
    const origin = { lng: 2.2, lat: 41.4 };
    const ids = selectCandidates(all, normalizeRequest({ ...REQUEST, origin })).map((c) => c.place.id);
    expect(ids[0]).toBe("t:b");
  });
});

/**
 * Búsqueda completa de extremo a extremo SIN datos meteorológicos ni edificios: es el camino de
 * «Sol posible». Comprueba el pipeline entero (candidatos → puntos → series → ventanas → score →
 * ranking) y que no se inventa precisión.
 */
async function search(request: SunSearchRequest, places: SunPlace[]) {
  vi.useFakeTimers();
  try {
    const p = findBestSunPlaces(request, { places, now: NOON });
    // Sin datos aún, la búsqueda espera unos segundos a la meteorología antes de seguir sin ella.
    await vi.advanceTimersByTimeAsync(10_000);
    return await p;
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("búsqueda de extremo a extremo (sin meteorología)", () => {
  it("devuelve lugares ordenados, con ventanas, y avisa de que faltan datos", async () => {
    const out = await search(REQUEST, [PARK_A, PARK_B]);
    expect(out.status).toBe("weather_unavailable");
    expect(out.notices).toContain("weather_unavailable");
    expect(out.notices).toContain("buildings_partial");
    expect(out.results.length).toBeGreaterThanOrEqual(1);
    expect(out.results.length).toBeLessThanOrEqual(3);

    out.results.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      expect(r.windows.length).toBeGreaterThan(0);
      expect(r.sunlightMinutes).toBeGreaterThan(0);
      expect(r.sunlightMinutes).toBeLessThanOrEqual(60);
      expect(r.directSunPercentage).toBeGreaterThanOrEqual(0);
      expect(r.directSunPercentage).toBeLessThanOrEqual(100);
      expect(Number.isFinite(r.score)).toBe(true);
      expect(Number.isFinite(r.confidence)).toBe(true);
      expect(r.reasons.length).toBeGreaterThan(0);
      // Sin datos de nubes, el sol es solo posible y la confianza no pasa del tope.
      expect(r.weatherAvailable).toBe(false);
      expect(r.confidence).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(r.buildingsKnown).toBe(false);
    });
  });

  it("cada resultado señala el mejor punto del lugar, dentro del lugar", async () => {
    const out = await search(REQUEST, [PARK_A]);
    const r = out.results[0];
    expect(r.spot.longitude).toBeGreaterThanOrEqual(2.168);
    expect(r.spot.longitude).toBeLessThanOrEqual(2.17);
    expect(r.spot.latitude).toBeGreaterThanOrEqual(41.389);
    expect(r.spot.latitude).toBeLessThanOrEqual(41.391);
    expect(r.sampledPoints).toBeGreaterThan(1);
  });

  it("los resultados no se amontonan: a menos de 300 m solo queda el mejor", async () => {
    const twin = square("t:twin", "Parc Gemelo", 2.1685, 41.3895); // casi el mismo sitio
    const out = await search(REQUEST, [PARK_A, twin]);
    expect(out.results).toHaveLength(1);
  });

  it("de noche no hay sol y se dice por qué, sin resultados inventados", async () => {
    const night = Date.UTC(2026, 5, 21, 1, 0); // 03:00 en Barcelona
    const out = await search(
      { startTime: night, endTime: night + 2 * HOUR, minimumSunlightMinutes: 60 },
      [PARK_A]
    );
    expect(out.status).toBe("no_results");
    expect(out.noSunReason).toBe("night");
    expect(out.results).toHaveLength(0);
    expect(out.bestAvailable).toHaveLength(0);
  });

  it("sin candidatos de ese tipo lo dice en lugar de devolver otra cosa", async () => {
    const out = await search({ ...REQUEST, locationType: "beach" }, [PARK_A]);
    expect(out.status).toBe("no_results");
    expect(out.noSunReason).toBe("no_places");
  });
});

describe("modo sombra", () => {
  const sample = (kind: SunWindowKind, score: number): SunSample => ({
    time: NOON,
    kind,
    score,
    urbanShadow: true,
    terrainShadow: false,
    cloudInfluence: 0,
    confidence: 1,
    geometryConfidence: 1,
    weatherConfidence: 1,
    unverified: true,
    origin: "estimated",
    elevationDeg: 60,
  });

  it("invierte sol y sombra, pero la noche sigue sin contar como sombra útil", () => {
    const sun = invertForShade(sample("sun", 1));
    expect(sun.kind).toBe("shadow");
    expect(sun.score).toBe(0);
    expect(sun.urbanShadow).toBe(false);
    expect(sun.unverified).toBe(false);

    expect(invertForShade(sample("shadow", 0.2)).kind).toBe("sun");
    expect(invertForShade(sample("shadow", 0.2)).score).toBeCloseTo(0.8, 6);
    expect(invertForShade(sample("cloud", 0.5)).kind).toBe("sun");

    const night = sample("night", 0);
    expect(invertForShade(night)).toEqual(night);
  });

  it("si el sitio está todo al sol, no se inventa una ventana de sombra", async () => {
    const out = await search({ ...REQUEST, intent: "shade" }, [PARK_A]);
    expect(out.results).toHaveLength(0);
    expect(out.status).toBe("no_results");
    expect(out.noSunReason).toBe("none");
  });

  it("la intención de sombra usa los tipos con sombra natural (parques, plazas, terrazas)", () => {
    const types = allowedTypes(normalizeRequest({ ...REQUEST, intent: "shade" }));
    expect(types).toContain("park");
    expect(types).toContain("square");
    expect(types).toContain("open_space");
    expect(types).toContain("terrace");
    expect(types).not.toContain("beach");
  });
});
