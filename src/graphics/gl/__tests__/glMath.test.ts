import { describe, expect, it } from "vitest";
import { buildRampLut, lightParams, ramp } from "../../../engine/layers/SolarHeatmap";
import { localToClipMatrix } from "../glUtils";
import { zoomFactors } from "../SolarGLLayer";

/** Producto de matrices 4×4 en columnas (referencia en doble precisión). */
function mul(a: ArrayLike<number>, b: ArrayLike<number>) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  return out;
}

describe("localToClipMatrix", () => {
  it("equivale a main × traslación(origen) × escala(1/mpu)", () => {
    const main = Float64Array.from({ length: 16 }, (_, i) => Math.sin(i + 1) * 1e5 + (i % 5 === 0 ? 3 : 0));
    const ox = 0.506;
    const oy = 0.3735;
    const mpu = 30_070_000;
    const s = 1 / mpu;
    const local = Float64Array.of(s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, ox, oy, 0, 1);
    const ref = mul(main, local);
    const got = localToClipMatrix(main, ox, oy, mpu, new Float32Array(16));
    for (let i = 0; i < 16; i++) expect(Math.abs(got[i] - ref[i])).toBeLessThan(Math.abs(ref[i]) * 1e-6 + 1e-9);
  });
});

describe("escala de luz compartida por canvas y GPU", () => {
  it("la tabla de color reproduce la escala (transparente sin sol, ámbar al ~48 % con sol fuerte)", () => {
    const lut = buildRampLut(256);
    expect(lut.length).toBe(256 * 4);
    expect(lut[3]).toBe(0);
    const top = ramp(1);
    expect(lut[255 * 4]).toBe(Math.round(top[0]));
    expect(lut[255 * 4 + 3]).toBe(Math.round(top[3] * 255));
  });

  it("de noche no hay sol ni sombras; de día, sí", () => {
    const night = lightParams(-12, true);
    expect(night.dayK).toBe(0);
    expect(night.shadeK).toBe(0);
    expect(night.nightK).toBe(1);
    const noon = lightParams(45, true);
    expect(noon.dayK).toBe(1);
    expect(noon.shadeK).toBe(1);
    expect(noon.elev).toBe(1);
    expect(noon.cap).toBe(1);
    expect(lightParams(45, false).cap).toBeCloseTo(0.62, 5);
  });
});

describe("factores de zoom", () => {
  it("las sombras aparecen hacia 13, el tono se refuerza en «calle» y «terraza»", () => {
    expect(zoomFactors(11, true).shadowZoomFade).toBe(0);
    expect(zoomFactors(13.2, true).shadowZoomFade).toBe(1);
    expect(zoomFactors(13, true).toneAlpha).toBeCloseTo(0.46, 5);
    expect(zoomFactors(16, true).toneAlpha).toBeCloseTo(0.58, 5);
    expect(zoomFactors(19.5, true).toneAlpha).toBeCloseTo(0.64, 5);
  });

  it("la altura 3D sigue la misma transición que la extrusión del mapa", () => {
    expect(zoomFactors(14.5, true).extrudeK).toBe(0);
    expect(zoomFactors(17, true).extrudeK).toBe(1);
    expect(zoomFactors(17, false).extrudeK).toBe(0);
  });
});
