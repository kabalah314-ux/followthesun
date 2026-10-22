import type { SunPlaceType } from "../types";

/**
 * Imágenes de un lugar para la ficha inmersiva (pestañas Foto y 360°). Este módulo solo define la
 * interfaz: el que sabe buscar fotos abiertas (Wikimedia Commons, Panoramax) o vistas 360°
 * (Mapillary, con token) se registra con `registerPlaceMediaLoader` / `registerPanoramaViewer`.
 * Sin nada registrado, la ficha enseña el 3D y un estado amable en las otras pestañas.
 * Nunca se usan imágenes de Google (sus condiciones lo prohíben sobre otro mapa).
 */

export interface MediaAttribution {
  /** «© Autor». */
  author: string;
  /** «CC BY-SA 4.0». */
  license: string;
  /** «Wikimedia Commons», «Panoramax», «Mapillary». */
  source: string;
  /** Página de la imagen (atribución enlazada). */
  url?: string;
}

export interface PlacePhoto {
  url: string;
  width?: number;
  height?: number;
  /** Texto alternativo para lectores de pantalla. */
  alt?: string;
  attribution: MediaAttribution;
  takenAt?: number;
}

export interface PlacePanorama {
  /** Proveedor que sabe pintarla (p. ej. «mapillary»). */
  provider: string;
  imageId: string;
  attribution: MediaAttribution;
}

export interface PlaceMediaResult {
  photo: PlacePhoto | null;
  panorama: PlacePanorama | null;
}

export interface PlaceMediaSubject {
  id: string;
  name: string;
  type: SunPlaceType;
  latitude: number;
  longitude: number;
  /** cafe, bar… (para afinar la búsqueda de fotos de un local). */
  category?: string;
}

export type PlaceMediaLoader = (subject: PlaceMediaSubject, signal: AbortSignal) => Promise<PlaceMediaResult>;

/** Pinta una vista 360° dentro de `el`; devuelve cómo desmontarla. */
export type PanoramaViewer = (el: HTMLElement, pano: PlacePanorama) => () => void;

let loader: PlaceMediaLoader | null = null;
let viewer: PanoramaViewer | null = null;
const listeners = new Set<() => void>();
let version = 0;

export function registerPlaceMediaLoader(l: PlaceMediaLoader | null): void {
  loader = l;
  version++;
  listeners.forEach((f) => f());
}

export function registerPanoramaViewer(v: PanoramaViewer | null): void {
  viewer = v;
  version++;
  listeners.forEach((f) => f());
}

export const placeMediaRegistry = {
  loader: () => loader,
  viewer: () => viewer,
  version: () => version,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
