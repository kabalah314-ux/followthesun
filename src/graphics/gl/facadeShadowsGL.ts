import { SHADOW_VERTEX_STRIDE, type ShadowGeometry } from "../shadowGeometry";
import { createProgram, GLError, type Program } from "./glUtils";

/**
 * Sombras sobre tejados y fachadas (calidad Alta): mapa de sombras del sol.
 *
 *  1. `renderMap`   (fuera de pantalla) los edificios cercanos como prismas — y las copas de los
 *                   árboles — vistos desde el sol en una textura de profundidad de 2.048 px.
 *  2. `drawOverlay` (capa 3D, después de los edificios del mapa) los mismos prismas con la cámara
 *                   del mapa: en cada punto de un tejado o de una fachada iluminada se mira si algo
 *                   más cercano al sol lo tapa y, si es así, se oscurece con el tono pizarra de las
 *                   sombras del suelo. Las caras de espaldas al sol no se tocan: ya las oscurece la
 *                   luz de los edificios del mapa.
 *
 * Los prismas reutilizan los índices de la máscara de sombras: con k = 1 como «arriba» (altura con
 * la que el mapa levanta el edificio), «huella proyectada + barridos» es justo tejado + fachadas.
 */

export const PRISM_DEPTH_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_pos;      // x, y (m), altura de sombra, k (0 base · 1 arriba)
layout(location = 1) in float a_rz;      // altura 3D del mapa (m)
uniform mat4 u_matrix;
void main() {
  gl_Position = u_matrix * vec4(a_pos.xy, a_pos.w * a_rz, 1.0);
}`;

export const PRISM_DEPTH_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;

export const RECEIVER_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_pos;
layout(location = 1) in float a_rz;
uniform mat4 u_matrix;
uniform float u_extrude;                 // 0–1: la misma transición de altura que el mapa
uniform float u_bias;                    // empuje hacia la cámara (NDC) para ganar a la superficie del mapa
out vec3 v_p;
void main() {
  float z = a_pos.w * a_rz * u_extrude;
  v_p = vec3(a_pos.xy, z);
  vec4 c = u_matrix * vec4(a_pos.xy, z, 1.0);
  c.z -= u_bias * c.w;
  gl_Position = c;
}`;

export const RECEIVER_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 v_p;
uniform sampler2DShadow u_map;
uniform mat4 u_light;                    // marco local → recorte de la cámara del sol
uniform vec3 u_sun;                      // hacia el sol (este, sur, arriba)
uniform vec3 u_eye;                      // cámara del mapa (marco local)
uniform vec4 u_tone;                     // tono pizarra (rgb) + opacidad máxima
uniform vec4 u_params;                   // 1/tamaño del mapa, desplazamiento normal (m), escala de profundidad (1/m), opacidad tejados
uniform vec3 u_area;                     // centro x, y y radio (m) del mapa de sombras
out vec4 o;
void main() {
  vec3 n = normalize(cross(dFdx(v_p), dFdy(v_p)));
  bool roof = abs(n.z) > 0.85;
  if (roof) n = vec3(0.0, 0.0, 1.0);
  else {
    n = normalize(vec3(n.xy, 0.0));
    if (dot(n, u_eye - v_p) < 0.0) n = -n;
  }
  float ndl = dot(n, u_sun);
  if (ndl <= 0.04) discard;
  vec3 q = v_p + n * u_params.y;
  vec4 lc = u_light * vec4(q, 1.0);
  vec3 s = lc.xyz * 0.5 + 0.5;
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) discard;
  float biasM = 0.35 + 0.9 * (1.0 - ndl);
  float ref = s.z - biasM * u_params.z;
  float t = u_params.x;
  float lit = texture(u_map, vec3(s.xy + vec2(-0.6, -0.6) * t, ref))
            + texture(u_map, vec3(s.xy + vec2(0.6, -0.6) * t, ref))
            + texture(u_map, vec3(s.xy + vec2(-0.6, 0.6) * t, ref))
            + texture(u_map, vec3(s.xy + vec2(0.6, 0.6) * t, ref));
  float shade = 1.0 - lit * 0.25;
  float r = length(v_p.xy - u_area.xy);
  shade *= 1.0 - smoothstep(0.78 * u_area.z, u_area.z, r);
  float a = u_tone.a * shade * (roof ? u_params.w : 1.0);
  if (a < 0.004) discard;
  o = vec4(u_tone.rgb * a, a);
}`;

const DEPTH_UNIFORMS = ["u_matrix"] as const;
const RECEIVER_UNIFORMS = ["u_matrix", "u_extrude", "u_bias", "u_map", "u_light", "u_sun", "u_eye", "u_tone", "u_params", "u_area"] as const;

export interface FacadeFrustum {
  cx: number;
  cy: number;
  /** Semiancho cubierto por el mapa de sombras (m). */
  halfWidth: number;
  /** Semiprofundidad (m). */
  halfDepth: number;
  /** Radio útil en el suelo (m): las sombras se desvanecen antes del borde. */
  radius: number;
}

export class FacadeShadowRenderer {
  readonly gl: WebGL2RenderingContext;
  private depthProg: Program;
  private recvProg: Program;
  private vao: WebGLVertexArrayObject;
  private rzVbo: WebGLBuffer;
  private tex: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private size = 0;
  private uploadedRz: ShadowGeometry | null = null;
  /** Matriz de la luz con la que se dibujó el último mapa (marco de la geometría). */
  readonly light = new Float32Array(16);
  frustum: FacadeFrustum | null = null;
  ready = false;

  constructor(gl: WebGL2RenderingContext, geomVbo: WebGLBuffer, geomIbo: WebGLBuffer) {
    this.gl = gl;
    this.depthProg = createProgram(gl, PRISM_DEPTH_VS, PRISM_DEPTH_FS, DEPTH_UNIFORMS);
    this.recvProg = createProgram(gl, RECEIVER_VS, RECEIVER_FS, RECEIVER_UNIFORMS);
    const vao = gl.createVertexArray();
    const rz = gl.createBuffer();
    if (!vao || !rz) throw new GLError("fachadas: recursos");
    this.vao = vao;
    this.rzVbo = rz;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geomVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, SHADOW_VERTEX_STRIDE * 4, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, rz);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geomIbo);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Sube las alturas 3D por vértice (la geometría la sube la capa solar en sus búferes). */
  uploadGeometry(g: ShadowGeometry) {
    if (g === this.uploadedRz) return;
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rzVbo);
    gl.bufferData(gl.ARRAY_BUFFER, g.renderZ, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.uploadedRz = g;
    this.ready = false;
  }

  private ensureTarget(size: number) {
    const gl = this.gl;
    if (this.tex && this.size === size) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) throw new GLError("fachadas: mapa de sombras");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new GLError("fachadas: fbo incompleto");
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.tex = tex;
    this.fbo = fbo;
    this.size = size;
  }

  /**
   * Dibuja el mapa de sombras. `light` es la matriz marco-de-la-geometría → recorte de la luz;
   * `extra` dibuja otros que proyectan sombra (las copas de los árboles) con la misma matriz.
   * El llamador guarda y restaura el framebuffer y el viewport del mapa.
   */
  renderMap(g: ShadowGeometry, light: Float32Array, frustum: FacadeFrustum, size: number, extra?: () => void) {
    const gl = this.gl;
    this.ensureTarget(size);
    this.uploadGeometry(g);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, size, size);
    const prevRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
    gl.depthRange(0, 1);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const p = this.depthProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.u_matrix, false, light);
    gl.bindVertexArray(this.vao);
    const ranges = g.ranges;
    for (let b = 0; b < ranges.length; b += 4) {
      if (ranges[b + 1] > 0) gl.drawElements(gl.TRIANGLES, ranges[b + 1], gl.UNSIGNED_INT, ranges[b] * 4);
    }
    gl.bindVertexArray(null);
    extra?.();

    gl.colorMask(true, true, true, true);
    gl.depthRange(prevRange[0], prevRange[1]);
    this.light.set(light);
    this.frustum = frustum;
    this.ready = true;
  }

  /** Escala del último mapa (para que las copas 3D lo muestreen), o null si no hay uno vigente. */
  sampling(g: ShadowGeometry | null): { invSize: number; depthPerM: number } | null {
    const f = this.frustum;
    if (!this.ready || !this.tex || !f || !g || g !== this.uploadedRz) return null;
    return { invSize: 1 / this.size, depthPerM: 1 / (2 * f.halfDepth) };
  }

  /** Enlaza el mapa de profundidad (con comparación) en la unidad de textura indicada. */
  bindMap(unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** Oscurece tejados y fachadas tapados (capa 3D del mapa, con su profundidad). */
  drawOverlay(
    g: ShadowGeometry,
    matrix: Float32Array,
    o: { extrude: number; sun: readonly number[]; eye: readonly number[]; tone: readonly number[]; alpha: number; roofAlpha: number }
  ) {
    const f = this.frustum;
    if (!this.ready || !this.tex || !f || g !== this.uploadedRz) return;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);

    const p = this.recvProg;
    const u = p.uniforms;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(u.u_matrix, false, matrix);
    gl.uniform1f(u.u_extrude, o.extrude);
    gl.uniform1f(u.u_bias, 2.5e-5);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_map, 0);
    gl.uniformMatrix4fv(u.u_light, false, this.light);
    gl.uniform3f(u.u_sun, o.sun[0], o.sun[1], o.sun[2]);
    gl.uniform3f(u.u_eye, o.eye[0], o.eye[1], o.eye[2]);
    gl.uniform4f(u.u_tone, o.tone[0], o.tone[1], o.tone[2], o.alpha);
    const texelM = (2 * f.halfWidth) / this.size;
    gl.uniform4f(u.u_params, 1 / this.size, 1.5 * texelM, 1 / (2 * f.halfDepth), o.roofAlpha);
    gl.uniform3f(u.u_area, f.cx, f.cy, f.radius);
    gl.bindVertexArray(this.vao);
    const ranges = g.ranges;
    for (let b = 0; b < ranges.length; b += 4) {
      if (ranges[b + 1] > 0) gl.drawElements(gl.TRIANGLES, ranges[b + 1], gl.UNSIGNED_INT, ranges[b] * 4);
    }
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthMask(true);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.depthProg.program);
    gl.deleteProgram(this.recvProg.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.rzVbo);
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
  }
}
