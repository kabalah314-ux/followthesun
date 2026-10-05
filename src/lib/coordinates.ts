/**
 * Utilidades de coordenadas: Mercator normalizado, distancias, geometría 2D y
 * homografías (para proyectar el suelo a pantalla con cualquier rotación / inclinación).
 */

export const DEG = Math.PI / 180;
export const EARTH_CIRC = 40075016.686;
const EARTH_R = 6371008.8;

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Smoothstep que admite bordes invertidos (e0 > e1). */
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------ Mercator ------------------------------ */

export const lngToMx = (lng: number) => (lng + 180) / 360;

export const latToMy = (lat: number) => {
  const s = Math.sin(lat * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

export const mxToLng = (mx: number) => mx * 360 - 180;

export const myToLat = (my: number) => {
  const n = Math.PI - 2 * Math.PI * my;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Metros por unidad Mercator normalizada a una latitud dada. */
export const metersPerMercatorUnit = (lat: number) => EARTH_CIRC * Math.cos(lat * DEG);

export function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number) {
  const mx = (lng2 - lng1) * DEG * Math.cos(((lat1 + lat2) / 2) * DEG) * EARTH_R;
  const my = (lat2 - lat1) * DEG * EARTH_R;
  return Math.hypot(mx, my);
}

/* ------------------------------ geometría ------------------------------ */

/** Punto dentro de polígono (ray casting) con coordenadas en arrays paralelos. */
export function pointInPolygon(
  x: number,
  y: number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>
) {
  let inside = false;
  const n = xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xs[i];
    const yi = ys[i];
    const xj = xs[j];
    const yj = ys[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punto dentro de un anillo GeoJSON [lng, lat][]. */
export function pointInRing(lng: number, lat: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia de un punto a la recta que pasa por a→b (coordenadas planas). */
export function distanceToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

/* ------------------------------ homografías ------------------------------ */

/**
 * Homografía 3×3 (h8 = 1) que lleva `src` a `dst` a partir de 4 correspondencias.
 * El suelo plano de un mapa visto con cualquier rotación e inclinación es exactamente
 * una homografía, así que es la forma más barata y precisa de proyectar geometría.
 */
export function solveHomography(src: number[][], dst: number[][]): Float64Array | null {
  let S = 1;
  for (let i = 0; i < 4; i++) {
    S = Math.max(S, Math.abs(src[i][0]), Math.abs(src[i][1]), Math.abs(dst[i][0]), Math.abs(dst[i][1]));
  }
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = src[i][0] / S;
    const v = src[i][1] / S;
    const x = dst[i][0] / S;
    const y = dst[i][1] / S;
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }

  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    if (p !== c) {
      const t = A[c];
      A[c] = A[p];
      A[p] = t;
    }
    const piv = A[c][c];
    for (let k = c; k < 9; k++) A[c][k] /= piv;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f === 0) continue;
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }

  const H = new Float64Array(9);
  for (let i = 0; i < 8; i++) H[i] = A[i][8];
  H[8] = 1;
  // Deshacer la normalización (escala uniforme).
  H[2] *= S;
  H[5] *= S;
  H[6] /= S;
  H[7] /= S;
  return H;
}

export function invert3(m: ArrayLike<number>): Float64Array | null {
  const a = m[0], b = m[1], c = m[2];
  const d = m[3], e = m[4], f = m[5];
  const g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const id = 1 / det;
  return Float64Array.of(
    A * id,
    -(b * i - c * h) * id,
    (b * f - c * e) * id,
    B * id,
    (a * i - c * g) * id,
    -(a * f - c * d) * id,
    C * id,
    -(a * h - b * g) * id,
    (a * e - b * d) * id
  );
}
