import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  WeatherGridModel,
  createWeatherSample,
  type WeatherGridData,
} from "../cloudInterpolation";
import { calculateClearSkyValues } from "../radiationCalculations";
import { SatelliteGridModel, type SatelliteGridData } from "../satelliteInterpolation";

/**
 * Regresión: con la rejilla real (6 × 5 = 30 nodos) cada consulta debe mezclar exactamente los 4
 * nodos que rodean el punto, con sus pesos bilineales. Una rejilla de 2 × 2 no detecta errores de
 * indexación, por eso estas pruebas usan la forma real.
 *
 * Valor del nodo (columna i, fila j): 0,2 + 0,1·i  → varía solo con la longitud, así que el
 * resultado esperado en cualquier punto es lineal en la longitud.
 */

const SPEC = { bounds: { west: 2.03, east: 2.28, south: 41.31, north: 41.51 }, cols: 6, rows: 5 };
const NODES = SPEC.cols * SPEC.rows;
const COL_STEP = (SPEC.bounds.east - SPEC.bounds.west) / (SPEC.cols - 1); // 0,05°
const LAT_MID = (SPEC.bounds.north + SPEC.bounds.south) / 2; // fila 2
const lngOfCol = (i: number) => SPEC.bounds.west + i * COL_STEP;
const value = (node: number) => 0.2 + 0.1 * (node % SPEC.cols);

const T0 = Date.UTC(2026, 5, 21, 8, 0);

describe("WeatherGridModel.pointSampler con la rejilla real 6 × 5", () => {
  const hours = 4;
  const mk = () => new Float32Array(NODES * hours).fill(NaN);
  const cloud = mk();
  for (let n = 0; n < NODES; n++) for (let h = 0; h < hours; h++) cloud[n * hours + h] = value(n);

  const data: WeatherGridData = {
    spec: SPEC,
    t0: T0,
    stepMs: HOUR_MS,
    hours,
    sunshineOffsetMs: -HOUR_MS / 2,
    cloud,
    low: mk(),
    mid: mk(),
    high: mk(),
    sunshine: mk(),
    radiation: mk(),
    dni: mk(),
    ghi: mk(),
    spread: mk(),
    fallback: new Uint8Array(NODES * hours),
    meta: {
      providerId: "test",
      label: "test",
      attribution: "test",
      primaryModel: "test",
      fallbackModel: null,
      resolutionKm: 2.5,
      fallbackResolutionKm: null,
      baseConfidence: 0.8,
      fallbackBaseConfidence: 0.5,
      simulated: false,
      fetchedAt: T0,
      sunshineSemantics: "test",
    },
  };
  const model = new WeatherGridModel(data);

  it("en un nodo devuelve exactamente el valor de ese nodo", () => {
    const out = createWeatherSample();
    const ok = model.pointSampler(lngOfCol(3), LAT_MID)(T0 + HOUR_MS, out);
    expect(ok).toBe(true);
    expect(out.cloud).toBeCloseTo(0.5, 4);
  });

  it("entre dos nodos interpola linealmente", () => {
    const out = createWeatherSample();
    model.pointSampler(lngOfCol(3) + COL_STEP / 2, LAT_MID)(T0 + HOUR_MS, out);
    expect(out.cloud).toBeCloseTo(0.55, 4);
  });

  it("en el último nodo (esquina) no se sale del búfer", () => {
    const out = createWeatherSample();
    model.pointSampler(SPEC.bounds.east - 1e-4, SPEC.bounds.north - 1e-4)(T0 + HOUR_MS, out);
    expect(out.cloud).toBeCloseTo(0.7, 2);
  });

  it("la instantánea y el muestreador de punto coinciden", () => {
    const snap = model.snapshotAt(T0 + HOUR_MS);
    const a = createWeatherSample();
    const b = createWeatherSample();
    snap.sample(lngOfCol(2) + 0.013, LAT_MID + 0.021, a);
    model.pointSampler(lngOfCol(2) + 0.013, LAT_MID + 0.021)(T0 + HOUR_MS, b);
    expect(a.cloud).toBeCloseTo(b.cloud, 6);
  });
});

describe("SatelliteGridModel.pointSampler con la rejilla real 6 × 5", () => {
  const steps = 3;
  const stepMs = 10 * 60_000;
  const mk = () => new Float32Array(NODES * steps).fill(NaN);
  const ghi = mk();
  const direct = mk();
  const diffuse = mk();
  const dni = mk();
  const clearGhi = mk();
  const center = { lat: LAT_MID, lng: (SPEC.bounds.east + SPEC.bounds.west) / 2 };

  for (let s = 0; s < steps; s++) {
    const cs = calculateClearSkyValues(center.lat, center.lng, T0 + s * stepMs);
    for (let n = 0; n < NODES; n++) {
      const i = n * steps + s;
      dni[i] = value(n) * cs.dni; // transmisión del nodo = value(n)
      ghi[i] = 0.7 * cs.ghi;
      direct[i] = 0.5 * ghi[i];
      diffuse[i] = ghi[i] - direct[i];
    }
  }

  const data: SatelliteGridData = {
    spec: SPEC,
    t0: T0,
    stepMs,
    steps,
    ghi,
    direct,
    diffuse,
    dni,
    clearGhi,
    meta: {
      providerId: "test",
      label: "test",
      source: "test",
      attribution: "test",
      requestedSource: "test",
      resolutionKm: 2.5,
      temporalResolutionMinutes: 10,
      fetchedAt: T0 + 2 * stepMs + 20 * 60_000,
      nodeOffsetKm: 0,
      hasClearSky: false,
      directProvenance: "unverified",
    },
  };
  const model = new SatelliteGridModel(data);

  it("en un nodo devuelve la transmisión de ese nodo", () => {
    const r = model.pointSampler(lngOfCol(3), LAT_MID)(T0);
    expect(r?.origin).toBe("observed");
    expect(r?.tDir).toBeCloseTo(0.5, 3);
  });

  it("entre dos nodos interpola la transmisión", () => {
    const r = model.pointSampler(lngOfCol(3) + COL_STEP / 2, LAT_MID)(T0);
    expect(r?.tDir).toBeCloseTo(0.55, 3);
  });

  it("la instantánea y el muestreador de punto coinciden", () => {
    const snap = model.snapshotAt(T0);
    const a = snap?.sample(lngOfCol(1) + 0.02, LAT_MID - 0.03);
    const b = model.pointSampler(lngOfCol(1) + 0.02, LAT_MID - 0.03)(T0);
    expect(a?.tDir).toBeCloseTo(b?.tDir ?? NaN, 6);
  });
});
