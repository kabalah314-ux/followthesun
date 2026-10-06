import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CONFIG } from "../../config";
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

  // Sin token no hay imagen de Mapbox: se usa Esri World Imagery, que no requiere clave.
  createStyle(theme: Theme, satellite: boolean) {
    const base = styles.createOpenMapTilesStyle(theme);
    return satellite ? styles.createSatelliteStyle(base, theme, "esri") : base;
  },

  async create({ container, theme, satellite }) {
    const map = new MapLibreMap({
      container,
      style: this.createStyle(theme, !!satellite) as unknown as StyleSpecification,
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.introZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      maxPitch: MAP_CONFIG.maxPitch,
      pitch: 0,
      bearing: 0,
      renderWorldCopies: false,
      dragRotate: true,
      pitchWithRotate: true,
      attributionControl: false,
      fadeDuration: 200,
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
