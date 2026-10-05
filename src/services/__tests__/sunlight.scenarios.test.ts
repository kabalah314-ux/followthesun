import { describe, expect, it } from "vitest";
import { BARCELONA } from "../../config";
import { getSunPosition } from "../../lib/solarCalculations";
import { confidenceLevel } from "../../lib/sunlightCalculations";
import type { CloudCoverage, SatelliteRadiation, ShadowResult } from "../../types";
import { detectWeatherConflict, fuseLight } from "../lightFusionService";
import { resolveSunlight } from "../sunlightService";

/**
 * Escenarios de luz efectiva. Se prueba `resolveSunlight` (función pura) con satélite, modelo y
 * sombra construidos a mano: no hay red ni mapa.
 *
 * Instante: 21 de junio, 12:00 hora de Barcelona (sol alto). La última observación satelital es de
 * 22 min antes: una persistencia dentro de la ventana de presente.
 */

const MIN = 60_000;
const TIME = Date.UTC(2026, 5, 21, 10, 0);
const NOW = TIME;
const LAST_OBS = NOW - 22 * MIN;

const CLEAR_SHADOW: ShadowResult = {
  urbanShadow: false,
  terrainShadow: false,
  buildingsKnown: true,
  confidence: 0.85,
  source: "test",
};
const URBAN_SHADOW: ShadowResult = { ...CLEAR_SHADOW, urbanShadow: true };

function satellite(over: Partial<SatelliteRadiation> = {}): SatelliteRadiation {
  return {
    latitude: BARCELONA.lat,
    longitude: BARCELONA.lng,
    timestamp: new Date(TIME),
    shortwaveRadiation: 900,
    directRadiation: 700,
    diffuseRadiation: 200,
    directNormalIrradiance: 900,
    clearSkyShortwave: 950,
    source: "test satellite",
    nativeResolution: "2,5 km · 10 min",
    observed: false,
    delayMinutes: 22,
    confidence: 0.6,
    updatedAt: new Date(NOW - 2 * MIN),
    origin: "estimated",
    sampleTime: new Date(LAST_OBS),
    leadMinutes: 22,
    directTransmission: 0.95,
    clearSkyIndex: 0.95,
    consistency: 0.95,
    resolutionKm: 2.5,
    temporalResolutionMinutes: 10,
    spatialCoverage: 1,
    ...over,
  };
}

function model(over: Partial<CloudCoverage> = {}): CloudCoverage {
  return {
    latitude: BARCELONA.lat,
    longitude: BARCELONA.lng,
    timestamp: new Date(TIME),
    cloudCover: 0.1,
    lowCloudCover: 0.05,
    mediumCloudCover: 0.05,
    highCloudCover: 0.1,
    confidence: 0.7,
    source: "test model",
    updatedAt: new Date(NOW - 8 * MIN),
    sunshineFraction: 0.95,
    directBeamTransmission: 0.9,
    modelAgreement: 0.9,
    signalConsistency: 0.9,
    spatialCoverage: 1,
    resolutionKm: 2.5,
    quality: "high",
    simulated: false,
    ...over,
  };
}

interface Opts {
  sat?: SatelliteRadiation | null;
  mod?: CloudCoverage | null;
  shadow?: ShadowResult;
  time?: number;
  lastObs?: number | null;
}

function resolve(o: Opts = {}) {
  const time = o.time ?? TIME;
  return resolveSunlight({
    time,
    now: NOW,
    sun: getSunPosition(time, BARCELONA.lat, BARCELONA.lng),
    shadow: o.shadow ?? CLEAR_SHADOW,
    satellite: o.sat === undefined ? satellite() : o.sat,
    model: o.mod === undefined ? model() : o.mod,
    lastObservationAt: o.lastObs === undefined ? LAST_OBS : o.lastObs,
  });
}

describe("Escenario A — cielo despejado, mucha radiación directa, sin sombra", () => {
  it("→ SOL DIRECTO, observado, confianza alta", () => {
    const r = resolve();
    expect(r.state).toBe("direct");
    expect(r.visual).toBe("sun");
    expect(r.origin).toBe("observed");
    expect(r.conflict).toBe(false);
    expect(r.urbanShadow).toBe(false);
    expect(r.sunlightScore).toBeGreaterThan(0.8);
    expect(confidenceLevel(r.confidence)).toBe("high");
  });
});

describe("Escenario B — mucha nubosidad y poca radiación directa", () => {
  it("→ NUBES BLOQUEAN (cloud_blocked), sin ser sombra urbana", () => {
    const r = resolve({
      sat: satellite({ directTransmission: 0.1, clearSkyIndex: 0.15, consistency: 0.9 }),
      mod: model({ cloudCover: 0.9, directBeamTransmission: 0.12 }),
    });
    expect(["cloud_blocked", "partial"]).toContain(r.state);
    expect(r.cloudBlocked).toBe(true);
    expect(r.limitedBy).toContain("cloud_cover");
    expect(r.limitedBy).not.toContain("urban_shadow");
    expect(r.cloudInfluence).toBeGreaterThan(0.6);
    expect(r.sunlightScore).toBeLessThan(0.3);
  });
});

describe("Escenario C — satélite despejado con sombra de edificio", () => {
  it("→ SOMBRA URBANA: la sombra manda y las nubes no se mezclan con ella", () => {
    const r = resolve({ shadow: URBAN_SHADOW });
    expect(r.state).toBe("urban_shadow");
    expect(r.urbanShadow).toBe(true);
    expect(r.sunlightScore).toBe(0);
    expect(r.cloudBlocked).toBe(false);
    expect(r.cloudInfluence).toBeLessThan(0.25);
    expect(r.limitedBy).toContain("urban_shadow");
    expect(r.limitedBy).not.toContain("cloud_cover");
  });

  it("con nubes además → SOMBRA URBANA + NUBES, estados separados", () => {
    const r = resolve({
      shadow: URBAN_SHADOW,
      sat: satellite({ directTransmission: 0.1, clearSkyIndex: 0.15 }),
      mod: model({ directBeamTransmission: 0.12 }),
    });
    expect(r.state).toBe("urban_shadow_cloud");
    expect(r.limitedBy).toEqual(expect.arrayContaining(["urban_shadow", "cloud_cover"]));
  });
});

describe("Escenario D — satélite incierto (antiguo), modelo despejado", () => {
  it("→ SOL DIRECTO con confianza MEDIA, apoyado en el modelo", () => {
    const old = LAST_OBS - 178 * MIN; // observación de hace 200 min
    const r = resolve({
      sat: satellite({ origin: "stale", leadMinutes: 200, sampleTime: new Date(old) }),
      mod: model({ directBeamTransmission: 0.92 }),
      lastObs: old,
    });
    expect(r.state).toBe("direct");
    expect(r.origin).toBe("forecast");
    expect(confidenceLevel(r.confidence)).toBe("medium");
    expect(r.fusion?.winner).toBe("model");
  });
});

describe("Escenario E — satélite con poca radiación, modelo con mucha", () => {
  const conflict = resolve({
    sat: satellite({ directTransmission: 0.1, clearSkyIndex: 0.15, consistency: 0.95 }),
    mod: model({ directBeamTransmission: 0.9 }),
  });
  const agreeing = resolve();

  it("→ CONFLICTO detectado y confianza reducida (no se promedia en silencio)", () => {
    expect(conflict.conflict).toBe(true);
    expect(conflict.fusion?.conflictMagnitude).toBeGreaterThan(0.35);
    expect(conflict.confidence).toBeLessThan(agreeing.confidence * 0.6);
    // Dentro de la ventana de presente manda la observación: el resultado no es el promedio 0,5.
    expect(conflict.directTransmission).toBeLessThan(0.5);
  });

  it("sin ganador claro y en conflicto → estado INCIERTO", () => {
    const obs = NOW - 75 * MIN;
    const r = resolve({
      sat: satellite({
        directTransmission: 0.1,
        clearSkyIndex: 0.15,
        leadMinutes: 75,
        sampleTime: new Date(obs),
      }),
      mod: model({ directBeamTransmission: 0.9 }),
      lastObs: obs,
    });
    expect(r.fusion?.winner).toBe("blend");
    expect(r.conflict).toBe(true);
    expect(r.state).toBe("uncertain");
    expect(r.origin).toBe("estimated");
  });
});

describe("Escenario F — noche", () => {
  it("→ NIGHT, sin puntuación ni fusión", () => {
    const r = resolve({ time: Date.UTC(2026, 5, 21, 0, 0) });
    expect(r.state).toBe("night");
    expect(r.visual).toBe("night");
    expect(r.sunlightScore).toBe(0);
    expect(r.sunAboveHorizon).toBe(false);
    expect(r.fusion).toBeNull();
  });
});

describe("Sin datos meteorológicos — «Sol posible», nunca «Sol directo»", () => {
  it("geometría solar conocida + meteorología no disponible → POSSIBLE", () => {
    const r = resolve({ sat: null, mod: null });
    expect(r.state).toBe("possible");
    expect(r.weatherAvailable).toBe(false);
    expect(r.confidence).toBeLessThanOrEqual(0.3);
    expect(r.cloudInfluence).toBe(0);
  });

  it("la sombra urbana sigue siendo conocida sin meteorología", () => {
    const r = resolve({ sat: null, mod: null, shadow: URBAN_SHADOW });
    expect(r.state).toBe("urban_shadow");
  });
});

describe("Detección de conflicto", () => {
  it("modelo dice sol alto y satélite directa baja → conflicto", () => {
    const c = detectWeatherConflict(0.1, 0.9);
    expect(c.conflict).toBe(true);
    expect(c.kind).toBe("satellite_darker");
  });
  it("diferencias pequeñas no son conflicto; sin una fuente tampoco", () => {
    expect(detectWeatherConflict(0.5, 0.6).conflict).toBe(false);
    expect(detectWeatherConflict(null, 0.6).conflict).toBe(false);
  });
});

describe("Fusión", () => {
  const sun = getSunPosition(TIME, BARCELONA.lat, BARCELONA.lng);

  it("no es un promedio 50/50: la fuente más fiable pesa más", () => {
    const f = fuseLight({
      time: TIME,
      now: NOW,
      sun,
      satellite: satellite({ directTransmission: 0.2 }),
      model: model({ directBeamTransmission: 0.8 }),
      lastObservationAt: LAST_OBS,
    });
    expect(f.directTransmission).not.toBeCloseTo(0.5, 1);
    expect(f.satelliteShare).toBeGreaterThanOrEqual(0.7);
    expect(f.decision.length).toBeGreaterThan(3);
  });

  it("fuera de la ventana de presente el satélite pierde la prioridad", () => {
    const far = TIME + 5 * 3_600_000;
    const f = fuseLight({
      time: far,
      now: NOW,
      sun: getSunPosition(far, BARCELONA.lat, BARCELONA.lng),
      satellite: satellite({ leadMinutes: 5 * 60 + 22, sampleTime: new Date(LAST_OBS) }),
      model: model({ directBeamTransmission: 0.4 }),
      lastObservationAt: LAST_OBS,
    });
    expect(f.inCurrentWindow).toBe(false);
    expect(f.winner).toBe("model");
    expect(f.origin).toBe("forecast");
  });
});
