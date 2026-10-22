import type { SunPlaceType } from "../types";

/**
 * Gusto aprendido sin cuenta (guía maestra 2, «Personalización sin cuenta»): contadores por tipo de
 * lugar de lo que la persona abre (1) y guarda (3). Ajusta el orden de «Para ti» como mucho un
 * ±10 %, nunca sale del dispositivo y se borra desde Mis sitios. Lógica pura.
 */

export interface TasteProfile {
  v: 1;
  counts: Partial<Record<SunPlaceType, number>>;
  total: number;
}

export const EMPTY_TASTE: TasteProfile = { v: 1, counts: {}, total: 0 };

/** Tipos de lugar que se cuentan (los que tienen sentido como destino). */
const KINDS = 10;

export function recordTaste(p: TasteProfile, type: SunPlaceType, weight = 1): TasteProfile {
  return { v: 1, counts: { ...p.counts, [type]: (p.counts[type] ?? 0) + weight }, total: p.total + weight };
}

/**
 * Factor de orden para un tipo de lugar: 1 sin historia (todos iguales); hasta 1,1 para lo que más
 * se abre y hasta 0,9 para lo que nunca se abre.
 */
export function tasteFactor(p: TasteProfile, type: SunPlaceType): number {
  if (p.total < 3) return 1;
  const prior = 1 / KINDS;
  const share = ((p.counts[type] ?? 0) + prior) / (p.total + 1);
  return 1 + 0.1 * Math.tanh(3 * (share - prior));
}

export function sanitizeTaste(v: unknown): TasteProfile {
  if (!v || typeof v !== "object") return EMPTY_TASTE;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || !o.counts || typeof o.counts !== "object") return EMPTY_TASTE;
  const counts: Partial<Record<SunPlaceType, number>> = {};
  let total = 0;
  for (const [k, n] of Object.entries(o.counts as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      counts[k as SunPlaceType] = n;
      total += n;
    }
  }
  return { v: 1, counts, total };
}
