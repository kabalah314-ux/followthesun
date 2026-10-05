import { describe, expect, it } from "vitest";
import {
  SatelliteGridModel,
  type SatelliteGridData,
  type SatelliteMeta,
} from "../satelliteInterpolation";
import { calculateClearSkyValues } from "../radiationCalculations";
import { DEG } from "../coordinates";
import { getSunPosition } from "../solarCalculations";

/**
 * La rejilla satelital distingue muestra observada, interpolada y persistida, y calibra el cielo
 * despejado calculado con el del satélite cuando existe.
 */

const MIN = 60_000;
const SPEC = { bounds: { west: 2.1, east: 2.2, south: 41.35, north: 41.45 }, cols: 2, rows: 2 };
const CENTER = { lat: 41.4, lng: 2.15 };
const T0 = Date.UTC(2026, 5, 21, 8, 0);
const STEP = 10 * MIN;
const STEPS = 8;
const OBSERVED = 5; // pasos 0..4 observados; 5..7 todavía no existen
const TRUE_T = 0.6;

const META: SatelliteMeta = {
  providerId: "test",
  label: "test",
  source: "test",
  attribution: "test",
  requestedSource: "test",
  resolutionKm: 2.5,
  temporalResolutionMinutes: 10,
  fetchedAt: T0 + 4 * STEP + 20 * MIN,
  nodeOffsetKm: 0,
  hasClearSky: false,
  directProvenance: "unverified",
};

function build(clearSkyScale: number | null): SatelliteGridData {
  const nodes = SPEC.cols * SPEC.rows;
  const size = nodes * STEPS;
  const mk = () => new Float32Array(size).fill(NaN);
  const ghi = mk();
  const direct = mk();
  const diffuse = mk();
  const dni = mk();
  const clearGhi = mk();
  for (let s = 0; s < OBSERVED; s++) {
    const t = T0 + s * STEP;
    const cs = calculateClearSkyValues(CENTER.lat, CENTER.lng, t);
    const sinE = Math.sin(getSunPosition(t, CENTER.lat, CENTER.lng).altitudeDeg * DEG);
    for (let n = 0; n < nodes; n++) {
      const i = n * STEPS + s;
      dni[i] = TRUE_T * cs.dni;
      direct[i] = TRUE_T * cs.dni * sinE;
      ghi[i] = 0.8 * cs.ghi;
      diffuse[i] = Math.max(0, ghi[i] - direct[i]);
      if (clearSkyScale !== null) clearGhi[i] = clearSkyScale * cs.ghi;
    }
  }
  return {
    spec: SPEC,
    t0: T0,
    stepMs: STEP,
    steps: STEPS,
    ghi,
    direct,
    diffuse,
    dni,
    clearGhi,
    meta: { ...META, hasClearSky: clearSkyScale !== null },
  };
}

describe("SatelliteGridModel — origen de cada respuesta", () => {
  const model = new SatelliteGridModel(build(null));
  const sample = model.pointSampler(CENTER.lng, CENTER.lat);

  it("la última observación es el último paso con datos", () => {
    expect(model.lastObservedTime).toBe(T0 + (OBSERVED - 1) * STEP);
  });

  it("un instante que coincide con una muestra es OBSERVADO", () => {
    const r = sample(T0 + 2 * STEP);
    expect(r?.origin).toBe("observed");
    expect(r?.tDir).toBeCloseTo(TRUE_T, 3);
  });

  it("entre dos muestras es INTERPOLADO (no medido)", () => {
    const r = sample(T0 + 2 * STEP + 4 * MIN);
    expect(r?.origin).toBe("interpolated");
    expect(r?.tDir).toBeCloseTo(TRUE_T, 3);
  });

  it("después de la última muestra se PERSISTE el índice de transmisión", () => {
    const r = sample(T0 + (OBSERVED - 1) * STEP + 25 * MIN);
    expect(r?.origin).toBe("persistence");
    expect(r?.leadMs).toBe(25 * MIN);
    expect(r?.tDir).toBeCloseTo(TRUE_T, 3);
  });

  it("antes de la primera muestra no se extrapola", () => {
    expect(sample(T0 - 60 * MIN)).toBeNull();
  });
});

describe("Calibración del cielo despejado con el del satélite", () => {
  it("sin GHI de cielo despejado del satélite, el factor es 1 y la fuente 'none'", () => {
    const m = new SatelliteGridModel(build(null));
    expect(m.calibration.source).toBe("none");
    expect(m.calibration.factor).toBe(1);
  });

  it("con el cielo despejado del satélite un 10 % mayor, se calibra y la transmisión baja", () => {
    const m = new SatelliteGridModel(build(1.1));
    expect(m.calibration.source).toBe("satellite");
    expect(m.calibration.factor).toBeCloseTo(1.1, 2);
    const r = m.pointSampler(CENTER.lng, CENTER.lat)(T0 + 2 * STEP);
    expect(r?.tDir).toBeCloseTo(TRUE_T / 1.1, 2);
  });
});
