import { describe, expect, it } from "vitest";
import { calculateClearSkyValues, dniIndex, modelTransmission } from "../radiationCalculations";
import { calculateSourceWeight, type SourceWeightInputs } from "../sourceWeights";
import { layerClearProbability } from "../sunlightCalculations";

describe("Cielo despejado calculado vs. cielo despejado del satélite", () => {
  it("el GHI de Haurwitz coincide con el del satélite (709 W/m² el 2-oct-2026 a las 11:40 UTC)", () => {
    // Valor real de `shortwave_radiation_clear_sky_instant` (satellite_radiation_seamless) en la
    // celda (41,375 N · 2,175 E). Pico del día.
    const calc = calculateClearSkyValues(41.375, 2.175, Date.UTC(2026, 9, 2, 11, 40));
    expect(calc.ghi).toBeGreaterThan(709 * 0.95);
    expect(calc.ghi).toBeLessThan(709 * 1.05);
  });

  it("de noche todo es cero", () => {
    const c = calculateClearSkyValues(41.39, 2.17, Date.UTC(2026, 5, 21, 0, 0));
    expect(c.ghi).toBe(0);
    expect(c.dni).toBe(0);
  });

  it("con el sol alto la DNI de cielo despejado es plausible (800–1000 W/m²)", () => {
    const c = calculateClearSkyValues(41.39, 2.17, Date.UTC(2026, 5, 21, 10, 0));
    expect(c.dni).toBeGreaterThan(800);
    expect(c.dni).toBeLessThan(1000);
  });

  it("con el sol bajo el cociente DNI / DNI de cielo despejado no es fiable (NaN)", () => {
    expect(Number.isNaN(dniIndex(10, 20))).toBe(true);
    expect(dniIndex(450, 900)).toBeCloseTo(0.5, 5);
  });
});

describe("Nube ≠ menos luz: una nube alta fina no equivale a una espesa y baja", () => {
  it("cirros al 100 % dejan pasar más sol que estratos bajos al 80 %", () => {
    const cirrus = layerClearProbability(1, 0, 0, 1);
    const stratus = layerClearProbability(0.8, 0.8, 0, 0);
    expect(cirrus).toBeCloseTo(0.55, 5);
    expect(stratus).toBeCloseTo(0.2, 5);
    expect(cirrus).toBeGreaterThan(stratus);
  });

  it("más de un 50 % de nubes NO implica «sin sol»", () => {
    const t = modelTransmission({ cloud: 0.7, low: 0, mid: 0, high: 0.7, sunshine: NaN, radiation: NaN });
    expect(t.value).toBeGreaterThan(0.5);
  });

  it("la radiación del modelo pesa más que sunshine_duration", () => {
    const radiationHigh = modelTransmission({ cloud: 0.5, low: 0.2, mid: 0.2, high: 0.2, sunshine: 0, radiation: 0.9 });
    const sunshineHigh = modelTransmission({ cloud: 0.5, low: 0.2, mid: 0.2, high: 0.2, sunshine: 0.9, radiation: 0 });
    expect(radiationHigh.value).toBeGreaterThan(sunshineHigh.value);
  });

  it("sin ninguna señal no se inventa un valor", () => {
    const t = modelTransmission({ cloud: NaN, low: NaN, mid: NaN, high: NaN, sunshine: NaN, radiation: NaN });
    expect(Number.isNaN(t.value)).toBe(true);
  });
});

describe("calculateSourceWeight — por qué una fuente gana a otra", () => {
  const sat = (over: Partial<SourceWeightInputs> = {}) =>
    calculateSourceWeight({
      kind: "satellite",
      available: true,
      leadMinutes: 0,
      sampleOrigin: "observed",
      ageMinutes: 0,
      spatialResolutionKm: 2.5,
      temporalResolutionMinutes: 10,
      agreement: 0.95,
      coverage: 1,
      solarElevationDeg: 50,
      ...over,
    });
  const mod = (over: Partial<SourceWeightInputs> = {}) =>
    calculateSourceWeight({
      kind: "model",
      available: true,
      leadMinutes: 0,
      sampleOrigin: "forecast",
      ageMinutes: 5,
      spatialResolutionKm: 2.5,
      temporalResolutionMinutes: 60,
      agreement: 0.9,
      coverage: 1,
      solarElevationDeg: 50,
      ...over,
    });

  it("observada > interpolada > persistencia reciente > persistencia antigua", () => {
    const observed = sat().weight;
    const interpolated = sat({ sampleOrigin: "interpolated" }).weight;
    const fresh = sat({ sampleOrigin: "persistence", leadMinutes: 30 }).weight;
    const old = sat({ sampleOrigin: "persistence", leadMinutes: 150 }).weight;
    expect(observed).toBeGreaterThan(interpolated);
    expect(interpolated).toBeGreaterThan(fresh);
    expect(fresh).toBeGreaterThan(old);
  });

  it("el sol bajo y la resolución gruesa restan peso", () => {
    expect(sat({ solarElevationDeg: 3 }).weight).toBeLessThan(sat().weight);
    expect(sat({ spatialResolutionKm: 11 }).weight).toBeLessThan(sat().weight);
  });

  it("el modelo pierde peso con el horizonte y con la edad del dato", () => {
    expect(mod({ leadMinutes: 6 * 60 }).weight).toBeLessThan(mod().weight);
    expect(mod({ ageMinutes: 200 }).weight).toBeLessThan(mod().weight);
  });

  it("una fuente sin datos pesa 0", () => {
    expect(sat({ available: false }).weight).toBe(0);
  });

  it("la observación fresca supera al modelo; la antigua, no", () => {
    expect(sat({ sampleOrigin: "persistence", leadMinutes: 20 }).weight).toBeGreaterThan(
      mod({ leadMinutes: 20 }).weight * 0.9
    );
    expect(sat({ sampleOrigin: "persistence", leadMinutes: 200 }).weight).toBeLessThan(mod().weight);
  });

  it("explica en palabras qué limita a una fuente", () => {
    expect(sat({ solarElevationDeg: 3 }).explanation).toContain("sol bajo");
  });
});
