import { TREE_INSTANCE_STRIDE, type TreeBatch } from "../trees/treeStore";
import { createProgram, GLError, type Program } from "./glUtils";
import { icosphere, trunkPrism } from "./meshes";

/**
 * Árboles en la GPU (Fase C): una sola malla de copa y otra de tronco, instanciadas para miles de
 * árboles del inventario municipal.
 *
 *  · `drawShadows`  sombra de cada copa (elipse con borde suave) en la máscara del suelo, con la
 *                   densidad de hoja de la estación. Media y Alta.
 *  · `draw3D`       copas low-poly y troncos con la luz del sol y la profundidad de los edificios.
 *                   Solo Alta. Los caducifolios sin hoja se dibujan como ramaje (tramado).
 *  · `drawDepth`    las copas en el mapa de sombras del sol (sombra sobre fachadas y tejados).
 */

const DENSITY_DECL = "uniform float u_density[5];";

const COPA_FORMA = `
  int kind = int(a_meta.x + 0.5);
  float rv = kind == 2 ? rh * 0.45 : (kind == 3 ? rh * 1.25 : rh * 0.8);
  rv = min(rv, max(h, 0.5) * 0.45);
  float hc = max(h - rv, rv);
`;

export const TREE_SHADOW_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;   // esquina del cuadrado (−1…1)
layout(location = 1) in vec4 a_tree;     // x, y (m), altura (m), radio de copa (m)
layout(location = 2) in vec2 a_meta;     // tipo, semilla
uniform mat4 u_matrix;
uniform vec2 u_dir;                      // dirección de la sombra (este, sur)
uniform float u_perMeter;                // 1 / tan(altitud)
uniform float u_maxLen;
${DENSITY_DECL}
out vec2 v_uv;
out float v_density;
void main() {
  float h = a_tree.z;
  float rh = a_tree.w;
  ${COPA_FORMA}
  float len = min(hc * u_perMeter, u_maxLen);
  vec2 c = a_tree.xy + u_dir * len;
  // La sombra de un elipsoide: radio rh de lado y sqrt(rh² + (rv / tan α)²) a lo largo.
  float along = min(sqrt(rh * rh + (rv * u_perMeter) * (rv * u_perMeter)), u_maxLen * 0.5);
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  vec2 p = c + u_dir * (a_corner.x * along) + perp * (a_corner.y * rh);
  v_uv = a_corner;
  v_density = u_density[kind];
  gl_Position = u_matrix * vec4(p, 0.0, 1.0);
}`;

export const TREE_SHADOW_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_density;
out vec4 o;
void main() {
  float d = length(v_uv);
  if (d >= 1.0) discard;
  float a = v_density * (1.0 - smoothstep(0.6, 1.0, d));
  o = vec4(a, 0.0, 0.0, 1.0);
}`;

const SOLID_VS_BODY = `
  float h = a_tree.z * u_grow;
  float rh = a_tree.w * mix(0.6, 1.0, u_grow);
  ${COPA_FORMA}
  vec3 p;
  if (u_part == 0) {
    float s = a_meta.y * 6.2831853;
    float wob = 1.0 + 0.07 * sin(a_pos.x * 5.1 + s) * cos(a_pos.y * 4.3 + s * 1.7) + 0.05 * sin(a_pos.z * 6.7 + s * 2.3);
    p = vec3(a_tree.xy + u_offset + a_pos.xy * rh * wob, hc + a_pos.z * rv * wob);
    v_n = vec3(a_pos.xy / max(rh, 0.01), a_pos.z / max(rv, 0.01));
    v_h = a_pos.z;
    v_p = a_pos;
  } else {
    float tr = 0.1 + 0.012 * a_tree.z;
    float top = max(hc - rv * 0.5, 0.0);
    p = vec3(a_tree.xy + u_offset + a_pos.xy * tr, a_pos.z * top);
    v_n = vec3(a_nrm.xy, 0.0);
    v_h = -1.0;
    v_p = vec3(0.0);
  }
  v_kind = float(kind);
  v_seed = a_meta.y;
`;

export const TREE_SOLID_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;      // malla unidad (copa o tronco)
layout(location = 1) in vec3 a_nrm;
layout(location = 2) in vec4 a_tree;
layout(location = 3) in vec2 a_meta;
uniform mat4 u_matrix;
uniform vec2 u_offset;                   // origen de los árboles respecto al de la matriz (m)
uniform float u_grow;                    // 0–1: crecen al acercarse, como los edificios 3D
uniform int u_part;                      // 0 copa · 1 tronco
uniform mat4 u_lightM;                   // mapa de sombras del sol (marco de los edificios)
uniform vec2 u_lightOff;                 // origen de los árboles respecto al de los edificios (m)
out vec3 v_n;
out float v_kind;
out float v_seed;
out float v_h;
out vec3 v_p;
out vec4 v_lp;
void main() {
${SOLID_VS_BODY}
  v_lp = u_lightM * vec4(p.xy + u_lightOff, p.z, 1.0);
  gl_Position = u_matrix * vec4(p, 1.0);
}`;

export const TREE_SOLID_FS = `#version 300 es
precision highp float;
precision highp int;                     // igual que en el vértice (u_part se comparte)
in vec3 v_n;
in float v_kind;
in float v_seed;
in float v_h;
in vec3 v_p;
in vec4 v_lp;
uniform vec3 u_sun;                      // hacia el sol (marco local: este, sur, arriba)
uniform vec4 u_light;                    // ambiente, difusa, aparición (0–1), noche (0–1)
uniform int u_part;
uniform highp sampler2DShadow u_smap;    // sombra de edificios y copas vecinas (solo Alta)
uniform vec4 u_sp;                       // activo (0/1), 1/lado del mapa, profundidad por metro, —
${DENSITY_DECL}
out vec4 o;
float sunVisible(float ndl) {
  if (u_sp.x < 0.5) return 1.0;
  vec3 q = v_lp.xyz / v_lp.w * 0.5 + 0.5;
  if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
  // Sesgo en metros (más en caras rasantes) para que la copa no se sombree a sí misma.
  float z = q.z - u_sp.z * (0.9 + 2.6 * (1.0 - ndl));
  float t = u_sp.y;
  return 0.25 * (texture(u_smap, vec3(q.xy + vec2(-t, -t), z)) + texture(u_smap, vec3(q.xy + vec2(t, -t), z)) +
                 texture(u_smap, vec3(q.xy + vec2(-t, t), z)) + texture(u_smap, vec3(q.xy + vec2(t, t), z)));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  int kind = int(v_kind + 0.5);
  // Aparición con tramado (sin transparencias: nada que ordenar).
  if (hash(floor(gl_FragCoord.xy) + v_seed * 17.0) > u_light.z) discard;
  float leaf = u_density[kind];
  vec3 base;
  if (u_part == 1) base = vec3(0.40, 0.33, 0.26);
  else if (kind == 2) base = vec3(0.43, 0.56, 0.33);
  else if (kind == 3) base = vec3(0.23, 0.39, 0.27);
  else if (kind == 0) base = vec3(0.29, 0.46, 0.28);
  else base = mix(vec3(0.52, 0.46, 0.38), vec3(0.40, 0.57, 0.30), clamp((leaf - 0.25) / 0.5, 0.0, 1.0));
  // Caducifolios con poca hoja: solo el ramaje (se ve a través de la copa).
  if (u_part == 0 && (kind == 1 || kind == 4)) {
    // Huecos fijos a la copa (celdas de ~1/7 del radio): no «bailan» al mover el mapa.
    float keep = clamp(leaf / 0.8, 0.3, 1.0);
    vec3 cell = floor(v_p * 7.0);
    if (fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719)) + v_seed * 43.0) * 43758.5453) > keep) discard;
  }
  vec3 n = normalize(v_n);
  float ndl = max(dot(n, u_sun), 0.0);
  float ao = u_part == 0 ? mix(0.6, 1.0, smoothstep(-0.7, 0.6, v_h)) : 0.8;
  float vis = ndl > 0.0 ? sunVisible(ndl) : 1.0;
  vec3 c = base * (u_light.x + u_light.y * ndl * vis) * ao;
  c = mix(c, c * vec3(0.5, 0.58, 0.85), u_light.w);
  o = vec4(c, 1.0);
}`;

export const TREE_DEPTH_FS = `#version 300 es
precision highp float;
in vec3 v_n;
in float v_kind;
in float v_seed;
in float v_h;
in vec4 v_lp;
${DENSITY_DECL}
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // Copa parcial: tramado según la densidad de hoja (el filtrado del mapa de sombras lo promedia).
  float leaf = u_density[int(v_kind + 0.5)];
  if (hash(floor(gl_FragCoord.xy) + v_seed * 13.0) > leaf) discard;
  o = vec4(0.0);
}`;

const SHADOW_UNIFORMS = ["u_matrix", "u_dir", "u_perMeter", "u_maxLen", "u_density"] as const;
const SOLID_UNIFORMS = [
  "u_matrix",
  "u_offset",
  "u_grow",
  "u_part",
  "u_sun",
  "u_light",
  "u_density",
  "u_lightM",
  "u_lightOff",
  "u_smap",
  "u_sp",
] as const;
const DEPTH_UNIFORMS = ["u_matrix", "u_offset", "u_grow", "u_part", "u_density"] as const;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** El mapa de sombras del sol, para que las copas 3D reciban la sombra de edificios y vecinas. */
export interface TreeShadowMap {
  /** Matriz de la luz (marco de los edificios) y desplazamiento árboles → edificios (m). */
  light: Float32Array;
  offsetX: number;
  offsetY: number;
  /** 1 / lado del mapa (texels) y unidades de profundidad por metro. */
  invSize: number;
  depthPerM: number;
  /** Enlaza el mapa (DEPTH_COMPONENT con comparación) en la unidad de textura indicada. */
  bind(unit: number): void;
}

export class TreeRenderer {
  readonly gl: WebGL2RenderingContext;
  private shadowProg: Program;
  private solidProg: Program;
  private depthProg: Program;
  private cornerVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private crownVbo: WebGLBuffer;
  private crownIbo: WebGLBuffer;
  private trunkVbo: WebGLBuffer;
  private trunkIbo: WebGLBuffer;
  private shadowVao: WebGLVertexArrayObject;
  private crownVao: WebGLVertexArrayObject;
  private trunkVao: WebGLVertexArrayObject;
  private crownCount: number;
  private trunkCount: number;
  private uploaded = -1;
  private densities = new Float32Array(5);
  /** Mapa de profundidad vacío: el muestreador de sombras necesita una textura válida enlazada. */
  private dummyDepth: WebGLTexture | null = null;
  count = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const buffer = () => {
      const b = gl.createBuffer();
      if (!b) throw new GLError("createBuffer (árboles)");
      return b;
    };
    const vao = () => {
      const v = gl.createVertexArray();
      if (!v) throw new GLError("createVertexArray (árboles)");
      return v;
    };
    this.shadowProg = createProgram(gl, TREE_SHADOW_VS, TREE_SHADOW_FS, SHADOW_UNIFORMS);
    this.solidProg = createProgram(gl, TREE_SOLID_VS, TREE_SOLID_FS, SOLID_UNIFORMS);
    this.depthProg = createProgram(gl, TREE_SOLID_VS, TREE_DEPTH_FS, DEPTH_UNIFORMS);

    this.cornerVbo = buffer();
    this.instVbo = buffer();
    this.crownVbo = buffer();
    this.crownIbo = buffer();
    this.trunkVbo = buffer();
    this.trunkIbo = buffer();

    const crown = icosphere(1);
    const trunk = trunkPrism(6);
    this.crownCount = crown.indices.length;
    this.trunkCount = trunk.indices.length;

    // Sombras: esquina (por vértice) + árbol (por instancia).
    this.shadowVao = vao();
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.bindInstanceAttribs(1, 2);

    // Copas y troncos: malla (por vértice) + árbol (por instancia).
    this.crownVao = vao();
    gl.bindVertexArray(this.crownVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crownVbo);
    gl.bufferData(gl.ARRAY_BUFFER, crown.vertices, gl.STATIC_DRAW);
    this.bindMeshAttribs();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.crownIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, crown.indices, gl.STATIC_DRAW);
    this.bindInstanceAttribs(2, 3);

    this.trunkVao = vao();
    gl.bindVertexArray(this.trunkVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trunkVbo);
    gl.bufferData(gl.ARRAY_BUFFER, trunk.vertices, gl.STATIC_DRAW);
    this.bindMeshAttribs();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trunkIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, trunk.indices, gl.STATIC_DRAW);
    this.bindInstanceAttribs(2, 3);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private bindMeshAttribs() {
    const gl = this.gl;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  }

  private bindInstanceAttribs(treeLoc: number, metaLoc: number) {
    const gl = this.gl;
    const stride = TREE_INSTANCE_STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.enableVertexAttribArray(treeLoc);
    gl.vertexAttribPointer(treeLoc, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(treeLoc, 1);
    gl.enableVertexAttribArray(metaLoc);
    gl.vertexAttribPointer(metaLoc, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(metaLoc, 1);
  }

  upload(batch: TreeBatch | null) {
    const gl = this.gl;
    if (!batch) {
      this.count = 0;
      this.uploaded = -1;
      return;
    }
    if (batch.version === this.uploaded) return;
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, batch.instances, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.count = batch.count;
    this.uploaded = batch.version;
  }

  private setDensities(p: Program, d: readonly number[]) {
    for (let i = 0; i < 5; i++) this.densities[i] = d[i] ?? 0.8;
    this.gl.uniform1fv(p.uniforms.u_density, this.densities);
  }

  /** Sombras de las copas en la máscara (el llamador ya tiene enlazado el destino y la mezcla MAX). */
  drawShadows(matrix: Float32Array, dirX: number, dirY: number, perMeter: number, maxLen: number, densities: readonly number[]) {
    if (this.count === 0) return;
    const gl = this.gl;
    const p = this.shadowProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.u_matrix, false, matrix);
    gl.uniform2f(p.uniforms.u_dir, dirX, dirY);
    gl.uniform1f(p.uniforms.u_perMeter, perMeter);
    gl.uniform1f(p.uniforms.u_maxLen, maxLen);
    this.setDensities(p, densities);
    gl.bindVertexArray(this.shadowVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }

  private emptyDepth(): WebGLTexture {
    if (this.dummyDepth) return this.dummyDepth;
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new GLError("createTexture (árboles)");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.dummyDepth = t;
    return t;
  }

  /** Copas y troncos en 3D (con la profundidad del mapa y, si lo hay, el mapa de sombras del sol). */
  draw3D(
    matrix: Float32Array,
    o: {
      sun: readonly number[];
      ambient: number;
      diffuse: number;
      appear: number;
      night: number;
      grow: number;
      densities: readonly number[];
      shadow: TreeShadowMap | null;
    }
  ) {
    if (this.count === 0) return;
    const gl = this.gl;
    const p = this.solidProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.u_matrix, false, matrix);
    gl.uniform2f(p.uniforms.u_offset, 0, 0);
    gl.uniform1f(p.uniforms.u_grow, o.grow);
    gl.uniform3f(p.uniforms.u_sun, o.sun[0], o.sun[1], o.sun[2]);
    gl.uniform4f(p.uniforms.u_light, o.ambient, o.diffuse, o.appear, o.night);
    this.setDensities(p, o.densities);
    const sm = o.shadow;
    if (sm) sm.bind(0);
    else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.emptyDepth());
    }
    gl.uniform1i(p.uniforms.u_smap, 0);
    gl.uniformMatrix4fv(p.uniforms.u_lightM, false, sm ? sm.light : IDENTITY);
    gl.uniform2f(p.uniforms.u_lightOff, sm ? sm.offsetX : 0, sm ? sm.offsetY : 0);
    gl.uniform4f(p.uniforms.u_sp, sm ? 1 : 0, sm ? sm.invSize : 0, sm ? sm.depthPerM : 0, 0);
    gl.uniform1i(p.uniforms.u_part, 1);
    gl.bindVertexArray(this.trunkVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.trunkCount, gl.UNSIGNED_SHORT, 0, this.count);
    gl.uniform1i(p.uniforms.u_part, 0);
    gl.bindVertexArray(this.crownVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.crownCount, gl.UNSIGNED_SHORT, 0, this.count);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Copas en el mapa de sombras del sol (matriz de la luz en el marco de los edificios +
   * desplazamiento). `grow` es el mismo crecimiento con el que se ven en 3D (1 si no se dibujan).
   */
  drawDepth(lightMatrix: Float32Array, offsetX: number, offsetY: number, densities: readonly number[], grow = 1) {
    if (this.count === 0) return;
    const gl = this.gl;
    const p = this.depthProg;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uniforms.u_matrix, false, lightMatrix);
    gl.uniform2f(p.uniforms.u_offset, offsetX, offsetY);
    gl.uniform1f(p.uniforms.u_grow, grow);
    gl.uniform1i(p.uniforms.u_part, 0);
    this.setDensities(p, densities);
    gl.bindVertexArray(this.crownVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.crownCount, gl.UNSIGNED_SHORT, 0, this.count);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    [this.shadowProg, this.solidProg, this.depthProg].forEach((p) => gl.deleteProgram(p.program));
    [this.shadowVao, this.crownVao, this.trunkVao].forEach((v) => gl.deleteVertexArray(v));
    [this.cornerVbo, this.instVbo, this.crownVbo, this.crownIbo, this.trunkVbo, this.trunkIbo].forEach((b) => gl.deleteBuffer(b));
    if (this.dummyDepth) gl.deleteTexture(this.dummyDepth);
  }
}
