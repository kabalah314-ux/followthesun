import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAP_CONFIG, getMapboxToken } from "../../config";
import { mapboxAreaName, mapboxPlaceName } from "./names";
import {
  MAPBOX_SOURCE,
  applyMapTheme,
  createMapboxStyle,
  installFallbackBasemap,
  setExtrusionEnabled,
  setFootprintsVisible,
} from "./styles";
import type { MapLike, MapProvider, MarkerLike } from "./types";

/**
 * Proveedor Mapbox GL JS — usa Mapbox Streets v8 con el estilo propio de I Follow the Sun.
 * Requiere un token público (ver `getMapboxToken` en src/config.ts).
 */
export const mapboxProvider: MapProvider = {
  id: "mapbox",
  label: "Mapbox GL JS",
  sourceId: MAPBOX_SOURCE,

  create({ container, theme }) {
    const map = new mapboxgl.Map({
      accessToken: getMapboxToken() ?? "",
      container,
      style: createMapboxStyle(theme) as any,
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
      projection: "mercator",
      renderWorldCopies: false,
      dragPan: true,
      scrollZoom: true,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      attributionControl: false,
      fadeDuration: 200,
    });
    // Atribución compacta (obligatoria) y logotipo de Mapbox en su posición por defecto.
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    return map as unknown as MapLike;
  },

  destroy(map) {
    (map as unknown as mapboxgl.Map).remove();
  },

  createMarker(map, element, lngLat) {
    return new mapboxgl.Marker({ element, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map as unknown as mapboxgl.Map) as unknown as MarkerLike;
  },

  applyTheme: applyMapTheme,
  setBuildingsVisible: setFootprintsVisible,
  setBuildings3D: setExtrusionEnabled,
  installFallback: installFallbackBasemap,
  getPlaceName: mapboxPlaceName,
  getAreaName: mapboxAreaName,
};
