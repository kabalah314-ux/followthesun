/**
 * Utilidades WebGL2 mínimas para la capa solar (sin dependencias).
 * Todo error de compilación o de framebuffer se lanza como `GLError` para que la capa pueda
 * pasar al motor de canvas sin dejar el mapa vacío.
 */

export class GLError extends Error {}

export interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new GLError("createShader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new GLError(`shader: ${log}`);
  }
  return shader;
}

/** Compila y enlaza; devuelve también las posiciones de los uniforms pedidos. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  uniformNames: readonly string[]
): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!program) throw new GLError("createProgram");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new GLError(`link: ${log}`);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

export function createTexture(
  gl: WebGL2RenderingContext,
  filter: number = gl.LINEAR,
  wrap: number = gl.CLAMP_TO_EDGE
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new GLError("createTexture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

/** Sube una imagen RGBA8 desde memoria (sin premultiplicar ni voltear, pase lo que pase en el mapa). */
export function uploadRGBA(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, h: number, data: Uint8Array) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

/** Destino de dibujo: textura (y, si hay MSAA, un renderbuffer multimuestra que se resuelve en ella). */
export interface RenderTarget {
  width: number;
  height: number;
  samples: number;
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  msaaFbo: WebGLFramebuffer | null;
  msaaRb: WebGLRenderbuffer | null;
}

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  samples: number
): RenderTarget {
  const texture = createTexture(gl, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new GLError("createFramebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new GLError("fbo incompleto");

  let msaaFbo: WebGLFramebuffer | null = null;
  let msaaRb: WebGLRenderbuffer | null = null;
  const maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES)) || 0;
  const s = Math.min(samples, maxSamples);
  if (s > 1) {
    msaaRb = gl.createRenderbuffer();
    msaaFbo = gl.createFramebuffer();
    if (!msaaRb || !msaaFbo) throw new GLError("msaa");
    gl.bindRenderbuffer(gl.RENDERBUFFER, msaaRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msaaRb);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new GLError("msaa incompleto");
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  return { width, height, samples: s > 1 ? s : 0, texture, fbo, msaaFbo, msaaRb };
}

export function deleteRenderTarget(gl: WebGL2RenderingContext, t: RenderTarget | null) {
  if (!t) return;
  gl.deleteTexture(t.texture);
  gl.deleteFramebuffer(t.fbo);
  if (t.msaaFbo) gl.deleteFramebuffer(t.msaaFbo);
  if (t.msaaRb) gl.deleteRenderbuffer(t.msaaRb);
}

/** Copia el renderbuffer multimuestra a la textura (resolución del MSAA). */
export function resolveRenderTarget(gl: WebGL2RenderingContext, t: RenderTarget) {
  if (!t.msaaFbo) return;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msaaFbo);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fbo);
  gl.blitFramebuffer(0, 0, t.width, t.height, 0, 0, t.width, t.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}

/**
 * Producto `main × traslación(ox, oy) × escala(1/mpu)` en doble precisión: lleva metros locales a
 * coordenadas de recorte. Hacerlo en float64 (y no en el shader) evita temblores a zoom 20.
 */
export function localToClipMatrix(main: ArrayLike<number>, ox: number, oy: number, mpu: number, out: Float32Array) {
  const s = 1 / mpu;
  for (let r = 0; r < 4; r++) {
    out[r] = main[r] * s;
    out[4 + r] = main[4 + r] * s;
    out[8 + r] = main[8 + r] * s;
    out[12 + r] = main[r] * ox + main[4 + r] * oy + main[12 + r];
  }
  return out;
}
