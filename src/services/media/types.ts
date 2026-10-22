/**
 * Imágenes reales de un lugar para la ficha (pestañas Foto y 360°).
 *
 * Solo fuentes abiertas que permiten usarse junto a un mapa que no es de Google y con atribución:
 * Wikimedia Commons, Panoramax y, si se configura un token, Mapillary. Google Street View y las fotos
 * de Google Places quedan fuera: sus condiciones para el EEE prohíben usarlas con cualquier mapa.
 */

export type MediaKind = "photo" | "pano";
export type MediaProviderId = "commons" | "panoramax" | "mapillary";

export interface MediaItem {
  /** Único: «proveedor:id». */
  id: string;
  kind: MediaKind;
  provider: MediaProviderId;
  /** Imagen para la ficha (unos 1.024–1.280 px de ancho; en 360°, la equirectangular). */
  url: string;
  /** Miniatura (≤ 400 px). */
  thumbUrl: string;
  /** Imagen grande u original para la galería, si la fuente la da. */
  fullUrl?: string;
  width?: number;
  height?: number;
  title?: string;
  /** Autor tal y como lo da la fuente. */
  author: string;
  /** Licencia legible: «CC BY-SA 4.0», «CC0», «Public domain»… */
  license: string;
  licenseUrl?: string;
  /** Página de la imagen en su fuente: el enlace obligatorio de la atribución. */
  sourceUrl: string;
  /** Fecha de la toma (ISO o AAAA-MM-DD), si se conoce. */
  capturedAt?: string;
  /** Metros entre el punto de la toma y el lugar. */
  distanceM: number;
  /** Rumbo de la cámara en grados (0 = norte), si se conoce. */
  heading?: number;
  /** Puntuación interna para ordenar (más alta, mejor). */
  score: number;
}

/** Lo mínimo de un lugar para buscarle imágenes. */
export interface MediaTarget {
  id: string;
  name?: string;
  /** Tipo de lugar de la app (beach, park, square, terrace…) o categoría del local (cafe, bar…). */
  type?: string;
  latitude: number;
  longitude: number;
  /** Radio aproximado del lugar en metros (áreas grandes como parques). */
  radiusM?: number;
}

export interface PlaceMediaResult {
  photos: MediaItem[];
  panos: MediaItem[];
  /** Momento de la consulta (ms desde 1970). */
  fetchedAt: number;
}

export interface MediaFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
