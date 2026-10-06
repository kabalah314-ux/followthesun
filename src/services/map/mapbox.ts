import { MAP_CONFIG, getMapboxToken } from "../../config";
import type { Theme } from "../../types";
import * as styles from "./styles";
import { mapboxAreaName, mapboxPlaceName } from "./names";
import type { MapLike, MapProvider, MarkerLike } from "./types";

/**
 * Proveedor Mapbox GL JS — Mapbox Streets v8 con el estilo propio de Follow the Sun.
 *
 * La librería NO se empaqueta: se descarga del CDN de Mapbox la primera vez que hace falta (solo
 * si hay token). Eso deja el paquete ~1 MB más ligero, que es lo que más tarda en cargar.
 */

const CDN = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl";
const CSS_ID = "mapbox-gl-css";

/** Solo tipos: no genera código en el paquete. */
type MapboxGL = typeof import("mapbox-gl");

declare global {
  interface Window {
    mapboxgl?: MapboxGL;
  }
}

function ensureStyles() {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = `${CDN}.css`;
  document.head.appendChild(link);
}

let lib: MapboxGL | null = null;

/** Carga Mapbox GL JS desde su CDN (una sola vez). */
async function getLib(): Promise<MapboxGL> {
  if (lib) return lib;
  ensureStyles();
  if (!window.mapboxgl) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${CDN}.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Mapbox GL JS"));
      document.head.appendChild(script);
    });
  }
  lib = window.mapboxgl;
  if (!lib) throw new Error("Mapbox GL JS no disponible");
  return lib;
}

export const mapboxProvider: MapProvider = {
  id: "mapbox",
  label: "Mapbox GL JS",
  sourceId: styles.MAPBOX_SOURCE,

  // Con token de Mapbox se usa su imagen de satélite, la de mejor calidad.
  createStyle(theme: Theme, satellite: boolean) {
    const base = styles.createMapboxStyle(theme);
    return satellite ? styles.createSatelliteStyle(base, theme, "mapbox") : base;
  },

  async create({ container, theme, satellite }) {
    const gl = await getLib();
    const map = new gl.Map({
      accessToken: getMapboxToken() ?? "",
      container,
      style: this.createStyle(theme, !!satellite) as never,
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.introZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      maxPitch: MAP_CONFIG.maxPitch,
      pitch: 0,
      bearing: 0,
      projection: "mercator",
      renderWorldCopies: false,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      attributionControl: false,
      fadeDuration: 200,
    });
    // Atribución compacta (obligatoria) y logotipo de Mapbox en su posición por defecto.
    map.addControl(new gl.AttributionControl({ compact: true }), "bottom-right");
    return map as unknown as MapLike;
  },

  destroy(map) {
    (map as unknown as { remove(): void }).remove();
  },

  createMarker(map, element, lngLat) {
    const gl = lib as MapboxGL;
    return new gl.Marker({ element, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map as never) as unknown as MarkerLike;
  },

  applyTheme: styles.applyMapTheme,
  setBuildingsVisible: styles.setFootprintsVisible,
  setBuildings3D: styles.setExtrusionEnabled,
  installFallback: styles.installFallbackBasemap,
  getPlaceName: mapboxPlaceName,
  getAreaName: mapboxAreaName,
};
