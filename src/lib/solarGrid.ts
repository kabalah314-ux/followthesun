import type { GeoBounds, SolarPoint } from "../types";

/**
 * SolarGrid — rejilla regular de datos solares (el formato que consume la capa de calor).
 *
 * Cualquier fuente (simulada, API real, resultado de un cálculo de sombras…) puede rellenarla:
 *  · directamente, escribiendo en `sunlight`, `shadow` y `cloud`
 *  · o con una lista de `SolarPoint` dispersos mediante `setPoints()`
 */

export interface SolarSample {
  /** Fracción de luz solar directa que llega al suelo (0-1), sin contar la elevación del sol. */
  sunlight: number;
  /** Fracción de sombra (0-1) por relieve o edificios. */
  shadow: number;
  /** Densidad de nubes (0-1). */
  cloudCoverage: number;
}

export class SolarGrid {
  readonly bounds: GeoBounds;
  readonly cols: number;
  readonly rows: number;
  readonly sunlight: Float32Array;
  readonly shadow: Float32Array;
  readonly cloud: Float32Array;

  constructor(bounds: GeoBounds, cols: number, rows: number) {
    this.bounds = bounds;
    this.cols = cols;
    this.rows = rows;
    this.sunlight = new Float32Array(cols * rows);
    this.shadow = new Float32Array(cols * rows);
    this.cloud = new Float32Array(cols * rows);
  }

  lngAt(i: number) {
    const b = this.bounds;
    return b.west + (i / (this.cols - 1)) * (b.east - b.west);
  }

  latAt(j: number) {
    const b = this.bounds;
    return b.south + (j / (this.rows - 1)) * (b.north - b.south);
  }

  /** Muestra bilinear; fuera de los límites devuelve el valor del borde más cercano. */
  sample(lng: number, lat: number, out: SolarSample): SolarSample {
    const b = this.bounds;
    const maxX = this.cols - 1.0001;
    const maxY = this.rows - 1.0001;
    let gx = ((lng - b.west) / (b.east - b.west)) * (this.cols - 1);
    let gy = ((lat - b.south) / (b.north - b.south)) * (this.rows - 1);
    gx = gx < 0 ? 0 : gx > maxX ? maxX : gx;
    gy = gy < 0 ? 0 : gy > maxY ? maxY : gy;
    const i = gx | 0;
    const j = gy | 0;
    const fx = gx - i;
    const fy = gy - j;
    const k00 = j * this.cols + i;
    const k10 = k00 + 1;
    const k01 = k00 + this.cols;
    const k11 = k01 + 1;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    out.sunlight =
      this.sunlight[k00] * w00 + this.sunlight[k10] * w10 + this.sunlight[k01] * w01 + this.sunlight[k11] * w11;
    out.shadow =
      this.shadow[k00] * w00 + this.shadow[k10] * w10 + this.shadow[k01] * w01 + this.shadow[k11] * w11;
    out.cloudCoverage =
      this.cloud[k00] * w00 + this.cloud[k10] * w10 + this.cloud[k01] * w01 + this.cloud[k11] * w11;
    return out;
  }

  clear() {
    this.sunlight.fill(0);
    this.shadow.fill(0);
    this.cloud.fill(0);
  }

  /**
   * Rellena la rejilla con puntos dispersos: promedia los puntos de cada celda y
   * propaga a las celdas vacías hasta cubrir toda la rejilla.
   */
  setPoints(points: SolarPoint[]) {
    const { cols, rows, bounds: b } = this;
    const n = cols * rows;
    const count = new Uint16Array(n);
    const sl = new Float32Array(n);
    const sh = new Float32Array(n);
    const cl = new Float32Array(n);

    for (const p of points) {
      const gx = Math.round(((p.longitude - b.west) / (b.east - b.west)) * (cols - 1));
      const gy = Math.round(((p.latitude - b.south) / (b.north - b.south)) * (rows - 1));
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      const k = gy * cols + gx;
      count[k]++;
      sl[k] += p.sunlight;
      sh[k] += p.shadow;
      cl[k] += p.cloudCoverage;
    }

    const filled = new Uint8Array(n);
    let remaining = 0;
    for (let k = 0; k < n; k++) {
      if (count[k] > 0) {
        this.sunlight[k] = sl[k] / count[k];
        this.shadow[k] = sh[k] / count[k];
        this.cloud[k] = cl[k] / count[k];
        filled[k] = 1;
      } else {
        remaining++;
      }
    }
    if (remaining === n) {
      this.clear();
      return;
    }

    // Propagación por vecinos (dilatación) hasta llenar la rejilla.
    for (let pass = 0; pass < cols + rows && remaining > 0; pass++) {
      const next = filled.slice();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          if (filled[k]) continue;
          let c = 0;
          let a = 0;
          let s = 0;
          let d = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ii = i + di;
              const jj = j + dj;
              if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
              const kk = jj * cols + ii;
              if (!filled[kk]) continue;
              c++;
              a += this.sunlight[kk];
              s += this.shadow[kk];
              d += this.cloud[kk];
            }
          }
          if (c > 0) {
            this.sunlight[k] = a / c;
            this.shadow[k] = s / c;
            this.cloud[k] = d / c;
            next[k] = 1;
            remaining--;
          }
        }
      }
      filled.set(next);
    }
  }
}
