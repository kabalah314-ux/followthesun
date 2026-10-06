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
  /** Cambia el estilo en caliente (p. ej. a vista satélite) sin recrear el mapa. */
  setStyle(style: any): unknown;
  /** Luz de los edificios en 3D (ambas librerías la tienen). */
  setLight?(light: any, options?: any): unknown;
}

export interface MarkerLike {
  setLngLat(lngLat: [number, number]): MarkerLike;
  getElement(): HTMLElement;
  remove(): void;
}

export type MapProviderId = "mapbox" | "maplibre";

export interface CreateMapOptions {
  container: HTMLElement;
  theme: Theme;
  /** Empezar directamente en vista satélite. */
  satellite?: boolean;
}

export interface MapProvider {
  id: MapProviderId;
  label: string;
  /** Id de la fuente vectorial dentro del estilo (para detectar fallos de carga y refrescar edificios). */
  sourceId: string;
  /** Estilo completo: vectorial propio o vista satélite híbrida. */
  createStyle(theme: Theme, satellite: boolean): any;
  /** Puede ser asíncrono: el proveedor de Mapbox se descarga de su CDN solo si hay token. */
  create(options: CreateMapOptions): Promise<MapLike> | MapLike;
  destroy(map: MapLike): void;
  createMarker(map: MapLike, element: HTMLElement, lngLat: [number, number]): MarkerLike;
  applyTheme(map: MapLike, theme: Theme): void;
  /** Muestra u oculta las huellas de edificios (la capa invisible de consulta se mantiene). */
  setBuildingsVisible(map: MapLike, visible: boolean): void;
  /** Activa la capa 3D de edificios (preparada, apagada por defecto). */
  setBuildings3D(map: MapLike, enabled: boolean): void;
  /** Mapa base mínimo cuando las teselas vectoriales no están disponibles. */
  installFallback(map: MapLike, theme: Theme): void;
  getPlaceName(map: MapLike, lng: number, lat: number): string;
  getAreaName(map: MapLike, lng: number, lat: number, zoom: number): string;
}
