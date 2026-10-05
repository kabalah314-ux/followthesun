import { lerp, myToLat, smoothstep } from "../../lib/coordinates";
import { SolarGrid, type SolarSample } from "../../lib/solarGrid";
import { sunlightTint } from "../../lib/solarTint";
import type { View } from "../../types";

/**
 * SolarHeatmap — "luz sobre el mapa". Pinta una `SolarGrid` sobre el suelo del mapa.
 *
 * Genera dos texturas de baja resolución, alineadas con la pantalla pero muestreadas sobre el
 * suelo real (con rotación e inclinación), que luego se escalan con suavizado:
 *   · luz   → tinte cálido donde llega sol directo + sombra neutra de relieve
 *   · nubes → velo suave y apagado, proporcional a lo que las nubes bloquean del haz directo
 *
 * Estados (siempre sutiles, pero con diferencia legible a primera vista):
 *   DIRECT SUN        ámbar más intenso donde la luz efectiva es alta
 *   PARTIAL/UNCERTAIN oro pálido donde la luz efectiva es menor
 *   CLOUD COVER       velo frío y traslúcido
 *   URBAN SHADOW      sombra neutra (la dibuja ShadowLayer, a resolución de calle)
 *   NIGHT             sin overlay solar
 *
 * No añade ruido sintético: el campo de nubes es tan suave como los datos que lo respaldan
 * (celdas de varios km), para no fingir una precisión que no existe.
 */

const CELL = 14;
/** Sombra de relieve: azul noche neutro; distingue la sombra sin tapar las calles. */
const SHADE: [number, number, number] = [39, 48, 82];
/** Distancia máxima sobre el suelo que se pinta (m): evita calcular el horizonte con mucha inclinación. */
const MAX_GROUND_M = 16_000;

/** Atenuación de ambiente al atardecer. En plena noche vale 0: sin overlay solar. */
function ambientAlpha(altDeg: number) {
  if (altDeg >= 4) return 0;
  if (altDeg >= -2) return 0.2 * (1 - smoothstep(-2, 4, altDeg));
  return 0.2 * (1 - smoothstep(-2, -10, altDeg));
}

export interface HeatmapOptions {
  /** 0-1 · visibilidad de la capa de nubes (animada al activarla / desactivarla). */
  cloudK: number;
  /** Sin datos meteorológicos el sol no está verificado: la calidez se atenúa. */
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

    const dayK = smoothstep(-0.5, 9, altDeg);
    const shadeK = smoothstep(0, 4, altDeg);
    const amb = ambientAlpha(altDeg);
    const nightK = 1 - smoothstep(-6, 1, altDeg);
    const veilDay = smoothstep(-4, 3, altDeg);
    const veilMax = lerp(0.35, 0.22, nightK) * veilDay;
    const cr0 = lerp(232, 120, nightK);
    const cg0 = lerp(234, 132, nightK);
    const cb0 = lerp(240, 178, nightK);
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

        // Distingue los valores de luz efectivos con un gradiente cálido graduado:
        // poca luz → oro pálido; luz directa alta → ámbar más visible.
        const effectiveDirect = s.sunlight * (1 - d);
        const tint = sunlightTint(effectiveDirect, dayK, opts.weatherAvailable);
        const [wr, wg, wb] = tint.rgb;
        const wa = tint.opacity;

        // La sombra topográfica también gana definición respecto al cielo despejado.
        const nT = s.shadow * 0.4 * shadeK;
        const na = 1 - (1 - nT) * (1 - amb);
        const outA = na + wa * (1 - na);
        if (outA > 0.001) {
          const wk = wa * (1 - na);
          L[p] = (SHADE[0] * na + wr * wk) / outA;
          L[p + 1] = (SHADE[1] * na + wg * wk) / outA;
          L[p + 2] = (SHADE[2] * na + wb * wk) / outA;
          L[p + 3] = outA * 255;
        } else {
          L[p + 3] = 0;
        }

        // Velo de nubes: apaga ligeramente; algo más denso en el núcleo, siempre translúcido.
        const core = d * d;
        C[p] = cr0 - 20 * core;
        C[p + 1] = cg0 - 18 * core;
        C[p + 2] = cb0 - 12 * core;
        C[p + 3] = veilMax * d * 255;
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
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(src, 0, 0, this.cols, this.rows, 0, 0, this.cols * this.cell, this.rows * this.cell);
  }
}
