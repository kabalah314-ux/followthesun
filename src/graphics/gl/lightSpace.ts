/**
 * Geometría de la luz para el mapa de sombras (calidad Alta) — pura y probada.
 *
 * Marco local de la capa solar: metros desde un origen, x = este, y = SUR (como Mercator),
 * z = arriba. El sol está en (azimut desde el norte, en sentido horario; altitud).
 */

export type Vec3 = [number, number, number];

/** Vector unitario hacia el sol en el marco local (x este, y sur, z arriba). */
export function sunVectorLocal(azimuth: number, altitude: number): Vec3 {
  const c = Math.cos(altitude);
  return [Math.sin(azimuth) * c, -Math.cos(azimuth) * c, Math.sin(altitude)];
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface LightFrustum {
  /** Centro en el suelo (m locales). */
  cx: number;
  cy: number;
  /** Semiancho de la proyección ortográfica perpendicular a la luz (m). */
  halfWidth: number;
  /** Semiprofundidad a lo largo de la luz (m). */
  halfDepth: number;
}

/**
 * Matriz (column-major) local → recorte de la «cámara del sol»: ortográfica, mirando en la
 * dirección en la que viaja la luz. La profundidad crece al alejarse del sol, así que la prueba
 * de profundidad LESS se queda con lo más cercano al sol (lo que proyecta la sombra).
 */
export function lightMatrix(azimuth: number, altitude: number, f: LightFrustum, out = new Float32Array(16)): Float32Array {
  const toSun = sunVectorLocal(azimuth, altitude);
  const fwd: Vec3 = [-toSun[0], -toSun[1], -toSun[2]];
  // «Arriba» del mundo: el sol de Barcelona nunca pasa de ~73°, así que nunca es paralelo.
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  const c: Vec3 = [f.cx, f.cy, 0];
  const rows: Array<[Vec3, number]> = [
    [right, f.halfWidth],
    [up, f.halfWidth],
    [fwd, f.halfDepth],
  ];
  for (let r = 0; r < 3; r++) {
    const [axis, scale] = rows[r];
    out[r] = axis[0] / scale;
    out[4 + r] = axis[1] / scale;
    out[8 + r] = axis[2] / scale;
    out[12 + r] = -dot(axis, c) / scale;
  }
  out[3] = 0;
  out[7] = 0;
  out[11] = 0;
  out[15] = 1;
  return out;
}

/** Aplica una matriz column-major a un punto (w = 1). */
export function transformPoint(m: ArrayLike<number>, p: Vec3): [number, number, number, number] {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

/** Inversa de una matriz 4×4 column-major (o null si es singular). */
export function invert4(m: ArrayLike<number>, out = new Float64Array(16)): Float64Array | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det || !Number.isFinite(det)) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/** Posición de la cámara (marco local) a partir de su matriz local → recorte en perspectiva. */
export function eyeFromMatrix(m: ArrayLike<number>): Vec3 | null {
  const inv = invert4(m);
  if (!inv) return null;
  // El ojo es el punto que la proyección lleva a (0, 0, z, 0).
  const q = transformPoint(inv, [0, 0, 1]);
  // transformPoint suma la columna de traslación (w = 1): se quita para (0, 0, 1, 0).
  const x = q[0] - inv[12];
  const y = q[1] - inv[13];
  const z = q[2] - inv[14];
  const w = q[3] - inv[15];
  if (Math.abs(w) < 1e-12) return null;
  return [x / w, y / w, z / w];
}
