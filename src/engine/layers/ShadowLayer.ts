import type { BuildingSet } from "../../services/buildingService";
import { SHADOW_MAX_LENGTH_M, SHADOW_MIN_ALTITUDE } from "../../services/shadowService";
import type { View } from "../../types";

/**
 * ShadowLayer — dibuja la máscara de sombras de los edificios sobre el suelo.
 *
 * Cada edificio proyecta su sombra a lo largo del vector solar inverso (L = h / tan(altitud)).
 * La geometría se transforma con la homografía de la vista, así que las sombras quedan
 * correctas con cualquier rotación e inclinación del mapa. Los tejados se "recortan" de la
 * sombra de cada clase de altura para que sigan iluminados.
 *
 * El resultado es una máscara opaca (`canvas`); la capa que la compone decide cómo teñirla.
 */

/** Sombra urbana: gris azulado neutro (no compite con el tono cálido ni con el velo de nubes). */
const SHADOW_COLOR = "#2f3450";

export class ShadowLayer {
  readonly canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private UU = new Float64Array(512);
  private VV = new Float64Array(512);
  private PX = new Float64Array(512);
  private PY = new Float64Array(512);
  private TX = new Float64Array(512);
  private TY = new Float64Array(512);

  /** Dibuja las sombras para el sol dado. Devuelve cuántos edificios aportaron sombra. */
  render(v: View, set: BuildingSet, azimuth: number, altitude: number): number {
    const w = Math.max(1, Math.round(v.w));
    const h = Math.max(1, Math.round(v.h));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);

    const { H, cx, cy, ws, ppm, bounds } = v;
    const H0 = H[0], H1 = H[1], H2 = H[2], H3 = H[3], H4 = H[4], H5 = H[5], H6 = H[6], H7 = H[7];

    // Píxeles planos de sombra por metro de altura (ejes u = este, v = sur).
    const k = ppm / Math.tan(Math.max(altitude, SHADOW_MIN_ALTITUDE));
    const kx = -Math.sin(azimuth) * k;
    const ky = Math.cos(azimuth) * k;
    const maxPx = SHADOW_MAX_LENGTH_M * ppm;
    const { coords, offsets, heights, bbox, buckets } = set;
    let drawn = 0;

    ctx.fillStyle = SHADOW_COLOR;

    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      const shadow = new Path2D();
      const roofs = new Path2D();
      let any = false;

      for (let li = 0; li < list.length; li++) {
        const i = list[li];
        let su = kx * heights[i];
        let sv = ky * heights[i];
        const len = Math.hypot(su, sv);
        if (len > maxPx) {
          const sc = maxPx / len;
          su *= sc;
          sv *= sc;
        }

        // Descarte rápido en coordenadas Mercator (edificio + su sombra fuera de la vista).
        const smx = su / ws;
        const smy = sv / ws;
        const b0x = bbox[4 * i];
        const b0y = bbox[4 * i + 1];
        const b1x = bbox[4 * i + 2];
        const b1y = bbox[4 * i + 3];
        if (
          Math.max(b1x, b1x + smx) < bounds.minX ||
          Math.min(b0x, b0x + smx) > bounds.maxX ||
          Math.max(b1y, b1y + smy) < bounds.minY ||
          Math.min(b0y, b0y + smy) > bounds.maxY
        )
          continue;

        const o = offsets[i];
        const n = offsets[i + 1] - o;
        if (n > this.UU.length) {
          const size = n * 2;
          this.UU = new Float64Array(size);
          this.VV = new Float64Array(size);
          this.PX = new Float64Array(size);
          this.PY = new Float64Array(size);
          this.TX = new Float64Array(size);
          this.TY = new Float64Array(size);
        }
        const { UU, VV, PX, PY, TX, TY } = this;

        let ok = true;
        for (let p = 0; p < n; p++) {
          const u = (coords[2 * (o + p)] - cx) * ws;
          const vv = (coords[2 * (o + p) + 1] - cy) * ws;
          UU[p] = u;
          VV[p] = vv;
          const d = H6 * u + H7 * vv + 1;
          const u2 = u + su;
          const v2 = vv + sv;
          const d2 = H6 * u2 + H7 * v2 + 1;
          if (d < 0.05 || d2 < 0.05) {
            ok = false;
            break;
          }
          PX[p] = (H0 * u + H1 * vv + H2) / d;
          PY[p] = (H3 * u + H4 * vv + H5) / d;
          TX[p] = (H0 * u2 + H1 * v2 + H2) / d2;
          TY[p] = (H3 * u2 + H4 * v2 + H5) / d2;
        }
        if (!ok) continue;

        roofs.moveTo(PX[0], PY[0]);
        for (let p = 1; p < n; p++) roofs.lineTo(PX[p], PY[p]);
        roofs.closePath();

        // Solo las aristas "de espaldas" al sol generan sombra hacia fuera del edificio.
        for (let p = 0; p < n; p++) {
          const p2 = p + 1 === n ? 0 : p + 1;
          const ex = UU[p2] - UU[p];
          const ey = VV[p2] - VV[p];
          if (ey * su - ex * sv > 0) {
            shadow.moveTo(PX[p], PY[p]);
            shadow.lineTo(TX[p], TY[p]);
            shadow.lineTo(TX[p2], TY[p2]);
            shadow.lineTo(PX[p2], PY[p2]);
            shadow.closePath();
          }
        }
        any = true;
        drawn++;
      }

      if (any) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fill(shadow);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill(roofs);
      }
    }

    ctx.globalCompositeOperation = "source-over";
    return drawn;
  }
}
