import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CONFIG } from "../../config";
import { qualityApi } from "../../graphics/quality";
import type { Theme } from "../../types";
import * as styles from "./styles";
import { openMapTilesAreaName, openMapTilesPlaceName } from "./names";
import type { MapLike, MapProvider, MarkerLike } from "./types";

/**
 * Proveedor abierto (MapLibre GL + OpenFreeMap) — mismo diseño, sin token.
 * Se usa cuando no hay token de Mapbox o cuando Mapbox lo rechaza.
 */

export const maplibreProvider: MapProvider = {
  id: "maplibre",
  label: "MapLibre GL · OpenFreeMap",
  sourceId: styles.OPENMAPTILES_SOURCE,

  // «Vista real»: ortofoto del ICGC (CC BY 4.0, sin clave, hasta zoom 20).
  createStyle(theme: Theme, satellite: boolean) {
    const base = styles.createOpenMapTilesStyle(theme);
    return satellite ? styles.createSatelliteStyle(base, theme, "icgc") : base;
  },

  async create({ container, theme, satellite }) {
    // Calidad gráfica: en Alta, antialias del propio mapa (bordes 3D nítidos); en Media/Ahorro se
    // limita la resolución (pixel ratio) para ir fluido. Medirlo aquí cuesta ~10-50 ms una vez.
    const q = qualityApi.get().settings;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const map = new MapLibreMap({
      container,
      style: this.createStyle(theme, !!satellite) as unknown as StyleSpecification,
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.introZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: Math.min(MAP_CONFIG.maxZoom, q.maxZoom),
      maxBounds: MAP_CONFIG.maxBounds,
      maxPitch: MAP_CONFIG.maxPitch,
      pitch: 0,
      bearing: 0,
      renderWorldCopies: false,
      dragRotate: true,
      pitchWithRotate: true,
      attributionControl: false,
      fadeDuration: 200,
      ...(dpr > q.maxPixelRatio ? { pixelRatio: q.maxPixelRatio } : {}),
      canvasContextAttributes: { antialias: q.level === "alta" },
    });
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    return map as unknown as MapLike;
  },

  destroy(map) {
    (map as unknown as MapLibreMap).remove();
  },

  createMarker(map, element, lngLat) {
    return new Marker({ element, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map as unknown as MapLibreMap) as unknown as MarkerLike;
  },

  applyTheme: styles.applyMapTheme,
  setBuildingsVisible: styles.setFootprintsVisible,
  setBuildings3D: styles.setExtrusionEnabled,
  installFallback: styles.installFallbackBasemap,
  getPlaceName: openMapTilesPlaceName,
  getAreaName: openMapTilesAreaName,
};
