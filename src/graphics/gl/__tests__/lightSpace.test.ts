import { describe, expect, it } from "vitest";
import { eyeFromMatrix, invert4, lightMatrix, sunVectorLocal, transformPoint } from "../lightSpace";

const DEG = Math.PI / 180;

/** Perspectiva + mirada (column-major), como las de una cámara 3D cualquiera. */
function perspectiveLookAt(eye: [number, number, number], target: [number, number, number]): Float32Array {
  const f = 1 / Math.tan(30 * DEG);
  const near = 1;
  const far = 5000;
  const P = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl];
  const up = [0, 0, 1];
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
  const xl = Math.hypot(x[0], x[1], x[2]);
  x = x.map((v) => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const V = [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ];
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

describe("vector del sol", () => {
  it("al sur y a 45° apunta al sur (y positiva) y hacia arriba", () => {
    const v = sunVectorLocal(180 * DEG, 45 * DEG);
    expect(v[0]).toBeCloseTo(0, 6);
    expect(v[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(v[2]).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("al este apunta a x positiva", () => {
    const v = sunVectorLocal(90 * DEG, 30 * DEG);
    expect(v[0] > 0.8).toBe(true);
    expect(Math.abs(v[1]) < 1e-9).toBe(true);
  });
});

describe("cámara del sol", () => {
  const f = { cx: 10, cy: -20, halfWidth: 300, halfDepth: 500 };
  const az = 200 * DEG;
  const alt = 35 * DEG;
  const m = lightMatrix(az, alt, f);

  it("lleva el centro al centro del mapa de sombras", () => {
    const c = transformPoint(m, [10, -20, 0]);
    expect(c[0]).toBeCloseTo(0, 6);
    expect(c[1]).toBeCloseTo(0, 6);
    expect(c[2]).toBeCloseTo(0, 6);
    expect(c[3]).toBe(1);
  });

  it("lo que está hacia el sol queda más cerca (menos profundidad)", () => {
    const s = sunVectorLocal(az, alt);
    const near = transformPoint(m, [10 + s[0] * 50, -20 + s[1] * 50, s[2] * 50]);
    const far = transformPoint(m, [10 - s[0] * 50, -20 - s[1] * 50, -s[2] * 50]);
    expect(near[2] < 0).toBe(true);
    expect(far[2] > 0).toBe(true);
    // Moverse a lo largo del rayo de luz no cambia la posición en el mapa de sombras.
    expect(near[0]).toBeCloseTo(0, 6);
    expect(near[1]).toBeCloseTo(0, 6);
  });

  it("cubre ±halfWidth en el plano perpendicular a la luz", () => {
    const p = transformPoint(m, [10 + 300 * Math.cos(az), -20 + 300 * Math.sin(az), 0]);
    expect(Math.abs(p[0]) <= 1.0001).toBe(true);
  });
});

describe("matrices", () => {
  it("la inversa deshace la matriz", () => {
    const m = perspectiveLookAt([100, 200, 300], [0, 0, 0]);
    const inv = invert4(m)!;
    const p = transformPoint(m, [12, -7, 3]);
    const back = transformPoint(inv, [p[0] / p[3], p[1] / p[3], p[2] / p[3]]);
    expect(back[0] / back[3]).toBeCloseTo(12, 3);
    expect(back[1] / back[3]).toBeCloseTo(-7, 3);
    expect(back[2] / back[3]).toBeCloseTo(3, 3);
  });

  it("recupera la posición de la cámara", () => {
    const eye: [number, number, number] = [120, -340, 260];
    const e = eyeFromMatrix(perspectiveLookAt(eye, [0, 0, 0]))!;
    expect(e[0]).toBeCloseTo(eye[0], 1);
    expect(e[1]).toBeCloseTo(eye[1], 1);
    expect(e[2]).toBeCloseTo(eye[2], 1);
  });
});
