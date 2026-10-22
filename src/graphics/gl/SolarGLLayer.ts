import { BUILDINGS_3D, GRAPHICS } from "../../config";
import { buildRampLut, type LightParams } from "../../engine/layers/SolarHeatmap";
import { clamp, latToMy, lngToMx, metersPerMercatorUnit, smoothstep } from "../../lib/coordinates";
import type { SolarGrid } from "../../lib/solarGrid";
import { SHADOW_MAX_LENGTH_M, SHADOW_MIN_ALTITUDE } from "../../services/shadowService";
import type { Theme } from "../../types";
import type { QualitySettings } from "../quality";
import { ROOF_EDGE_STRIDE, SHADOW_VERTEX_STRIDE, type ShadowGeometry } from "../shadowGeometry";
import {
  createProgram,
  createRenderTarget,
  createTexture,
  deleteRenderTarget,
  GLError,
  localToClipMatrix,
  resolveRenderTarget,
  uploadRGBA,
  type Program,
  type RenderTarget,
} from "./glUtils";
import * as SH from "./shaders";

/**
 * SolarGLLayer — la luz del sol y las sombras, dibujadas DENTRO del mapa (MapLibre
 * `CustomLayerInterface`, WebGL2) en lugar de en un canvas encima.
 *
 *   prerender  máscara de sombras de edificios en un framebuffer propio (MSAA en Alta): la
 *              geometría está en la GPU y el sol entra como uniform → mover la hora no recalcula nada.
 *   render     suelo: campo de luz bicúbico + sombra de relieve + sombras con penumbra física +
 *              tono pizarra + sombra de contacto + velo de nubes. Va justo DEBAJO de los edificios
 *              3D y de las etiquetas: los edificios tapan su suelo (las sombras no pintan fachadas)
 *              y los textos quedan limpios.
 *   roofLayer  segunda capa (3D, con profundidad) para las aristas de tejado nítidas.
 *
 * Todo lo que depende del zoom (aparición de sombras, tono, altura 3D) se calcula aquí al
 * dibujar; el motor solo entrega el estado del sol y de las capas (`setFrame`).
 * Cualquier fallo de WebGL llama a `onError` y la capa deja de dibujar: el motor pasa al canvas.
 */

export const SOLAR_GL_LAYER_ID = "fts-solar-gl";
export const ROOF_EDGES_LAYER_ID = "fts-roof-edges";

/** Radio máximo dibujado alrededor del centro de la vista (m), como el canvas. */
const MAX_GROUND_M = 16_000;
const SHADOW_TONE = GRAPHICS.shadowTone;

/** Estado que decide el motor (no depende de la cámara). */
export interface SolarGLFrame {
  /** Sol: azimut desde el norte (horario) y altitud, en radianes. */
  azimuth: number;
  altitude: number;
  light: LightParams;
  /** Visibilidad del velo de nubes (0-1, animada). */
  cloudK: number;
  /** Sombras de edificios: interruptor animado × fuerza según el sol (sin el factor de zoom). */
  shadowsK: number;
  /** Edificios en 3D al acercarse. */
  buildings3D: boolean;
  theme: Theme;
  /** Aparición al cargar (0-1): la luz entra suave, como en el canvas. */
  opacity: number;
}

export interface SolarGLStats {
  /** Cobertura de sombra 0-255 por celda, filas de ARRIBA abajo. */
  data: Uint8Array;
  cols: number;
  rows: number;
}

export interface SolarGLLayerOptions {
  settings: QualitySettings;
  /** WebGL no pudo con la capa (shader, framebuffer…): el motor debe pasar al canvas. */
  onError(error: unknown): void;
}

interface GLMap {
  getZoom(): number;
  getCenter(): { lng: number; lat: number };
  getContainer(): HTMLElement;
  getCanvas(): HTMLCanvasElement;
  unproject(p: [number, number]): { lng: number; lat: number };
  triggerRepaint?(): void;
}

interface Resources {
  gl: WebGL2RenderingContext;
  mask: Program;
  ground: Program;
  roof: Program;
  stats: Program;
  geomVao: WebGLVertexArrayObject;
  geomVbo: WebGLBuffer;
  geomIbo: WebGLBuffer;
  groundVao: WebGLVertexArrayObject;
  groundVbo: WebGLBuffer;
  roofVao: WebGLVertexArrayObject;
  roofCornerVbo: WebGLBuffer;
  roofEdgeVbo: WebGLBuffer;
  emptyVao: WebGLVertexArrayObject;
  fieldTex: WebGLTexture;
  rampTex: WebGLTexture;
  emptyTex: WebGLTexture;
  statsPbo: WebGLBuffer;
  maskTarget: RenderTarget | null;
  statsTarget: RenderTarget | null;
}

const MASK_UNIFORMS = ["u_matrix", "u_dir", "u_perMeter", "u_maxLen", "u_value"] as const;
const GROUND_UNIFORMS = [
  "u_matrix",
  "u_origin",
  "u_radius",
  "u_field",
  "u_fieldBox",
  "u_fieldSize",
  "u_smooth",
  "u_ramp",
  "u_light",
  "u_light2",
  "u_mask",
  "u_buf",
  "u_bFade",
  "u_tone",
  "u_pen",
  "u_maxDist",
  "u_contact",
  "u_mode",
  "u_opacity",
] as const;
const ROOF_UNIFORMS = ["u_matrix", "u_extrude", "u_viewport", "u_halfWidth", "u_bias", "u_color"] as const;
const STATS_UNIFORMS = ["u_mask", "u_out"] as const;

/** La matriz Mercator → recorte que entrega el mapa (MapLibre 5, MapLibre 4 / Mapbox). */
function mainMatrixOf(args: unknown): ArrayLike<number> | null {
  if (!args) return null;
  if (Array.isArray(args) || ArrayBuffer.isView(args)) return args as ArrayLike<number>;
  const a = args as {
    defaultProjectionData?: { mainMatrix?: ArrayLike<number> };
    modelViewProjectionMatrix?: ArrayLike<number>;
  };
  return a.defaultProjectionData?.mainMatrix ?? a.modelViewProjectionMatrix ?? null;
}

/** Factores que dependen del zoom (los mismos que usaba el canvas). */
export function zoomFactors(zoom: number, buildings3D: boolean) {
  return {
    /** Las sombras aparecen enteras desde el zoom inicial del móvil (13,2). */
    shadowZoomFade: smoothstep(12.2, 13.0, zoom),
    /** Tono pizarra: se refuerza en «calle» y un poco más en «terraza». */
    toneAlpha:
      SHADOW_TONE.base + SHADOW_TONE.calle * smoothstep(14, 16, zoom) + SHADOW_TONE.terraza * smoothstep(17, 19, zoom),
    /** Altura 3D: misma interpolación lineal que la extrusión del mapa. */
    extrudeK: buildings3D
      ? clamp((zoom - BUILDINGS_3D.fromZoom) / (BUILDINGS_3D.fullZoom - BUILDINGS_3D.fromZoom), 0, 1)
      : 0,
  };
}

export class SolarGLLayer {
  readonly id = SOLAR_GL_LAYER_ID;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;
  readonly roofLayer: RoofEdgesLayer;

  private map: GLMap | null = null;
  private res: Resources | null = null;
  private failed = false;
  private settings: QualitySettings;
  private onError: (e: unknown) => void;

  private frame: SolarGLFrame | null = null;
  private geometry: ShadowGeometry | null = null;
  private uploaded: ShadowGeometry | null = null;
  private field: { data: Uint8Array; cols: number; rows: number; box: [number, number, number, number] } | null =
    null;
  private fieldVersion = -1;
  private fieldUploaded = -1;
  private rampUploaded = false;

  private maskKey = "";
  private maskActive = false;
  private lastShadowFade = 0;

  private statsReq: { cols: number; rows: number } | null = null;
  private statsPending: { sync: WebGLSync; cols: number; rows: number } | null = null;
  private statsResult: SolarGLStats | null = null;

  private matGeom = new Float32Array(16);
  private matGround = new Float32Array(16);
  private groundVerts = new Float32Array(8);

  private onLost = () => {
    // El contexto se perdió: los recursos ya no valen (se recrean al restaurarse).
    this.res = null;
    this.uploaded = null;
    this.fieldUploaded = -1;
    this.rampUploaded = false;
    this.statsPending = null;
    this.maskKey = "";
  };

  constructor(opts: SolarGLLayerOptions) {
    this.settings = opts.settings;
    this.onError = opts.onError;
    this.roofLayer = new RoofEdgesLayer(this);
  }

  /* ------------------------------ API del motor ------------------------------ */

  setSettings(s: QualitySettings) {
    const resize = s.msaa !== this.settings.msaa || s.maskScale !== this.settings.maskScale;
    this.settings = s;
    if (resize && this.res) {
      deleteRenderTarget(this.res.gl, this.res.maskTarget);
      this.res.maskTarget = null;
    }
    this.maskKey = "";
    this.repaint();
  }

  setFrame(f: SolarGLFrame) {
    this.frame = f;
  }

  setGeometry(g: ShadowGeometry | null) {
    if (g === this.geometry) return;
    this.geometry = g;
    this.maskKey = "";
    this.repaint();
  }

  /** Copia la rejilla de luz (solo cuando cambia `version`). */
  setField(grid: SolarGrid, version: number) {
    if (version === this.fieldVersion) return;
    this.fieldVersion = version;
    const { cols, rows } = grid;
    const n = cols * rows;
    const data = this.field && this.field.data.length === n * 4 ? this.field.data : new Uint8Array(n * 4);
    const q = (x: number) => Math.round(clamp(x, 0, 1) * 255);
    for (let k = 0; k < n; k++) {
      data[4 * k] = q(grid.sunlight[k]);
      data[4 * k + 1] = q(grid.shadow[k]);
      data[4 * k + 2] = q(grid.cloud[k]);
      data[4 * k + 3] = 255;
    }
    const b = grid.bounds;
    this.field = { data, cols, rows, box: [b.west, b.south, b.east, b.north] };
  }

  /** Pide una reducción de la máscara (para las estadísticas de la vista). */
  requestStats(cols: number, rows: number) {
    this.statsReq = { cols, rows };
  }

  /** Recoge la reducción cuando la GPU la tiene lista (sin bloquear). */
  takeStats(): SolarGLStats | null {
    const res = this.res;
    const p = this.statsPending;
    if (res && p) {
      const gl = res.gl;
      const st = gl.clientWaitSync(p.sync, 0, 0);
      if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED) {
        const raw = new Uint8Array(p.cols * p.rows * 4);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, res.statsPbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, raw);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.deleteSync(p.sync);
        this.statsPending = null;
        // Una sola banda (R) y de arriba abajo, como la recorre el motor.
        const data = new Uint8Array(p.cols * p.rows);
        for (let j = 0; j < p.rows; j++) {
          const src = (p.rows - 1 - j) * p.cols;
          for (let i = 0; i < p.cols; i++) data[j * p.cols + i] = raw[4 * (src + i)];
        }
        this.statsResult = { data, cols: p.cols, rows: p.rows };
      } else if (st === gl.WAIT_FAILED) {
        gl.deleteSync(p.sync);
        this.statsPending = null;
      }
    }
    const out = this.statsResult;
    this.statsResult = null;
    return out;
  }

  /** ¿La última máscara tenía sombras de edificios? (y con qué intensidad de zoom × sol). */
  get shadowMaskActive() {
    return this.maskActive;
  }

  get shadowFade() {
    return this.lastShadowFade;
  }

  get isFailed() {
    return this.failed;
  }

  /* ------------------------------ ciclo de vida (mapa) ------------------------------ */

  onAdd(map: unknown, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map as GLMap;
    const canvas = this.map.getCanvas();
    canvas.addEventListener("webglcontextlost", this.onLost);
    if (typeof WebGL2RenderingContext === "undefined" || !(gl instanceof WebGL2RenderingContext)) {
      this.fail(new GLError("WebGL2 no disponible en el mapa"));
      return;
    }
    this.guard(() => this.ensureResources(gl));
  }

  onRemove(_map: unknown, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map?.getCanvas().removeEventListener("webglcontextlost", this.onLost);
    if (this.res && this.res.gl === gl && !this.res.gl.isContextLost()) this.dispose(this.res);
    this.res = null;
    this.uploaded = null;
    this.fieldUploaded = -1;
    this.rampUploaded = false;
    this.statsPending = null;
    this.maskKey = "";
  }

  prerender(gl: WebGLRenderingContext | WebGL2RenderingContext, args: unknown) {
    if (this.failed) return;
    this.guard(() => this.drawMask(gl as WebGL2RenderingContext, args));
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: unknown) {
    if (this.failed) return;
    this.guard(() => this.drawGround(gl as WebGL2RenderingContext, args));
  }

  /* ------------------------------ interno ------------------------------ */

  private repaint() {
    this.map?.triggerRepaint?.();
  }

  private guard(fn: () => void) {
    try {
      fn();
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown) {
    if (this.failed) return;
    this.failed = true;
    this.onError(e);
  }

  private ensureResources(gl: WebGL2RenderingContext): Resources {
    if (this.res && this.res.gl === gl) return this.res;
    if (gl.isContextLost()) throw new GLError("contexto perdido");
    const buffer = () => {
      const b = gl.createBuffer();
      if (!b) throw new GLError("createBuffer");
      return b;
    };
    const vao = () => {
      const v = gl.createVertexArray();
      if (!v) throw new GLError("createVertexArray");
      return v;
    };

    const mask = createProgram(gl, SH.MASK_VS, SH.MASK_FS, MASK_UNIFORMS);
    const ground = createProgram(gl, SH.GROUND_VS, SH.GROUND_FS, GROUND_UNIFORMS);
    const roof = createProgram(gl, SH.ROOF_VS, SH.ROOF_FS, ROOF_UNIFORMS);
    const stats = createProgram(gl, SH.STATS_VS, SH.STATS_FS, STATS_UNIFORMS);

    // Geometría de sombras: a_pos (vec4).
    const geomVao = vao();
    const geomVbo = buffer();
    const geomIbo = buffer();
    gl.bindVertexArray(geomVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geomVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, SHADOW_VERTEX_STRIDE * 4, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geomIbo);

    // Suelo: 4 vértices (tira de triángulos), dinámicos.
    const groundVao = vao();
    const groundVbo = buffer();
    gl.bindVertexArray(groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, groundVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.groundVerts.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);

    // Aristas de tejado: plantilla de 4 esquinas + una instancia por arista.
    const roofVao = vao();
    const roofCornerVbo = buffer();
    const roofEdgeVbo = buffer();
    gl.bindVertexArray(roofVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, roofCornerVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, roofEdgeVbo);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, ROOF_EDGE_STRIDE * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, ROOF_EDGE_STRIDE * 4, 16);
    gl.vertexAttribDivisor(2, 1);

    const emptyVao = vao();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const fieldTex = createTexture(gl, gl.LINEAR);
    const rampTex = createTexture(gl, gl.LINEAR);
    const emptyTex = createTexture(gl, gl.NEAREST);
    uploadRGBA(gl, emptyTex, 1, 1, new Uint8Array([0, 0, 0, 0]));
    const statsPbo = buffer();

    this.res = {
      gl,
      mask,
      ground,
      roof,
      stats,
      geomVao,
      geomVbo,
      geomIbo,
      groundVao,
      groundVbo,
      roofVao,
      roofCornerVbo,
      roofEdgeVbo,
      emptyVao,
      fieldTex,
      rampTex,
      emptyTex,
      statsPbo,
      maskTarget: null,
      statsTarget: null,
    };
    this.uploaded = null;
    this.fieldUploaded = -1;
    this.rampUploaded = false;
    return this.res;
  }

  private dispose(r: Resources) {
    const gl = r.gl;
    [r.mask, r.ground, r.roof, r.stats].forEach((p) => gl.deleteProgram(p.program));
    [r.geomVao, r.groundVao, r.roofVao, r.emptyVao].forEach((v) => gl.deleteVertexArray(v));
    [r.geomVbo, r.geomIbo, r.groundVbo, r.roofCornerVbo, r.roofEdgeVbo, r.statsPbo].forEach((b) => gl.deleteBuffer(b));
    [r.fieldTex, r.rampTex, r.emptyTex].forEach((t) => gl.deleteTexture(t));
    deleteRenderTarget(gl, r.maskTarget);
    deleteRenderTarget(gl, r.statsTarget);
  }

  private uploadGeometry(r: Resources) {
    const g = this.geometry;
    if (!g || g === this.uploaded) return;
    const gl = r.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.geomVbo);
    gl.bufferData(gl.ARRAY_BUFFER, g.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.geomIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.roofEdgeVbo);
    gl.bufferData(gl.ARRAY_BUFFER, g.edges, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    this.uploaded = g;
  }

  private uploadField(r: Resources) {
    const gl = r.gl;
    if (!this.rampUploaded) {
      uploadRGBA(gl, r.rampTex, 256, 1, buildRampLut(256));
      this.rampUploaded = true;
    }
    const f = this.field;
    if (f && this.fieldUploaded !== this.fieldVersion) {
      uploadRGBA(gl, r.fieldTex, f.cols, f.rows, f.data);
      this.fieldUploaded = this.fieldVersion;
    }
  }

  /** Pasada fuera de pantalla: máscara de sombras (y reducción para estadísticas). */
  private drawMask(gl: WebGL2RenderingContext, args: unknown) {
    // Lo que el mapa tenía enlazado se restaura al terminar (crear destinos también enlaza los suyos).
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    try {
      this.drawMaskInner(gl, args);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    }
  }

  private drawMaskInner(gl: WebGL2RenderingContext, args: unknown) {
    const map = this.map;
    const frame = this.frame;
    const main = mainMatrixOf(args);
    if (!map || !main) return;
    const r = this.ensureResources(gl);
    this.uploadGeometry(r);

    const zoom = map.getZoom();
    const zf = zoomFactors(zoom, frame?.buildings3D ?? false);
    const fade = frame ? frame.shadowsK * zf.shadowZoomFade : 0;
    this.lastShadowFade = fade;
    const g = this.uploaded;
    const want = !!(frame && g && g.indices.length > 0 && fade > 0.001 && frame.altitude > -0.02);
    this.maskActive = want;
    if (!want || !frame || !g) {
      this.maskKey = "";
      return;
    }

    const dbw = gl.drawingBufferWidth;
    const dbh = gl.drawingBufferHeight;
    const scale = this.settings.maskScale;
    const mw = Math.max(1, Math.round(dbw * scale));
    const mh = Math.max(1, Math.round(dbh * scale));
    if (!r.maskTarget || r.maskTarget.width !== mw || r.maskTarget.height !== mh) {
      deleteRenderTarget(gl, r.maskTarget);
      r.maskTarget = createRenderTarget(gl, mw, mh, this.settings.msaa);
      this.maskKey = "";
    }

    localToClipMatrix(main, g.ox, g.oy, g.mpu, this.matGeom);
    const alt = Math.max(frame.altitude, SHADOW_MIN_ALTITUDE);
    const key = `${Array.prototype.join.call(this.matGeom, ",")}|${frame.azimuth.toFixed(5)}|${alt.toFixed(5)}|${mw}x${mh}`;
    const needMask = key !== this.maskKey;

    if (needMask) {
      this.maskKey = key;
      const t = r.maskTarget;
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.msaaFbo ?? t.fbo);
      gl.viewport(0, 0, mw, mh);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const p = r.mask;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.uniforms.u_matrix, false, this.matGeom);
      // Dirección de la sombra (opuesta al sol) en ejes este / sur.
      gl.uniform2f(p.uniforms.u_dir, -Math.sin(frame.azimuth), Math.cos(frame.azimuth));
      gl.uniform1f(p.uniforms.u_perMeter, 1 / Math.tan(alt));
      gl.uniform1f(p.uniforms.u_maxLen, SHADOW_MAX_LENGTH_M);
      gl.bindVertexArray(r.geomVao);
      const ranges = g.ranges;
      for (let b = 0; b < ranges.length; b += 4) {
        if (ranges[b + 1] > 0) {
          gl.uniform1f(p.uniforms.u_value, 1);
          gl.drawElements(gl.TRIANGLES, ranges[b + 1], gl.UNSIGNED_INT, ranges[b] * 4);
        }
        if (ranges[b + 3] > 0) {
          gl.uniform1f(p.uniforms.u_value, 0);
          gl.drawElements(gl.TRIANGLES, ranges[b + 3], gl.UNSIGNED_INT, ranges[b + 2] * 4);
        }
      }
      gl.bindVertexArray(null);
      resolveRenderTarget(gl, t);
    }

    if (this.statsReq && !this.statsPending) this.reduceForStats(r);
  }

  private reduceForStats(r: Resources) {
    const gl = r.gl;
    const req = this.statsReq;
    if (!req || !r.maskTarget) return;
    this.statsReq = null;
    if (!r.statsTarget || r.statsTarget.width !== req.cols || r.statsTarget.height !== req.rows) {
      deleteRenderTarget(gl, r.statsTarget);
      r.statsTarget = createRenderTarget(gl, req.cols, req.rows, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.statsTarget.fbo);
    gl.viewport(0, 0, req.cols, req.rows);
    gl.disable(gl.BLEND);
    const p = r.stats;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.maskTarget.texture);
    gl.uniform1i(p.uniforms.u_mask, 0);
    gl.uniform2f(p.uniforms.u_out, req.cols, req.rows);
    gl.bindVertexArray(r.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.statsPbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, req.cols * req.rows * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, req.cols, req.rows, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync) {
      this.statsPending = { sync, cols: req.cols, rows: req.rows };
      gl.flush();
    }
  }

  /** Pasada principal: el suelo iluminado (justo debajo de los edificios 3D y las etiquetas). */
  private drawGround(gl: WebGL2RenderingContext, args: unknown) {
    const map = this.map;
    const frame = this.frame;
    const main = mainMatrixOf(args);
    if (!map || !frame || !main) return;
    const r = this.ensureResources(gl);
    this.uploadField(r);
    if (!this.field) return;

    // Origen del suelo: centro de la vista (en metros locales, sin perder precisión).
    const c = map.getCenter();
    const ox = lngToMx(c.lng);
    const oy = latToMy(c.lat);
    const mpu = metersPerMercatorUnit(c.lat);
    localToClipMatrix(main, ox, oy, mpu, this.matGround);
    const radius = this.groundQuad(map, ox, oy, mpu);
    if (radius <= 0) return;

    const zoom = map.getZoom();
    const zf = zoomFactors(zoom, frame.buildings3D);
    const g = this.uploaded;
    const fade = this.maskActive && r.maskTarget ? this.lastShadowFade : 0;
    const alt = Math.max(frame.altitude, SHADOW_MIN_ALTITUDE);
    const perMeter = 1 / Math.tan(alt);
    const s = this.settings;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const p = r.ground;
    const u = p.uniforms;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.u_matrix, false, this.matGround);
    gl.uniform3f(u.u_origin, ox, oy, mpu);
    gl.uniform1f(u.u_radius, radius);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.fieldTex);
    gl.uniform1i(u.u_field, 0);
    const f = this.field;
    gl.uniform4f(u.u_fieldBox, f.box[0], f.box[1], f.box[2], f.box[3]);
    gl.uniform2f(u.u_fieldSize, f.cols, f.rows);
    gl.uniform1i(u.u_smooth, s.smoothField ? 1 : 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, r.rampTex);
    gl.uniform1i(u.u_ramp, 1);
    const L = frame.light;
    gl.uniform4f(u.u_light, L.dayK, L.shadeK, L.elev, L.amb);
    gl.uniform4f(u.u_light2, L.cap, frame.cloudK, L.veilMax, L.nightK);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fade > 0 && r.maskTarget ? r.maskTarget.texture : r.emptyTex);
    gl.uniform1i(u.u_mask, 2);
    gl.uniform2f(u.u_buf, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.u_bFade, fade);
    const tc = SHADOW_TONE.color;
    gl.uniform4f(u.u_tone, tc[0] / 255, tc[1] / 255, tc[2] / 255, zf.toneAlpha);
    gl.uniform4f(
      u.u_pen,
      Math.tan(GRAPHICS.sunAngularRadius) / Math.cos(alt),
      SHADOW_MAX_LENGTH_M,
      GRAPHICS.edgeSoftnessM,
      GRAPHICS.maxPenumbraPx
    );
    gl.uniform1f(u.u_maxDist, g ? Math.min(SHADOW_MAX_LENGTH_M, g.maxHeight * perMeter) : 0);
    if (s.contactShadow) gl.uniform2f(u.u_contact, GRAPHICS.contactShadow.amount, GRAPHICS.contactShadow.meters);
    else gl.uniform2f(u.u_contact, 0, 1);
    gl.uniform1i(u.u_mode, s.penumbra === "full" ? 2 : s.penumbra === "lite" ? 1 : 0);
    gl.uniform1f(u.u_opacity, clamp(frame.opacity, 0, 1));

    gl.bindVertexArray(r.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.groundVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.groundVerts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * Rectángulo de suelo visible (m locales desde el centro), acotado a 16 km. Devuelve el radio
   * dibujado (para desvanecer el borde) o 0 si no hay nada que dibujar.
   */
  private groundQuad(map: GLMap, ox: number, oy: number, mpu: number): number {
    const el = map.getContainer();
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 2 || h < 2) return 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const pts: Array<[number, number]> = [
      [0, 0],
      [w / 2, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    for (const pt of pts) {
      const g = map.unproject(pt);
      const x = (lngToMx(g.lng) - ox) * mpu;
      const y = (latToMy(g.lat) - oy) * mpu;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) return 0;
    const pad = 0.08 * Math.max(maxX - minX, maxY - minY) + 20;
    const R = MAX_GROUND_M;
    minX = Math.max(-R, minX - pad);
    minY = Math.max(-R, minY - pad);
    maxX = Math.min(R, maxX + pad);
    maxY = Math.min(R, maxY + pad);
    const v = this.groundVerts;
    v[0] = minX;
    v[1] = minY;
    v[2] = maxX;
    v[3] = minY;
    v[4] = minX;
    v[5] = maxY;
    v[6] = maxX;
    v[7] = maxY;
    return R;
  }

  /** Aristas de tejado (capa 3D aparte, con la profundidad de los edificios). */
  drawRoofEdges(gl: WebGL2RenderingContext, args: unknown) {
    if (this.failed) return;
    this.guard(() => {
      const map = this.map;
      const frame = this.frame;
      const main = mainMatrixOf(args);
      const g = this.uploaded;
      const r = this.res;
      if (!map || !frame || !main || !g || !r || r.gl !== gl || !this.settings.roofEdges || g.edgeCount === 0) return;
      const zoom = map.getZoom();
      const zf = zoomFactors(zoom, frame.buildings3D);
      const appear = smoothstep(BUILDINGS_3D.fromZoom + 0.3, BUILDINGS_3D.fromZoom + 0.9, zoom);
      if (zf.extrudeK < 0.02 || appear < 0.01) return;

      localToClipMatrix(main, g.ox, g.oy, g.mpu, this.matGeom);
      const el = map.getContainer();
      const dpr = gl.drawingBufferWidth / Math.max(1, el.clientWidth);
      const night = frame.theme === "night";
      const a = GRAPHICS.roofEdge.opacity * appear * (night ? 0.85 : 1) * clamp(frame.opacity, 0, 1);
      const rgb = night ? [150, 170, 230] : [118, 98, 74];

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.STENCIL_TEST);

      const p = r.roof;
      const u = p.uniforms;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(u.u_matrix, false, this.matGeom);
      gl.uniform1f(u.u_extrude, zf.extrudeK);
      gl.uniform2f(u.u_viewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.u_halfWidth, (GRAPHICS.roofEdge.widthPx * dpr) / 2);
      gl.uniform1f(u.u_bias, 6e-5);
      gl.uniform4f(u.u_color, (rgb[0] / 255) * a, (rgb[1] / 255) * a, (rgb[2] / 255) * a, a);
      gl.bindVertexArray(r.roofVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, g.edgeCount);
      gl.bindVertexArray(null);
      gl.depthMask(true);
    });
  }
}

/** Capa 3D de las aristas de tejado: comparte recursos con la capa solar. */
export class RoofEdgesLayer {
  readonly id = ROOF_EDGES_LAYER_ID;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;
  private owner: SolarGLLayer;

  constructor(owner: SolarGLLayer) {
    this.owner = owner;
  }

  onAdd() {
    /* los recursos los crea la capa solar */
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: unknown) {
    this.owner.drawRoofEdges(gl as WebGL2RenderingContext, args);
  }
}
