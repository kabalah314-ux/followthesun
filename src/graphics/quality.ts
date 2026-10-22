import { GRAPHICS } from "../config";
import { preferences, type GraphicsQualityPreference } from "../lib/preferences";

/**
 * Calidad gráfica del mapa: tres niveles y una detección automática.
 *
 *   Alta    capa solar en WebGL2 · máscara de sombras con MSAA ×4 a resolución completa ·
 *           penumbra física (tamaño real del sol) · campo de luz bicúbico · sombra de contacto ·
 *           aristas de tejado en 3D · mapa hasta 2× · zoom 20
 *   Media   WebGL2 · máscara a 3/4 sin MSAA · penumbra ligera · campo bicúbico · aristas de
 *           tejado · mapa hasta 1,5× · zoom 20
 *   Ahorro  canvas 2D (el motor de siempre) · mapa a 1× · zoom 19 · sin trabajo extra de GPU
 *
 * «Auto» decide al arrancar con lo que se sabe del dispositivo (WebGL2, memoria, ahorro de datos,
 * renderizador por software y una prueba rápida de la GPU, guardada 7 días) y baja un nivel si
 * el mapa va a menos de 40 fps durante 3 s seguidos mientras se mueve. Un nivel elegido a mano
 * siempre manda (salvo que la GPU falle: entonces se usa el canvas para no dejar el mapa vacío).
 *
 * En la URL, `?gfx=alta|media|ahorro` fija el nivel solo en esa visita (pruebas y soporte).
 */

export type QualityLevel = "alta" | "media" | "ahorro";
export type QualityPreference = GraphicsQualityPreference;

/** Por qué se usa el nivel actual (para explicarlo en la interfaz). */
export type QualityReason =
  | "ok"
  | "manual"
  | "url"
  | "no-webgl2"
  | "save-data"
  | "software"
  | "low-memory"
  | "mid-memory"
  | "gpu-slow"
  | "gpu-mid"
  | "no-msaa"
  | "fps"
  | "gl-error";

export interface QualitySettings {
  level: QualityLevel;
  /** Capa solar en la GPU (WebGL2). Si no, canvas 2D. */
  webgl: boolean;
  /** Muestras MSAA de la máscara de sombras (0 = sin MSAA). */
  msaa: number;
  /** Resolución de la máscara de sombras respecto al búfer del mapa. */
  maskScale: number;
  /** Penumbra: completa (búsqueda de bordes + 12 muestras), ligera (4 + 6) o ninguna. */
  penumbra: "full" | "lite" | "none";
  /** Campo de luz con interpolación bicúbica (sin «diamantes» de la bilineal). */
  smoothField: boolean;
  /** Oscurecimiento de contacto al pie de las fachadas. */
  contactShadow: boolean;
  /** Aristas de tejado nítidas en 3D. */
  roofEdges: boolean;
  /** Tope de devicePixelRatio del mapa (nitidez frente a coste). */
  maxPixelRatio: number;
  /** Zoom máximo permitido. */
  maxZoom: number;
}

export const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  alta: {
    level: "alta",
    webgl: true,
    msaa: 4,
    maskScale: 1,
    penumbra: "full",
    smoothField: true,
    contactShadow: true,
    roofEdges: true,
    maxPixelRatio: 2,
    maxZoom: 20,
  },
  media: {
    level: "media",
    webgl: true,
    msaa: 0,
    maskScale: 0.75,
    penumbra: "lite",
    smoothField: true,
    contactShadow: false,
    roofEdges: true,
    maxPixelRatio: 1.5,
    maxZoom: 20,
  },
  ahorro: {
    level: "ahorro",
    webgl: false,
    msaa: 0,
    maskScale: 1,
    penumbra: "none",
    smoothField: false,
    contactShadow: false,
    roofEdges: false,
    maxPixelRatio: 1,
    maxZoom: 19,
  },
};

const ORDER: QualityLevel[] = ["ahorro", "media", "alta"];
const rank = (l: QualityLevel) => ORDER.indexOf(l);

/** El nivel inmediatamente inferior (Ahorro se queda en Ahorro). */
export const lowerLevel = (l: QualityLevel): QualityLevel => ORDER[Math.max(0, rank(l) - 1)];
/** El menor de dos niveles. */
export const minLevel = (a: QualityLevel, b: QualityLevel): QualityLevel => (rank(a) <= rank(b) ? a : b);
export const isQualityLevel = (v: unknown): v is QualityLevel => v === "alta" || v === "media" || v === "ahorro";

/* -------------------------------------------------------------------------- */
/*  Detección                                                                   */
/* -------------------------------------------------------------------------- */

export interface DeviceCapabilities {
  webgl2: boolean;
  /** MAX_SAMPLES de WebGL2 (MSAA disponible). */
  maxSamples: number;
  /** Nombre del renderizador (si el navegador lo expone). */
  renderer: string;
  /** Sin GPU real (SwiftShader, llvmpipe…): pintar en la GPU sería más lento que el canvas. */
  software: boolean;
  /** navigator.deviceMemory (GB, redondeado por el navegador) o null si no se sabe. */
  deviceMemory: number | null;
  cores: number | null;
  /** La persona pidió ahorrar datos (Save-Data). */
  saveData: boolean;
  /** Prueba rápida de la GPU (ms; menos es mejor). null si no se pudo medir. */
  gpuMs: number | null;
}

/** Umbrales de la prueba rápida de GPU (ms para 6 pasadas de 256×256 con 48 iteraciones). */
export const GPU_THRESHOLDS = { mid: 24, slow: 70 } as const;

/** Decisión pura (sin navegador): qué nivel conviene a un dispositivo y por qué. */
export function decideQuality(c: DeviceCapabilities): { level: QualityLevel; reason: QualityReason } {
  if (!c.webgl2) return { level: "ahorro", reason: "no-webgl2" };
  if (c.saveData) return { level: "ahorro", reason: "save-data" };
  if (c.software) return { level: "ahorro", reason: "software" };
  if (c.deviceMemory !== null && c.deviceMemory <= 2) return { level: "ahorro", reason: "low-memory" };
  if (c.gpuMs !== null && c.gpuMs > GPU_THRESHOLDS.slow) return { level: "ahorro", reason: "gpu-slow" };
  if (c.gpuMs !== null && c.gpuMs > GPU_THRESHOLDS.mid) return { level: "media", reason: "gpu-mid" };
  if (c.deviceMemory !== null && c.deviceMemory < 4) return { level: "media", reason: "mid-memory" };
  if (c.maxSamples < 4) return { level: "media", reason: "no-msaa" };
  return { level: "alta", reason: "ok" };
}

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

const TEST_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const TEST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_seed;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / 256.0;
  float acc = 0.0;
  float v = u_seed;
  for (int i = 0; i < 48; i++) {
    v = fract(sin(dot(uv * (v + 1.0) + float(i), vec2(12.9898, 78.233))) * 43758.5453);
    acc += texture(u_tex, uv + vec2(v, 1.0 - v) * 0.03).r * 0.02;
  }
  o = vec4(acc, v, uv);
}`;

/**
 * Mide el dispositivo: soporte WebGL2, MSAA, renderizador y una prueba de GPU de ~10-60 ms.
 * Crea un contexto propio pequeño y lo libera al terminar. Nunca lanza.
 */
export function measureDevice(): DeviceCapabilities {
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const caps: DeviceCapabilities = {
    webgl2: false,
    maxSamples: 0,
    renderer: "",
    software: false,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    saveData: !!nav.connection?.saveData,
    gpuMs: null,
  };
  if (typeof document === "undefined") return caps;

  let gl: WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const attrs: WebGLContextAttributes = {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: "high-performance",
    };
    gl = canvas.getContext("webgl2", { ...attrs, failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    if (!gl) {
      // Hay WebGL2, pero el navegador avisa de que irá lento (normalmente, sin GPU).
      gl = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
      if (gl) caps.software = true;
    }
    if (!gl) return caps;
    caps.webgl2 = true;
    caps.maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES)) || 0;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    caps.renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    if (SOFTWARE_RE.test(caps.renderer)) caps.software = true;
    caps.gpuMs = runGpuTest(gl);
  } catch {
    /* sin medida: se decide con lo demás */
  } finally {
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* noop */
    }
  }
  return caps;
}

function runGpuTest(gl: WebGL2RenderingContext): number | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, TEST_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, TEST_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const data = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) & 255;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.useProgram(prog);
  gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
  const seed = gl.getUniformLocation(prog, "u_seed");
  gl.viewport(0, 0, 256, 256);
  const px = new Uint8Array(4);

  // Calentamiento (la primera pasada incluye compilar el shader en el driver).
  gl.uniform1f(seed, 0.1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);

  const t0 = performance.now();
  for (let i = 0; i < 6; i++) {
    gl.uniform1f(seed, 0.2 + i * 0.1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = performance.now() - t0;
  gl.deleteTexture(tex);
  gl.deleteProgram(prog);
  return Math.round(ms * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/*  Monitor de fotogramas                                                       */
/* -------------------------------------------------------------------------- */

export interface FpsMonitorOptions {
  minFps: number;
  windowMs: number;
  /** Un hueco mayor que esto significa que el mapa estaba quieto: se empieza de nuevo. */
  maxGapMs?: number;
  onLow(fps: number): void;
}

export interface FpsMonitor {
  /** Un fotograma dibujado mientras el mapa se mueve o se anima. */
  frame(ts: number): void;
  /** El mapa se ha quedado quieto: la medida se reinicia. */
  pause(): void;
}

/**
 * Media de fps en ventanas de `windowMs` de actividad continua. Si una ventana completa queda por
 * debajo de `minFps`, avisa (una vez por ventana). Pura: el reloj lo pone quien llama.
 */
export function createFpsMonitor(o: FpsMonitorOptions): FpsMonitor {
  const maxGap = o.maxGapMs ?? 250;
  let start = -1;
  let last = -1;
  let frames = 0;
  return {
    frame(ts: number) {
      if (last >= 0 && ts - last > maxGap) start = -1;
      last = ts;
      if (start < 0) {
        start = ts;
        frames = 0;
        return;
      }
      frames++;
      const span = ts - start;
      if (span >= o.windowMs) {
        const fps = (frames * 1000) / span;
        start = ts;
        frames = 0;
        if (fps < o.minFps) o.onLow(fps);
      }
    },
    pause() {
      start = -1;
      last = -1;
      frames = 0;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Estado y API                                                                */
/* -------------------------------------------------------------------------- */

export interface QualityState {
  /** Lo que eligió la persona («auto» por defecto). */
  preference: QualityPreference;
  /** Nivel en uso. */
  level: QualityLevel;
  /** Lo que recomendó la detección (null hasta medir). */
  detected: QualityLevel | null;
  reason: QualityReason;
  settings: QualitySettings;
  capabilities: DeviceCapabilities | null;
  /** Bajadas automáticas en esta sesión. */
  downgrades: number;
  /** Último error de la capa WebGL (soporte: se ve con `?debug`). */
  lastError: string | null;
}

const CACHE_KEY = "fts:gfx:v1";
const CACHE_TTL_MS = 7 * 24 * 3_600_000;

interface CachedDetection {
  level: QualityLevel;
  reason: QualityReason;
  caps: DeviceCapabilities;
  at: number;
}

function readCache(now: number): CachedDetection | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedDetection | null;
    if (!c || !isQualityLevel(c.level) || typeof c.at !== "number" || now - c.at > CACHE_TTL_MS) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCache(c: CachedDetection) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: se volverá a medir */
  }
}

function urlOverride(): QualityLevel | null {
  try {
    const v = new URLSearchParams(window.location.search).get("gfx");
    return isQualityLevel(v) ? v : null;
  } catch {
    return null;
  }
}

type Listener = (s: QualityState) => void;

let detection: CachedDetection | null = null;
/** Tope de la sesión en modo automático (bajadas por fps). */
let sessionCap: QualityLevel = "alta";
let downgrades = 0;
let glBroken = false;
let lastError: string | null = null;
let state: QualityState | null = null;
const listeners = new Set<Listener>();
let prefsHooked = false;

function ensureDetection(): CachedDetection {
  if (detection) return detection;
  const now = Date.now();
  const cached = typeof window !== "undefined" ? readCache(now) : null;
  if (cached) {
    detection = cached;
    return cached;
  }
  const caps = measureDevice();
  const d = decideQuality(caps);
  detection = { level: d.level, reason: d.reason, caps, at: now };
  if (typeof window !== "undefined") writeCache(detection);
  return detection;
}

function compute(): QualityState {
  const preference = preferences.get().graphicsQuality ?? "auto";
  const det = ensureDetection();
  const forced = urlOverride();
  let level: QualityLevel;
  let reason: QualityReason;
  if (forced) {
    level = forced;
    reason = "url";
  } else if (preference !== "auto") {
    level = preference;
    reason = "manual";
  } else {
    level = minLevel(det.level, sessionCap);
    reason = rank(sessionCap) < rank(det.level) ? "fps" : det.reason;
  }
  if (glBroken && QUALITY_SETTINGS[level].webgl) {
    level = "ahorro";
    reason = "gl-error";
  }
  return {
    preference,
    level,
    detected: det.level,
    reason,
    settings: QUALITY_SETTINGS[level],
    capabilities: det.caps,
    downgrades,
    lastError,
  };
}

function refresh() {
  const prev = state;
  state = compute();
  if (
    !prev ||
    prev.level !== state.level ||
    prev.preference !== state.preference ||
    prev.reason !== state.reason ||
    prev.downgrades !== state.downgrades
  ) {
    const s = state;
    listeners.forEach((l) => l(s));
  }
}

function hookPreferences() {
  if (prefsHooked) return;
  prefsHooked = true;
  preferences.subscribe(() => {
    if (state && preferences.get().graphicsQuality !== state.preference) refresh();
  });
}

export const qualityApi = {
  /** Estado actual (la primera llamada mide el dispositivo si no hay medida guardada). */
  get(): QualityState {
    hookPreferences();
    if (!state) state = compute();
    return state;
  },
  subscribe(listener: Listener): () => void {
    hookPreferences();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Cambia la preferencia (se guarda con el resto de preferencias). */
  setPreference(p: QualityPreference) {
    preferences.set({ graphicsQuality: p });
    refresh();
  },
  /**
   * Fotogramas lentos sostenidos: en modo automático baja un nivel (como mucho
   * `GRAPHICS.fps.maxDowngrades` veces por sesión). Devuelve true si bajó.
   */
  reportLowFps(): boolean {
    const s = qualityApi.get();
    if (s.reason === "url" || s.preference !== "auto" || s.level === "ahorro") return false;
    if (downgrades >= GRAPHICS.fps.maxDowngrades) return false;
    sessionCap = lowerLevel(s.level);
    downgrades++;
    // La próxima visita empieza ya en el nivel que funcionó (hasta que caduque la medida).
    if (detection) {
      detection = { ...detection, level: minLevel(detection.level, sessionCap) };
      writeCache(detection);
    }
    refresh();
    return true;
  },
  /** La capa WebGL no pudo funcionar: el resto de la sesión se pinta con el canvas. */
  reportGlFailure(error?: unknown) {
    if (glBroken) return;
    glBroken = true;
    lastError = error instanceof Error ? error.message : error ? String(error) : "webgl";
    refresh();
  },
  /** Olvida la medida guardada y vuelve a medir. */
  redetect() {
    try {
      window.localStorage.removeItem(CACHE_KEY);
    } catch {
      /* noop */
    }
    detection = null;
    sessionCap = "alta";
    downgrades = 0;
    refresh();
  },
  settingsFor(level: QualityLevel): QualitySettings {
    return QUALITY_SETTINGS[level];
  },
};
