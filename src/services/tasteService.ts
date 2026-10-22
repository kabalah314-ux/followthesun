import { createLocalStore } from "../lib/localStore";
import { EMPTY_TASTE, recordTaste, sanitizeTaste, tasteFactor, type TasteProfile } from "../lib/taste";
import type { SunPlaceType } from "../types";

/** Gusto aprendido (ver `lib/taste.ts`): solo en este dispositivo; se borra desde Mis sitios. */
export const tasteStore = createLocalStore<TasteProfile>("fts:taste:v1", EMPTY_TASTE, sanitizeTaste);

/** Abrir una ficha cuenta 1; guardar un sitio, 3. */
export function learnTaste(type: SunPlaceType, weight = 1): void {
  tasteStore.set((p) => recordTaste(p, type, weight));
}

export const tasteOf = (type: SunPlaceType): number => tasteFactor(tasteStore.get(), type);
