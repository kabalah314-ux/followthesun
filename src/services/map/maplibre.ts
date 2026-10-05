import { AttributionControl, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_CONFIG } from "../../config";
import { openMapTilesAreaName, openMapTilesPlaceName } from "./names";
import {
  OPENMAPTILES_SOURCE,
  applyMapTheme,
  createOpenMapTilesStyle,
  installFallbackBasemap,
  setExtrusionEnabled,
  setFootprintsVisible,
} from "./styles";
import type { MapLike, MapProvider, MarkerLike } from "./types";

/**
 * Proveedor abierto (MapLibre GL + OpenFreeMap) — mismo diseño, sin token.
 * Se usa cuando no hay token de Mapbox o cuando Mapbox lo rechaza.
 */
export const maplibreProvider: MapProvider = {
  id: "maplibre",
  label: "MapLibre GL · OpenFreeMap",
  sourceId: OPENMAPTILES_SOURCE,

  create({ container, theme }) {
    const map = new MapLibreMap({
      container,
      style: createOpenMapTilesStyle(theme) as unknown as StyleSpecification,
      center: MAP_CONFIG.center,
      zoom: MAP_CONFIG.introZoom,
      minZoom: MAP_CONFIG.minZoom,
      maxZoom: MAP_CONFIG.maxZoom,
      maxBounds: MAP_CONFIG.maxBounds,
      maxPitch: MAP_CONFIG.maxPitch,
      // Un arrastre corto no se interpreta como una selección de punto.
      clickTolerance: 6,
      pitch: 0,
      bearing: 0,
      renderWorldCopies: false,
      dragPan: true,
      scrollZoom: true,
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

  applyTheme: applyMapTheme,
  setBuildingsVisible: setFootprintsVisible,
  setBuildings3D: setExtrusionEnabled,
  installFallback: installFallbackBasemap,
  getPlaceName: openMapTilesPlaceName,
  getAreaName: openMapTilesAreaName,
};
