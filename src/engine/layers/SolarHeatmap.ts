import { clamp, lerp, myToLat, smoothstep } from "../../lib/coordinates";
import { SolarGrid, type SolarSample } from "../../lib/solarGrid";
import type { View } from "../../types";

/**
 * SolarHeatmap — «luz sobre el mapa». Pinta la intensidad del sol directo con una escala de color
 * clara y fácil de leer, sin tapar las calles:
 *
 *   sol fuerte   ámbar intenso          (cielo despejado, sol alto)
 *   sol medio    dorado
 *   sol débil    crema pálido           (sol bajo o nubes finas)
 *   nubes        velo gris frío         (las nubes tapan el sol)
 *   sombra       azul (relieve aquí; edificios en ShadowLayer)
 *   noche        sin capa solar
 *
 * Intensidad = luz directa que llega al suelo (relieve × transmisión de las nubes) × factor de
 * elevación del sol (a mediodía pega más fuerte que al atardecer). La escala es perceptual:
 * los tonos cambian de matiz además de opacidad, para distinguir «mucho» de «poco» de un vistazo.
 *
 * El campo de nubes es tan suave como los datos que lo respaldan (celdas de varios km): no se
 * añade textura que sugiera una precisión de calle que no existe.
 */

const CELL = 12;
/** Sombra de relieve: azul profundo. */
const SHADE: [number, number, number] = [36, 46, 96];
/** Distancia máxima sobre el suelo que se pinta (m): evita calcular el horizonte con mucha inclinación. */
const MAX_GROUND_M = 16_000;

/**
 * Escala de color de la intensidad (0-1 → rgba). Paradas: crema pálido → dorado → ámbar → naranja
 * intenso. Opacidades moderadas para que el mapa se siga leyendo.
 */
const RAMP: Array<[number, number, number, number, number]> = [
  // [intensidad, r, g, b, alfa]
  [0.0, 255, 246, 214, 0.0],
  [0.12, 255, 238, 190, 0.1],
  [0.35, 255, 216, 120, 0.2],
  [0.6, 255, 186, 64, 0.3],
  [0.82, 252, 152, 30, 0.38],
  [1.0, 240, 116, 14, 0.44],
];

const OUT = new Float64Array(4);

function ramp(t: number): Float64Array {
  const x = clamp(t, 0, 1);
  let i = 1;
  while (i < RAMP.length - 1 && x > RAMP[i][0]) i++;
  const a = RAMP[i - 1];
  const b = RAMP[i];
  const f = (x - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const s = f * f * (3 - 2 * f);
  OUT[0] = a[1] + (b[1] - a[1]) * s;
  OUT[1] = a[2] + (b[2] - a[2]) * s;
  OUT[2] = a[3] + (b[3] - a[3]) * s;
  OUT[3] = a[4] + (b[4] - a[4]) * s;
  return OUT;
}

/** Fuerza del sol según su elevación: 0,5 en el horizonte, 1 a partir de ~40°. */
export const elevationStrength = (altDeg: number) => 0.5 + 0.5 * smoothstep(2, 40, altDeg);

/** Atenuación de ambiente al atardecer. En plena noche vale 0: sin overlay solar. */
function ambientAlpha(altDeg: number) {
  if (altDeg >= 4) return 0;
  if (altDeg >= -2) return 0.2 * (1 - smoothstep(-2, 4, altDeg));
  return 0.2 * (1 - smoothstep(-2, -10, altDeg));
}

export interface HeatmapOptions {
  /** 0-1 · visibilidad de la capa de nubes (animada al activarla / desactivarla). */
  cloudK: number;
  /** Sin datos meteorológicos el sol no está verificado: la escala se atenúa. */
  weatherAvailable: boolean;
}

export class SolarHeatmap {
  readonly cell = CELL;
  private light = document.createElement("canvas");
  private lightCtx = this.light.getContext("2d")!;
  private clouds = document.createElement("canvas");
  private cloudCtx = this.clouds.getContext("2d")!;
  private lightData: ImageData | null = null;
  private cloudData: ImageData | null = null;
  private cols = 0;
  private rows = 0;
  private sample: SolarSample = { sunlight: 0, shadow: 0, cloudCoverage: 0 };

  /** Calcula las texturas de luz y nubes para la vista y la elevación solar dadas. */
  prepare(v: View, grid: SolarGrid, altDeg: number, opts: HeatmapOptions) {
    const cell = this.cell;
    const cols = Math.ceil(v.w / cell) + 1;
    const rows = Math.ceil(v.h / cell) + 1;
    if (cols !== this.cols || rows !== this.rows || !this.lightData || !this.cloudData) {
      this.cols = cols;
      this.rows = rows;
      this.light.width = cols;
      this.light.height = rows;
      this.clouds.width = cols;
      this.clouds.height = rows;
      this.lightData = this.lightCtx.createImageData(cols, rows);
      this.cloudData = this.cloudCtx.createImageData(cols, rows);
    }

    const dayK = smoothstep(-0.5, 4, altDeg);
    const shadeK = smoothstep(0, 4, altDeg);
    const elev = elevationStrength(altDeg);
    const amb = ambientAlpha(altDeg);
    const nightK = 1 - smoothstep(-6, 1, altDeg);
    const veilDay = smoothstep(-4, 3, altDeg);
    // Sin datos de nubes no se presenta el sol como «fuerte»: tope en dorado.
    const cap = opts.weatherAvailable ? 1 : 0.62;
    const veilMax = lerp(0.5, 0.24, nightK) * veilDay;
    const cloudK = opts.cloudK;

    const L = this.lightData.data;
    const C = this.cloudData.data;
    const Hi = v.Hi;
    const maxD2 = MAX_GROUND_M * v.ppm * (MAX_GROUND_M * v.ppm);
    const s = this.sample;
    let p = 0;

    for (let j = 0; j < rows; j++) {
      const y = (j + 0.5) * cell;
      for (let i = 0; i < cols; i++, p += 4) {
        const x = (i + 0.5) * cell;
        const W = Hi[6] * x + Hi[7] * y + Hi[8];
        let u = 0;
        let vv = 0;
        let visible = W > 1e-6;
        if (visible) {
          u = (Hi[0] * x + Hi[1] * y + Hi[2]) / W;
          vv = (Hi[3] * x + Hi[4] * y + Hi[5]) / W;
          visible = u * u + vv * vv <= maxD2;
        }
        if (!visible) {
          L[p + 3] = 0;
          C[p + 3] = 0;
          continue;
        }

        const lng = (v.cx + u / v.ws) * 360 - 180;
        const lat = myToLat(v.cy + vv / v.ws);
        grid.sample(lng, lat, s);
        const d = s.cloudCoverage * cloudK;

        // Intensidad del sol directo que llega al suelo (0-1).
        const intensity = Math.min(cap, s.sunlight * (1 - d) * elev) * dayK;
        const c = ramp(intensity);
        const wa = c[3];

        // Sombra de relieve (azul) y ambiente del atardecer, bajo el color del sol.
        const nT = s.shadow * 0.38 * shadeK;
        const na = 1 - (1 - nT) * (1 - amb);
        const outA = na + wa * (1 - na);
        if (outA > 0.001) {
          const wk = wa * (1 - na);
          L[p] = (SHADE[0] * na + c[0] * wk) / outA;
          L[p + 1] = (SHADE[1] * na + c[1] * wk) / outA;
          L[p + 2] = (SHADE[2] * na + c[2] * wk) / outA;
          L[p + 3] = outA * 255;
        } else {
          L[p + 3] = 0;
        }

        // Velo de nubes: gris frío, más denso donde las nubes tapan más el sol.
        const core = d * d;
        C[p] = lerp(214, 118, nightK) - 22 * core;
        C[p + 1] = lerp(222, 130, nightK) - 18 * core;
        C[p + 2] = lerp(234, 176, nightK) - 8 * core;
        C[p + 3] = veilMax * smoothstep(0.08, 0.9, d) * 255;
      }
    }

    this.lightCtx.putImageData(this.lightData, 0, 0);
    this.cloudCtx.putImageData(this.cloudData, 0, 0);
  }

  drawLight(ctx: CanvasRenderingContext2D) {
    this.blit(ctx, this.light);
  }

  drawClouds(ctx: CanvasRenderingContext2D) {
    this.blit(ctx, this.clouds);
  }

  private blit(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, this.cols, this.rows, 0, 0, this.cols * this.cell, this.rows * this.cell);
  }
}

/** CSS de la escala (para la leyenda): de sol débil a sol fuerte. */
export const SUN_RAMP_CSS = `linear-gradient(90deg, ${RAMP.slice(1)
  .map(([t, r, g, b, a]) => `rgba(${r},${g},${b},${Math.min(1, a * 2.1)}) ${Math.round(((t - 0.12) / 0.88) * 100)}%`)
  .join(", ")})`;
