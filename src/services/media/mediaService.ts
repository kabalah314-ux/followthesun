import { TtlCache } from "../../lib/cache";
import { commonsPhotos } from "./commons";
import { mapillaryImages } from "./mapillary";
import { panoramaxImages } from "./panoramax";
import { dedupeMedia } from "./scoring";
import type { MediaFetchOptions, MediaItem, MediaTarget, PlaceMediaResult } from "./types";

export type { MediaItem, MediaKind, MediaProviderId, MediaTarget, PlaceMediaResult } from "./types";
export { attributionLabel } from "./scoring";

/**
 * Imágenes reales de un lugar para la ficha: fotos (Commons, Panoramax, Mapillary) y 360°
 * (Panoramax o Mapillary), ordenadas por relevancia y guardadas 7 días en el dispositivo.
 * Si no hay ninguna, la ficha enseña el 3D del propio mapa (que siempre está).
 */

const MAPILLARY_TOKEN = ((import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined) ?? "").trim();

export const mediaConfig = {
  /** La pestaña 360° solo existe si hay token de Mapillary o alguna fuente devuelve un 360°. */
  mapillaryEnabled: MAPILLARY_TOKEN !== "",
  maxPhotos: 8,
  maxPanos: 3,
};

const cache = new TtlCache<PlaceMediaResult>({
  namespace: "fts:media",
  ttlMs: 7 * 24 * 3_600_000,
  maxStaleMs: 30 * 24 * 3_600_000,
  version: 1,
  persist: true,
});

const keyOf = (t: MediaTarget) => t.id || `${t.latitude.toFixed(5)},${t.longitude.toFixed(5)}`;
const byScore = (a: MediaItem, b: MediaItem) => b.score - a.score;

export interface PlaceMediaOptions extends MediaFetchOptions {
  /** Ignora la caché. */
  force?: boolean;
  /** Token de Mapillary (por defecto, `VITE_MAPILLARY_TOKEN`). */
  mapillaryToken?: string;
}

/** Lo que haya en caché, sin red (para pintar al instante al abrir la ficha). */
export function peekPlaceMedia(target: MediaTarget): PlaceMediaResult | null {
  return cache.getAllowStale(keyOf(target))?.value ?? null;
}

export async function getPlaceMedia(target: MediaTarget, opts: PlaceMediaOptions = {}): Promise<PlaceMediaResult> {
  const key = keyOf(target);
  if (!opts.force) {
    const hit = cache.get(key);
    if (hit) return hit.value;
  }
  const token = opts.mapillaryToken ?? MAPILLARY_TOKEN;
  const settled = await Promise.allSettled([
    commonsPhotos(target, opts),
    panoramaxImages(target, opts),
    token ? mapillaryImages(target, token, opts) : Promise.resolve([] as MediaItem[]),
  ]);
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const result: PlaceMediaResult = {
    photos: dedupeMedia(all.filter((m) => m.kind === "photo").sort(byScore)).slice(0, mediaConfig.maxPhotos),
    panos: dedupeMedia(all.filter((m) => m.kind === "pano").sort(byScore)).slice(0, mediaConfig.maxPanos),
    fetchedAt: Date.now(),
  };
  if (settled.some((r) => r.status === "fulfilled")) cache.set(key, result);
  else {
    // Todo falló (sin red): mejor lo antiguo que nada.
    const stale = cache.getAllowStale(key);
    if (stale) return stale.value;
  }
  return result;
}
