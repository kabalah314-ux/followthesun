import type { MapLike } from "../services/map/types";
import { createDayAnimation, type DayAnimationOptions } from "./dayAnimation";

/**
 * Graba «el día en 12 segundos» como vídeo (sin servidor): el mapa (con la luz y las sombras de la
 * GPU), el canvas de encima (trayectoria, zonas destacadas) y un rótulo con la hora.
 *
 * Cada fotograma se copia justo después de que el mapa lo dibuje (evento `render`), cuando el
 * búfer de WebGL aún es válido: no hace falta `preserveDrawingBuffer` (que costaría rendimiento).
 * Formato: MP4 (H.264) si el navegador sabe grabarlo (Safari, Chrome reciente); si no, WebM.
 */

export const VIDEO_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

/** Primer formato que el navegador sabe grabar (MP4 antes que WebM). */
export function pickVideoMimeType(isSupported: (mime: string) => boolean): string | null {
  for (const t of VIDEO_MIME_CANDIDATES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* navegador que lanza con tipos desconocidos */
    }
  }
  return null;
}

export const videoFileExtension = (mime: string): "mp4" | "webm" => (mime.startsWith("video/mp4") ? "mp4" : "webm");

/** ¿Se puede grabar vídeo en este navegador? */
export function canRecordVideo(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickVideoMimeType((t) => MediaRecorder.isTypeSupported(t)) !== null
  );
}

export interface RecordDayVideoOptions extends Pick<DayAnimationOptions, "getRange" | "scrub" | "durationMs" | "easing"> {
  /** Canvas de encima del mapa (`engine.getOverlayCanvas()`). */
  overlayCanvas?: HTMLCanvasElement | null;
  /** Rótulo de cada fotograma (p. ej. «14:30 · Plaça del Sol»). */
  label?(timeMs: number): string;
  /** Marca, abajo a la derecha (por defecto «I Follow the Sun»). */
  brand?: string;
  fps?: number;
  /** Ancho máximo del vídeo (px). */
  maxWidth?: number;
  bitsPerSecond?: number;
  signal?: AbortSignal;
  onProgress?(progress: number): void;
}

const even = (n: number) => Math.max(2, n - (n % 2));

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCaption(ctx: CanvasRenderingContext2D, W: number, H: number, text: string | undefined, brand: string) {
  const s = Math.max(1, W / 900);
  const pad = 14 * s;
  ctx.save();
  if (text) {
    ctx.font = `600 ${Math.round(17 * s)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const tw = ctx.measureText(text).width;
    const bh = 34 * s;
    const bw = tw + 26 * s;
    const x = pad;
    const y = H - pad - bh;
    ctx.fillStyle = "rgba(31, 28, 38, 0.72)";
    roundRect(ctx, x, y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "#fff8ec";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 13 * s, y + bh / 2 + 0.5);
  }
  ctx.font = `600 ${Math.round(12 * s)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(31, 28, 38, 0.55)";
  ctx.fillText(brand, W - pad + 1, H - pad + 1);
  ctx.fillStyle = "rgba(255, 248, 236, 0.92)";
  ctx.fillText(brand, W - pad, H - pad);
  ctx.restore();
}

/** Graba la animación del día y devuelve el vídeo (MP4 o WebM). */
export async function recordDayVideo(map: MapLike, o: RecordDayVideoOptions): Promise<Blob> {
  if (!canRecordVideo()) throw new Error("recording-unsupported");
  const mime = pickVideoMimeType((t) => MediaRecorder.isTypeSupported(t))!;
  const src = map.getCanvas();
  const scale = Math.min(1, (o.maxWidth ?? 1280) / Math.max(1, src.width));
  const W = even(Math.round(src.width * scale));
  const H = even(Math.round(src.height * scale));
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("recording-unsupported");

  const stream = out.captureStream(o.fps ?? 30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.bitsPerSecond ?? 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  let currentTime = 0;
  const brand = o.brand ?? "I Follow the Sun";
  const compose = () => {
    try {
      ctx.drawImage(src, 0, 0, W, H);
      if (o.overlayCanvas) ctx.drawImage(o.overlayCanvas, 0, 0, W, H);
      drawCaption(ctx, W, H, currentTime ? o.label?.(currentTime) : undefined, brand);
    } catch {
      /* fotograma perdido: el siguiente lo repone */
    }
  };
  map.on("render", compose);

  const anim = createDayAnimation({
    getRange: o.getRange,
    durationMs: o.durationMs,
    easing: o.easing,
    scrub: (t) => {
      currentTime = t;
      o.scrub(t);
      map.triggerRepaint?.();
    },
    onFrame: ({ progress }) => o.onProgress?.(progress),
  });
  const abort = () => anim.stop();
  o.signal?.addEventListener("abort", abort);

  // Primer fotograma ya compuesto antes de grabar: el vídeo no empieza en negro.
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 500);
    map.once("render", () => {
      window.clearTimeout(timer);
      resolve();
    });
    map.triggerRepaint?.();
  });
  recorder.start(250);
  try {
    await anim.play();
    // Un último fotograma con la hora final.
    map.triggerRepaint?.();
    await new Promise((r) => setTimeout(r, 160));
  } finally {
    o.signal?.removeEventListener("abort", abort);
    map.off("render", compose);
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
  }
  if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
  return new Blob(chunks, { type: mime.split(";")[0] });
}
