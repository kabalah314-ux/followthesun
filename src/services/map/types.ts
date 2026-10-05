import type { Theme } from "../../types";

/**
 * Contrato mínimo de mapa que usa el resto de la aplicación.
 * Mapbox GL JS y MapLibre GL JS lo cumplen; la capa solar, los marcadores y los servicios
 * dependen solo de esta interfaz, nunca de una librería concreta.
 */
export interface MapLike {
  getCanvas(): HTMLCanvasElement;
  getContainer(): HTMLElement;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  project(lngLat: [number, number]): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
  on(type: string, listener: (e: any) => void): unknown;
  off(type: string, listener: (e: any) => void): unknown;
  once(type: string, listener: (e: any) => void): unknown;
  queryRenderedFeatures(geometry?: any, options?: any): any[];
  querySourceFeatures(sourceId: string, options?: any): any[];
  getLayer(id: string): unknown;
  getSource(id: string): unknown;
  addSource(id: string, source: any): unknown;
  addLayer(layer: any, beforeId?: string): unknown;
  setPaintProperty(layerId: string, name: string, value: unknown): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
  easeTo(options: any): unknown;
  flyTo(options: any): unknown;
  fitBounds(bounds: any, options?: any): unknown;
  zoomIn(options?: any): unknown;
  zoomOut(options?: any): unknown;
}

export interface MarkerLike {
  setLngLat(lngLat: [number, number]): MarkerLike;
  getElement(): HTMLElement;
  remove(): void;
}

export type MapProviderId = "mapbox" | "maplibre";
export type Buildings3DMode = "off" | "auto" | "on";

export interface CreateMapOptions {
  container: HTMLElement;
  theme: Theme;
}

export interface MapProvider {
  id: MapProviderId;
  label: string;
  /** Id de la fuente vectorial dentro del estilo (para detectar fallos de carga y refrescar edificios). */
  sourceId: string;
  create(options: CreateMapOptions): MapLike;
  destroy(map: MapLike): void;
  createMarker(map: MapLike, element: HTMLElement, lngLat: [number, number]): MarkerLike;
  applyTheme(map: MapLike, theme: Theme): void;
  /** Muestra u oculta las huellas de edificios (la capa invisible de consulta se mantiene). */
  setBuildingsVisible(map: MapLike, visible: boolean): void;
  /** Apaga, activa automáticamente al acercar o fuerza la capa 3D de edificios. */
  setBuildings3D(map: MapLike, mode: Buildings3DMode): void;
  /** Mapa base mínimo cuando las teselas vectoriales no están disponibles. */
  installFallback(map: MapLike, theme: Theme): void;
  getPlaceName(map: MapLike, lng: number, lat: number): string;
  getAreaName(map: MapLike, lng: number, lat: number, zoom: number): string;
}
