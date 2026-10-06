import type { BuildingSet } from "../../services/buildingService";
import { SHADOW_MAX_LENGTH_M, SHADOW_MIN_ALTITUDE } from "../../services/shadowService";
import type { View } from "../../types";

/**
 * ShadowLayer — sombras de los edificios sobre el suelo y, con el relieve 3D activo, sus siluetas.
 *
 * Cada edificio proyecta su sombra a lo largo del vector solar inverso (L = h / tan(altitud)).
 * La geometría se transforma con la homografía de la vista, así que las sombras quedan correctas
 * con cualquier rotación e inclinación del mapa.
 *
 *  · 2D (vista cenital): se recortan de la sombra los tejados (huella en el suelo) para que sigan al sol.
 *  · 3D (al acercarse): cada edificio se levanta a su altura con la cámara real del mapa
 *    (`View.camera`) y se recorta su SILUETA completa (base + fachadas + tejado). Así las sombras
 *    no pintan las fachadas de su propio edificio, y el mapa ilumina las fachadas con la luz del sol.
 *    Las clases de altura se procesan de menor a mayor: la sombra de un edificio alto sí cae sobre
 *    los más bajos de su alrededor.
 *
 * Produce dos máscaras opacas: `canvas` (sombras) y `silhouettes` (edificios en 3D).
 */

const SHADOW_COLOR = "#22295a";
const SIL_COLOR = "#000";

export interface ShadowRenderOptions {
  /** Dibujar las sombras (si no, solo siluetas). */
  shadows: boolean;
  /** 0-1 · cuánto se levantan los edificios (0 = 2D). Coincide con la transición del mapa. */
  extrudeK: number;
}

export class ShadowLayer {
  readonly canvas = document.createElement("canvas");
  readonly silhouettes = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private sctx = this.silhouettes.getContext("2d")!;
  private UU = new Float64Array(512);
  private VV = new Float64Array(512);
  private PX = new Float64Array(512);
  private PY = new Float64Array(512);
  private TX = new Float64Array(512);
  private TY = new Float64Array(512);
  private RX = new Float64Array(512);
  private RY = new Float64Array(512);
  /** Hubo siluetas en el último dibujo. */
  silhouettesActive = false;

  private ensure(n: number) {
    if (n <= this.UU.length) return;
    const size = n * 2;
    this.UU = new Float64Array(size);
    this.VV = new Float64Array(size);
    this.PX = new Float64Array(size);
    this.PY = new Float64Array(size);
    this.TX = new Float64Array(size);
    this.TY = new Float64Array(size);
    this.RX = new Float64Array(size);
    this.RY = new Float64Array(size);
  }

  private resize(c: HTMLCanvasElement, w: number, h: number) {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  /** Dibuja sombras y/o siluetas. Devuelve cuántos edificios se procesaron. */
  render(v: View, set: BuildingSet, azimuth: number, altitude: number, opts: ShadowRenderOptions): number {
    const w = Math.max(1, Math.round(v.w));
    const h = Math.max(1, Math.round(v.h));
    const cam = v.camera;
    const extrude = opts.extrudeK > 0.01 && cam !== null;
    this.silhouettesActive = extrude;

    this.resize(this.canvas, w, h);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = SHADOW_COLOR;

    const sctx = this.sctx;
    if (extrude) {
      this.resize(this.silhouettes, w, h);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = SIL_COLOR;
    }

    const { H, cx, cy, ws, ppm, bounds } = v;
    const H0 = H[0], H1 = H[1], H2 = H[2], H3 = H[3], H4 = H[4], H5 = H[5], H6 = H[6], H7 = H[7];

    // Píxeles planos de sombra por metro de altura (ejes u = este, v = sur).
    const k = ppm / Math.tan(Math.max(altitude, SHADOW_MIN_ALTITUDE));
    const kx = -Math.sin(azimuth) * k;
    const ky = Math.cos(azimuth) * k;
    const maxPx = SHADOW_MAX_LENGTH_M * ppm;
    const { coords, offsets, heights, renderHeights, bbox, buckets } = set;
    const camX = cam ? cam.x : 0;
    const camY = cam ? cam.y : 0;
    const camZ = cam ? cam.z : 1;
    let drawn = 0;

    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      const shadow = new Path2D();
      const cut = new Path2D();
      let any = false;

      for (let li = 0; li < list.length; li++) {
        const i = list[li];
        let su = opts.shadows ? kx * heights[i] : 0;
        let sv = opts.shadows ? ky * heights[i] : 0;
        const len = Math.hypot(su, sv);
        if (len > maxPx) {
          const sc = maxPx / len;
          su *= sc;
          sv *= sc;
        }

        // Descarte rápido (edificio + sombra fuera de la vista). En 3D, margen por la altura.
        const smx = su / ws;
        const smy = sv / ws;
        const pad = extrude ? (renderHeights[i] * ppm * 1.5) / ws : 0;
        const b0x = bbox[4 * i];
        const b0y = bbox[4 * i + 1];
        const b1x = bbox[4 * i + 2];
        const b1y = bbox[4 * i + 3];
        if (
          Math.max(b1x, b1x + smx) + pad < bounds.minX ||
          Math.min(b0x, b0x + smx) - pad > bounds.maxX ||
          Math.max(b1y, b1y + smy) + pad < bounds.minY ||
          Math.min(b0y, b0y + smy) - pad > bounds.maxY
        )
          continue;

        const o = offsets[i];
        const n = offsets[i + 1] - o;
        this.ensure(n);
        const { UU, VV, PX, PY, TX, TY, RX, RY } = this;

        // Altura visual en píxeles (la misma que el mapa: crece con la transición de zoom).
        const hpx = extrude ? renderHeights[i] * ppm * opts.extrudeK : 0;
        const kr = extrude ? camZ / Math.max(1e-6, camZ - hpx) : 1;
        const roofOk = extrude && camZ - hpx > camZ * 0.05;

        let ok = true;
        for (let p = 0; p < n; p++) {
          const u = (coords[2 * (o + p)] - cx) * ws;
          const vv = (coords[2 * (o + p) + 1] - cy) * ws;
          UU[p] = u;
          VV[p] = vv;
          const d = H6 * u + H7 * vv + 1;
          if (d < 0.05) {
            ok = false;
            break;
          }
          PX[p] = (H0 * u + H1 * vv + H2) / d;
          PY[p] = (H3 * u + H4 * vv + H5) / d;

          if (opts.shadows) {
            const u2 = u + su;
            const v2 = vv + sv;
            const d2 = H6 * u2 + H7 * v2 + 1;
            if (d2 < 0.05) {
              ok = false;
              break;
            }
            TX[p] = (H0 * u2 + H1 * v2 + H2) / d2;
            TY[p] = (H3 * u2 + H4 * v2 + H5) / d2;
          }

          if (roofOk) {
            // Punto del tejado: corte del rayo cámara→tejado con el suelo, y homografía.
            const qu = camX + (u - camX) * kr;
            const qv = camY + (vv - camY) * kr;
            const dq = H6 * qu + H7 * qv + 1;
            if (dq < 0.05) {
              ok = false;
              break;
            }
            RX[p] = (H0 * qu + H1 * qv + H2) / dq;
            RY[p] = (H3 * qu + H4 * qv + H5) / dq;
          }
        }
        if (!ok) continue;

        // Recorte: en 2D la huella; en 3D la silueta (huella + tejado + fachadas).
        addPolygon(cut, PX, PY, n);
        if (roofOk) {
          addPolygon(cut, RX, RY, n);
          for (let p = 0; p < n; p++) {
            const p2 = p + 1 === n ? 0 : p + 1;
            addQuad(cut, PX[p], PY[p], PX[p2], PY[p2], RX[p2], RY[p2], RX[p], RY[p]);
          }
        }

        // Solo las aristas "de espaldas" al sol generan sombra hacia fuera del edificio.
        if (opts.shadows) {
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
        }
        any = true;
        drawn++;
      }

      if (!any) continue;
      if (opts.shadows) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fill(shadow);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill(cut);
      }
      if (extrude) sctx.fill(cut);
    }

    ctx.globalCompositeOperation = "source-over";
    return drawn;
  }
}

/** Polígono con orientación positiva en pantalla (para que la regla nonzero los una sin huecos). */
function addPolygon(path: Path2D, xs: Float64Array, ys: Float64Array, n: number) {
  let area = 0;
  for (let p = 0; p < n; p++) {
    const p2 = p + 1 === n ? 0 : p + 1;
    area += xs[p] * ys[p2] - xs[p2] * ys[p];
  }
  if (Math.abs(area) < 0.01) return;
  if (area > 0) {
    path.moveTo(xs[0], ys[0]);
    for (let p = 1; p < n; p++) path.lineTo(xs[p], ys[p]);
  } else {
    path.moveTo(xs[n - 1], ys[n - 1]);
    for (let p = n - 2; p >= 0; p--) path.lineTo(xs[p], ys[p]);
  }
  path.closePath();
}

function addQuad(
  path: Path2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
) {
  const area = (ax * by - bx * ay) + (bx * cy - cx * by) + (cx * dy - dx * cy) + (dx * ay - ax * dy);
  if (Math.abs(area) < 0.01) return;
  if (area > 0) {
    path.moveTo(ax, ay);
    path.lineTo(bx, by);
    path.lineTo(cx, cy);
    path.lineTo(dx, dy);
  } else {
    path.moveTo(dx, dy);
    path.lineTo(cx, cy);
    path.lineTo(bx, by);
    path.lineTo(ax, ay);
  }
  path.closePath();
}
