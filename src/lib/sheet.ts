/**
 * Hoja inferior de tres alturas (guía maestra 2): la geometría y la física, sin DOM.
 *
 *   asomada  ~120 px   la frase-respuesta y el asa
 *   media    ~45 %     «Para ti» o la tarjeta del lugar
 *   completa ~90 %     la ficha entera, colecciones o resultados
 *
 * Las alturas son la parte VISIBLE de la hoja por encima de la barra de navegación: es el relleno
 * inferior que se da a la cámara del mapa para que lo elegido quede en la zona visible.
 */

export type SheetLevel = "peek" | "half" | "full";
export const SHEET_LEVELS: readonly SheetLevel[] = ["peek", "half", "full"];

export const SHEET = {
  peekPx: 120,
  halfRatio: 0.45,
  fullRatio: 0.9,
  /** Separación mínima entre dos niveles (pantallas muy bajas). */
  minGapPx: 56,
  /** Velocidad (px/ms) a partir de la cual un gesto cuenta como «lanzar» y avanza un nivel. */
  flickVelocity: 0.5,
  /** Cuánto se proyecta el gesto al soltar (inercia), en ms. */
  projectionMs: 200,
  /** Ventana de muestras para medir la velocidad al soltar. */
  velocityWindowMs: 100,
} as const;

export interface SheetHeights {
  peek: number;
  half: number;
  full: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Alturas visibles de cada nivel. `bottomPx`: lo que ocupa abajo la barra de navegación (con el
 * área segura); `topPx`: lo mínimo que se deja libre arriba (área segura y un margen).
 */
export function sheetHeights(viewportH: number, bottomPx = 0, topPx = 0): SheetHeights {
  const avail = Math.max(0, viewportH - bottomPx - topPx);
  const full = Math.round(clamp(viewportH * SHEET.fullRatio - bottomPx, 0, avail));
  const peek = Math.round(Math.min(SHEET.peekPx, full / 3));
  const halfWanted = Math.round(viewportH * SHEET.halfRatio);
  const half = Math.round(clamp(halfWanted, Math.min(full, peek + SHEET.minGapPx), Math.max(peek, full - SHEET.minGapPx)));
  return { peek, half, full };
}

/** El nivel cuya altura está más cerca de `height`. */
export function nearestLevel(height: number, h: SheetHeights): SheetLevel {
  let best: SheetLevel = "peek";
  let bestD = Infinity;
  for (const l of SHEET_LEVELS) {
    const d = Math.abs(h[l] - height);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

/** Un nivel más arriba (1) o más abajo (−1), sin salirse. */
export function stepLevel(level: SheetLevel, dir: 1 | -1): SheetLevel {
  const i = SHEET_LEVELS.indexOf(level);
  return SHEET_LEVELS[clamp(i + dir, 0, SHEET_LEVELS.length - 1)];
}

/**
 * Nivel al soltar la hoja. Inercia: la altura se proyecta con la velocidad del gesto y se elige el
 * nivel más cercano a esa proyección; un gesto rápido («lanzar») avanza al menos un nivel en su
 * dirección. `velocity` en px/ms, positiva si la hoja crece (dedo hacia arriba).
 */
export function snapLevel(height: number, velocity: number, from: SheetLevel, h: SheetHeights): SheetLevel {
  const projected = height + velocity * SHEET.projectionMs;
  let target = nearestLevel(projected, h);
  if (Math.abs(velocity) >= SHEET.flickVelocity) {
    const dir: 1 | -1 = velocity > 0 ? 1 : -1;
    const next = stepLevel(from, dir);
    if (dir > 0 && h[target] < h[next]) target = next;
    if (dir < 0 && h[target] > h[next]) target = next;
  }
  return target;
}

export interface DragSample {
  /** ms */
  t: number;
  /** clientY del dedo (px). */
  y: number;
}

/**
 * Velocidad al soltar (px/ms, positiva = la hoja crece) con las muestras de los últimos
 * `velocityWindowMs`: así un gesto que se para antes de soltar no «lanza» la hoja.
 */
export function releaseVelocity(samples: readonly DragSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > SHEET.velocityWindowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (first.y - last.y) / dt;
}

/** Resistencia elástica al pasarse de los límites: cuanto más se estira, menos avanza. */
export function rubberBand(height: number, min: number, max: number): number {
  if (height > max) return max + Math.sqrt(height - max) * 4;
  if (height < min) return min - Math.sqrt(min - height) * 4;
  return height;
}

/** Duración de la animación hasta el nivel (ms): más corta si el gesto ya iba rápido. */
export function settleDuration(distancePx: number, velocity: number): number {
  const d = Math.abs(distancePx);
  const v = Math.abs(velocity);
  if (d < 1) return 0;
  const base = 180 + Math.min(240, d * 0.6);
  return Math.round(v > 0.05 ? clamp(d / v, 160, base) : base);
}

export const isSheetLevel = (v: unknown): v is SheetLevel => v === "peek" || v === "half" || v === "full";
