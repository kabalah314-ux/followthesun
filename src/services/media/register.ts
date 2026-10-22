import { registerPanoramaViewer, registerPlaceMediaLoader, type MediaAttribution } from "../../lib/placeMedia";
import { getPlaceMedia, type MediaItem } from "./mediaService";
import { mountPanorama } from "./panoramaViewer";

/**
 * Conecta el servicio de imágenes abiertas con la ficha (`lib/placeMedia`): la mejor foto y, si la
 * hay, la mejor vista 360°, siempre con autor, licencia y enlace a la fuente.
 */

const SOURCE: Record<MediaItem["provider"], string> = {
  commons: "Wikimedia Commons",
  panoramax: "Panoramax",
  mapillary: "Mapillary",
};

const attributionOf = (m: MediaItem): MediaAttribution => ({
  author: m.author,
  license: m.license,
  source: SOURCE[m.provider],
  url: m.sourceUrl,
});

/** 360° vistos hace poco (el visor recibe solo el id). */
const panoramas = new Map<string, MediaItem>();

export function registerOpenMedia(): void {
  registerPlaceMediaLoader(async (s) => {
    const r = await getPlaceMedia({ id: s.id, name: s.name, type: s.type, latitude: s.latitude, longitude: s.longitude });
    const photo = r.photos[0] ?? null;
    const pano = r.panos[0] ?? null;
    if (pano) panoramas.set(pano.id, pano);
    return {
      photo: photo
        ? {
            url: photo.url,
            width: photo.width,
            height: photo.height,
            alt: photo.title,
            attribution: attributionOf(photo),
            takenAt: photo.capturedAt ? Date.parse(photo.capturedAt) || undefined : undefined,
          }
        : null,
      panorama: pano ? { provider: pano.provider, imageId: pano.id, attribution: attributionOf(pano) } : null,
    };
  });
  registerPanoramaViewer((el, pano) => {
    const item = panoramas.get(pano.imageId);
    if (!item) return () => {};
    return mountPanorama(el, item.url, { label: `360° · ${pano.attribution.source}` });
  });
}
