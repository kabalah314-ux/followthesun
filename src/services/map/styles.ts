import { MAP_CONFIG, OPEN_TILES } from "../../config";
import type { Theme } from "../../types";
import { BUILDINGS_QUERY_LAYER } from "../buildingService";
import type { Buildings3DMode, MapLike } from "./types";
import { log } from "../../lib/log";

/**
 * Estilos cartográficos de I Follow the Sun.
 *
 * Un único diseño editorial (crema cálido de día, azul medianoche de noche) construido sobre
 * dos esquemas vectoriales:
 *  · Mapbox Streets v8  → `createMapboxStyle`
 *  · OpenMapTiles       → `createOpenMapTilesStyle` (mapa abierto de respaldo)
 *
 * Los ids de capa son los mismos en ambos, así el tema, los edificios y la capa solar
 * funcionan igual con cualquier proveedor.
 */

export type StyleJSON = Record<string, any>;

export const MAPBOX_SOURCE = "composite";
export const OPENMAPTILES_SOURCE = "openmaptiles";

interface Palette {
  land: string;
  landcover: string;
  park: string;
  sand: string;
  water: string;
  building: string;
  buildingLine: string;
  building3d: string;
  building3dHigh: string;
  path: string;
  minor: string;
  minorCasing: string;
  major: string;
  majorCasing: string;
  motorway: string;
  motorwayCasing: string;
  label: string;
  labelHalo: string;
  waterLabel: string;
  parkLabel: string;
}

const PALETTE: Record<Theme, Palette> = {
  day: {
    land: "#f2ece0",
    landcover: "#e3e8d2",
    park: "#d6e3c2",
    sand: "#efe2c4",
    water: "#bbd4df",
    building: "#eadfcc",
    buildingLine: "#d9ccb5",
    building3d: "#dccbb3",
    building3dHigh: "#c7ae91",
    path: "#e6dcc9",
    minor: "#fdfaf4",
    minorCasing: "#e8dfcd",
    major: "#fffdf9",
    majorCasing: "#ddd0bb",
    motorway: "#fff6e6",
    motorwayCasing: "#d4c2a3",
    label: "#7b6f61",
    labelHalo: "rgba(242,236,224,0.92)",
    waterLabel: "#7896a5",
    parkLabel: "#7b8a63",
  },
  night: {
    land: "#141a33",
    landcover: "#18213d",
    park: "#1a2a43",
    sand: "#242b49",
    water: "#0d1730",
    building: "#1c2442",
    buildingLine: "#252f55",
    building3d: "#263153",
    building3dHigh: "#304064",
    path: "#222b4d",
    minor: "#2a3359",
    minorCasing: "#1b2340",
    major: "#343f6b",
    majorCasing: "#1b2340",
    motorway: "#46507d",
    motorwayCasing: "#1b2340",
    label: "#8f9bc4",
    labelHalo: "rgba(20,26,51,0.9)",
    waterLabel: "#5f77a8",
    parkLabel: "#6f86a8",
  },
};

/** Propiedades de color por capa (fuente única para crear el estilo y para cambiar de tema). */
function colorPaint(theme: Theme): Record<string, Record<string, any>> {
  const p = PALETTE[theme];
  return {
    background: { "background-color": p.land },
    landcover: { "fill-color": p.landcover },
    park: { "fill-color": p.park },
    sand: { "fill-color": p.sand },
    water: { "fill-color": p.water },
    waterway: { "line-color": p.water },
    buildings: { "fill-color": p.building, "fill-outline-color": p.buildingLine },
    // Los tejados altos son ligeramente más profundos que los edificios bajos: el relieve también
    // se lee por el tono, pero la diferencia sigue siendo editorial y monocromática.
    "buildings-3d": {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "height"]], ["to-number", ["get", "render_height"]], 9],
        3,
        p.building3d,
        24,
        p.building3d,
        70,
        p.building3dHigh,
        150,
        p.building3dHigh,
      ],
    },
    "road-path": { "line-color": p.path },
    "road-minor-casing": { "line-color": p.minorCasing },
    "road-minor": { "line-color": p.minor },
    "road-major-casing": { "line-color": p.majorCasing },
    "road-major": { "line-color": p.major },
    "road-motorway-casing": { "line-color": p.motorwayCasing },
    "road-motorway": { "line-color": p.motorway },
    "fallback-sea": { "fill-color": p.water },
    "fallback-coast": { "line-color": p.majorCasing },
    "label-water": { "text-color": p.waterLabel, "text-halo-color": p.water },
    "label-park": { "text-color": p.parkLabel, "text-halo-color": p.labelHalo },
    "label-city": { "text-color": p.label, "text-halo-color": p.labelHalo },
    "label-place": { "text-color": p.label, "text-halo-color": p.labelHalo },
    "label-road": { "text-color": p.label, "text-halo-color": p.labelHalo },
  };
}

/* -------------------------------------------------------------------------- */
/*  Expresiones y ayudas                                                        */
/* -------------------------------------------------------------------------- */

const polyGeom = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const lineGeom = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const inClass = (...c: string[]) => ["match", ["get", "class"], c, true, false];
const width = (...stops: number[]) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops];

const BUILDING_MIN_ZOOM = MAP_CONFIG.buildingMinZoom;

/* -------------------------------------------------------------------------- */
/*  Mapbox Streets v8                                                           */
/* -------------------------------------------------------------------------- */

const MB_FONT = ["DIN Pro Regular", "Arial Unicode MS Regular"];
const MB_FONT_BOLD = ["DIN Pro Bold", "Arial Unicode MS Bold"];
const MB_FONT_ITALIC = ["DIN Pro Italic", "Arial Unicode MS Regular"];

const MB_MINOR = ["street", "street_limited", "service", "track", "pedestrian"];
const MB_MAJOR = [
  "primary",
  "secondary",
  "tertiary",
  "trunk",
  "primary_link",
  "secondary_link",
  "tertiary_link",
  "trunk_link",
];
const MB_MOTORWAY = ["motorway", "motorway_link"];

export function createMapboxStyle(theme: Theme): StyleJSON {
  const c = colorPaint(theme);
  const S = MAPBOX_SOURCE;
  const notTunnel = ["!=", ["get", "structure"], "tunnel"];
  const notUnderground = ["!=", ["get", "underground"], "true"];
  const name = ["get", "name"];

  const layers: StyleJSON[] = [
    { id: "background", type: "background", paint: { ...c.background } },
    {
      id: "landcover",
      type: "fill",
      source: S,
      "source-layer": "landuse_overlay",
      filter: inClass("national_park", "wetland", "wetland_noveg"),
      paint: { ...c.landcover, "fill-opacity": 0.75 },
    },
    {
      id: "park",
      type: "fill",
      source: S,
      "source-layer": "landuse",
      filter: inClass("park", "grass", "pitch", "wood", "scrub", "golf_course", "cemetery", "playground"),
      paint: { ...c.park, "fill-opacity": 0.95 },
    },
    {
      id: "sand",
      type: "fill",
      source: S,
      "source-layer": "landuse",
      filter: inClass("sand"),
      paint: { ...c.sand },
    },
    {
      id: "water",
      type: "fill",
      source: S,
      "source-layer": "water",
      paint: { ...c.water, "fill-antialias": true },
    },
    {
      id: "waterway",
      type: "line",
      source: S,
      "source-layer": "waterway",
      minzoom: 12,
      filter: lineGeom,
      paint: { ...c.waterway, "line-width": 1.2 },
    },
    {
      id: "buildings",
      type: "fill",
      source: S,
      "source-layer": "building",
      minzoom: BUILDING_MIN_ZOOM,
      filter: notUnderground,
      paint: { ...c.buildings, "fill-opacity": 1, "fill-antialias": true },
    },
    {
      // Capa invisible que mantiene los edificios (con altura) consultables aunque se oculten.
      id: BUILDINGS_QUERY_LAYER,
      type: "fill",
      source: S,
      "source-layer": "building",
      minzoom: BUILDING_MIN_ZOOM,
      filter: ["all", notUnderground, ["==", ["get", "extrude"], "true"]],
      paint: { "fill-color": "#000000", "fill-opacity": 0 },
    },
    {
      id: "road-path",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 14,
      filter: ["all", lineGeom, inClass("path"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-path"], "line-width": width(14, 0.5, 18, 2.4) },
    },
    {
      id: "road-minor-casing",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 13,
      filter: ["all", lineGeom, inClass(...MB_MINOR), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-minor-casing"], "line-width": width(13, 1.2, 16, 4.2, 19, 15) },
    },
    {
      id: "road-minor",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 13,
      filter: ["all", lineGeom, inClass(...MB_MINOR), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-minor"], "line-width": width(13, 0.6, 16, 2.8, 19, 12.5) },
    },
    {
      id: "road-major-casing",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 10,
      filter: ["all", lineGeom, inClass(...MB_MAJOR), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-major-casing"], "line-width": width(10, 2, 13, 5, 16, 10, 19, 26) },
    },
    {
      id: "road-major",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 10,
      filter: ["all", lineGeom, inClass(...MB_MAJOR), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-major"], "line-width": width(10, 1, 13, 3.4, 16, 8, 19, 22) },
    },
    {
      id: "road-motorway-casing",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 8,
      filter: ["all", lineGeom, inClass(...MB_MOTORWAY), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-motorway-casing"], "line-width": width(8, 1.5, 13, 6, 16, 12, 19, 28) },
    },
    {
      id: "road-motorway",
      type: "line",
      source: S,
      "source-layer": "road",
      minzoom: 8,
      filter: ["all", lineGeom, inClass(...MB_MOTORWAY), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-motorway"], "line-width": width(8, 0.8, 13, 4, 16, 9.5, 19, 24) },
    },
    {
      // Los volúmenes aparecen automáticamente al acercar. Hasta entonces la vista es cartográfica.
      id: "buildings-3d",
      type: "fill-extrusion",
      source: S,
      "source-layer": "building",
      minzoom: MAP_CONFIG.buildings3DZoom - 0.35,
      filter: ["all", notUnderground, ["==", ["get", "extrude"], "true"]],
      layout: { visibility: "none" },
      paint: {
        ...c["buildings-3d"],
        "fill-extrusion-height": [
          "max",
          3,
          ["coalesce", ["to-number", ["get", "height"]], ["*", ["to-number", ["get", "levels"], 3], 3.2], 9],
        ],
        "fill-extrusion-base": ["max", 0, ["coalesce", ["to-number", ["get", "min_height"]], 0]],
        "fill-extrusion-opacity": [
          "interpolate", ["linear"], ["zoom"],
          14.95, 0, 15.35, 0.18, 16.1, 0.42, 17.4, 0.57
        ],
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "label-water",
      type: "symbol",
      source: S,
      "source-layer": "natural_label",
      filter: inClass("ocean", "sea", "bay"),
      layout: {
        "text-field": name,
        "text-font": MB_FONT_ITALIC,
        "text-size": 13,
        "text-letter-spacing": 0.25,
        "text-max-width": 8,
      },
      paint: { ...c["label-water"], "text-halo-width": 1, "text-opacity": 0.9 },
    },
    {
      id: "label-park",
      type: "symbol",
      source: S,
      "source-layer": "poi_label",
      minzoom: 14.3,
      filter: ["all", ["==", ["get", "class"], "park_like"], ["<=", ["get", "filterrank"], 3]],
      layout: {
        "text-field": name,
        "text-font": MB_FONT_ITALIC,
        "text-size": 11,
        "text-max-width": 7,
        "text-letter-spacing": 0.04,
      },
      paint: { ...c["label-park"], "text-halo-width": 1.4, "text-opacity": 0.95 },
    },
    {
      id: "label-city",
      type: "symbol",
      source: S,
      "source-layer": "place_label",
      maxzoom: 12.6,
      filter: ["all", ["==", ["get", "class"], "settlement"], ["match", ["get", "type"], ["city", "town"], true, false]],
      layout: {
        "text-field": name,
        "text-font": MB_FONT_BOLD,
        "text-size": 15,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.32,
      },
      paint: { ...c["label-city"], "text-halo-width": 1.6 },
    },
    {
      id: "label-place",
      type: "symbol",
      source: S,
      "source-layer": "place_label",
      minzoom: 11.8,
      filter: ["==", ["get", "class"], "settlement_subdivision"],
      layout: {
        "text-field": name,
        "text-font": MB_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
        "text-max-width": 7,
      },
      paint: { ...c["label-place"], "text-halo-width": 1.6, "text-opacity": 0.85 },
    },
    {
      id: "label-road",
      type: "symbol",
      source: S,
      "source-layer": "road",
      minzoom: 15,
      filter: ["all", lineGeom, ["has", "name"], inClass(...MB_MAJOR, ...MB_MINOR)],
      layout: {
        "symbol-placement": "line",
        "text-field": name,
        "text-font": MB_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 12.5],
        "text-letter-spacing": 0.04,
      },
      paint: { ...c["label-road"], "text-halo-width": 1.5, "text-opacity": 0.9 },
    },
  ];

  return {
    version: 8,
    name: "I Follow the Sun",
    projection: { name: "mercator" },
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    transition: { duration: 900, delay: 0 },
    sources: {
      [S]: { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
    },
    layers,
  };
}

/* -------------------------------------------------------------------------- */
/*  OpenMapTiles (OpenFreeMap) — mapa abierto de respaldo                       */
/* -------------------------------------------------------------------------- */

const OMT_FONT = ["Noto Sans Regular"];
const OMT_FONT_BOLD = ["Noto Sans Bold"];
const OMT_FONT_ITALIC = ["Noto Sans Italic"];

export function createOpenMapTilesStyle(theme: Theme): StyleJSON {
  const c = colorPaint(theme);
  const S = OPENMAPTILES_SOURCE;
  const notTunnel = ["!=", ["get", "brunnel"], "tunnel"];
  const nameField = ["coalesce", ["get", "name:latin"], ["get", "name"]];

  const layers: StyleJSON[] = [
    { id: "background", type: "background", paint: { ...c.background } },
    {
      id: "landcover",
      type: "fill",
      source: S,
      "source-layer": "landcover",
      filter: ["all", polyGeom, inClass("wood", "grass", "wetland")],
      paint: {
        ...c.landcover,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 13, 0.9],
      },
    },
    {
      id: "park",
      type: "fill",
      source: S,
      "source-layer": "park",
      filter: polyGeom,
      paint: { ...c.park, "fill-opacity": 0.95 },
    },
    {
      id: "sand",
      type: "fill",
      source: S,
      "source-layer": "landcover",
      filter: ["all", polyGeom, inClass("sand")],
      paint: { ...c.sand },
    },
    {
      id: "water",
      type: "fill",
      source: S,
      "source-layer": "water",
      filter: polyGeom,
      paint: { ...c.water, "fill-antialias": true },
    },
    {
      id: "waterway",
      type: "line",
      source: S,
      "source-layer": "waterway",
      minzoom: 12,
      filter: lineGeom,
      paint: { ...c.waterway, "line-width": 1.2 },
    },
    {
      id: "buildings",
      type: "fill",
      source: S,
      "source-layer": "building",
      minzoom: BUILDING_MIN_ZOOM,
      paint: { ...c.buildings, "fill-opacity": 1, "fill-antialias": true },
    },
    {
      // Capa invisible que mantiene los edificios consultables aunque se oculten.
      id: BUILDINGS_QUERY_LAYER,
      type: "fill",
      source: S,
      "source-layer": "building",
      minzoom: BUILDING_MIN_ZOOM,
      paint: { "fill-color": "#000000", "fill-opacity": 0 },
    },
    {
      id: "road-path",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["all", lineGeom, inClass("path"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-path"], "line-width": width(14, 0.5, 18, 2.4) },
    },
    {
      id: "road-minor-casing",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 13,
      filter: ["all", lineGeom, inClass("minor", "service", "track"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-minor-casing"], "line-width": width(13, 1.2, 16, 4.2, 19, 15) },
    },
    {
      id: "road-minor",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 13,
      filter: ["all", lineGeom, inClass("minor", "service", "track"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-minor"], "line-width": width(13, 0.6, 16, 2.8, 19, 12.5) },
    },
    {
      id: "road-major-casing",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 10,
      filter: ["all", lineGeom, inClass("primary", "secondary", "tertiary", "trunk"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-major-casing"], "line-width": width(10, 2, 13, 5, 16, 10, 19, 26) },
    },
    {
      id: "road-major",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 10,
      filter: ["all", lineGeom, inClass("primary", "secondary", "tertiary", "trunk"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-major"], "line-width": width(10, 1, 13, 3.4, 16, 8, 19, 22) },
    },
    {
      id: "road-motorway-casing",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 8,
      filter: ["all", lineGeom, inClass("motorway"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-motorway-casing"], "line-width": width(8, 1.5, 13, 6, 16, 12, 19, 28) },
    },
    {
      id: "road-motorway",
      type: "line",
      source: S,
      "source-layer": "transportation",
      minzoom: 8,
      filter: ["all", lineGeom, inClass("motorway"), notTunnel],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { ...c["road-motorway"], "line-width": width(8, 0.8, 13, 4, 16, 9.5, 19, 24) },
    },
    {
      // Relieve 3D editorial: entra gradualmente al acercar, con altura de las teselas OSM.
      id: "buildings-3d",
      type: "fill-extrusion",
      source: S,
      "source-layer": "building",
      minzoom: MAP_CONFIG.buildings3DZoom - 0.35,
      filter: ["!=", ["get", "hide_3d"], true],
      layout: { visibility: "none" },
      paint: {
        ...c["buildings-3d"],
        "fill-extrusion-height": ["max", 3, ["coalesce", ["to-number", ["get", "render_height"]], ["*", ["to-number", ["get", "render_min_height"], 2], 3.2], 9]],
        "fill-extrusion-base": ["max", 0, ["coalesce", ["to-number", ["get", "render_min_height"]], 0]],
        "fill-extrusion-opacity": [
          "interpolate", ["linear"], ["zoom"],
          14.95, 0, 15.35, 0.18, 16.1, 0.42, 17.4, 0.57
        ],
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "label-water",
      type: "symbol",
      source: S,
      "source-layer": "water_name",
      layout: {
        "text-field": nameField,
        "text-font": OMT_FONT_ITALIC,
        "text-size": 13,
        "text-letter-spacing": 0.25,
        "text-max-width": 8,
      },
      paint: { ...c["label-water"], "text-halo-width": 1, "text-opacity": 0.9 },
    },
    {
      id: "label-park",
      type: "symbol",
      source: S,
      "source-layer": "park",
      minzoom: 14.3,
      filter: ["has", "name"],
      layout: {
        "text-field": nameField,
        "text-font": OMT_FONT_ITALIC,
        "text-size": 11,
        "text-max-width": 7,
        "text-letter-spacing": 0.04,
      },
      paint: { ...c["label-park"], "text-halo-width": 1.4, "text-opacity": 0.95 },
    },
    {
      id: "label-city",
      type: "symbol",
      source: S,
      "source-layer": "place",
      maxzoom: 12.6,
      filter: inClass("city", "town"),
      layout: {
        "text-field": nameField,
        "text-font": OMT_FONT_BOLD,
        "text-size": 15,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.32,
      },
      paint: { ...c["label-city"], "text-halo-width": 1.6 },
    },
    {
      id: "label-place",
      type: "symbol",
      source: S,
      "source-layer": "place",
      minzoom: 11.8,
      filter: inClass("suburb", "neighbourhood", "quarter"),
      layout: {
        "text-field": nameField,
        "text-font": OMT_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
        "text-max-width": 7,
      },
      paint: { ...c["label-place"], "text-halo-width": 1.6, "text-opacity": 0.85 },
    },
    {
      id: "label-road",
      type: "symbol",
      source: S,
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: inClass("primary", "secondary", "tertiary", "minor", "trunk"),
      layout: {
        "symbol-placement": "line",
        "text-field": nameField,
        "text-font": OMT_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 12.5],
        "text-letter-spacing": 0.04,
      },
      paint: { ...c["label-road"], "text-halo-width": 1.5, "text-opacity": 0.9 },
    },
  ];

  return {
    version: 8,
    name: "I Follow the Sun · open",
    glyphs: OPEN_TILES.glyphs,
    transition: { duration: 900, delay: 0 },
    sources: {
      [S]: { type: "vector", url: OPEN_TILES.vectorSource },
    },
    layers,
  };
}

/* -------------------------------------------------------------------------- */
/*  Operaciones comunes sobre cualquier mapa                                    */
/* -------------------------------------------------------------------------- */

/** Cambia la paleta del mapa (transición suave gracias a `style.transition`). */
export function applyMapTheme(map: MapLike, theme: Theme) {
  for (const [layerId, props] of Object.entries(colorPaint(theme))) {
    if (!map.getLayer(layerId)) continue;
    for (const [prop, value] of Object.entries(props)) {
      try {
        map.setPaintProperty(layerId, prop, value);
      } catch (error) {
        // Normal mientras el estilo termina de cargar; se reintenta en el siguiente cambio.
        log.debug("estilo aún no listo", layerId, prop, error);
      }
    }
  }
}

export function setFootprintsVisible(map: MapLike, visible: boolean) {
  try {
    if (map.getLayer("buildings")) map.setPaintProperty("buildings", "fill-opacity", visible ? 1 : 0);
  } catch (error) {
    log.debug("estilo aún no listo", error);
  }
}

const AUTO_EXTRUSION_OPACITY = [
  "interpolate", ["linear"], ["zoom"],
  14.95, 0, 15.35, 0.18, 16.1, 0.42, 17.4, 0.57,
];

export function setExtrusionEnabled(map: MapLike, mode: Buildings3DMode) {
  try {
    if (map.getLayer("buildings-3d")) {
      map.setLayoutProperty("buildings-3d", "visibility", mode === "off" ? "none" : "visible");
      if (mode === "auto") {
        map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", AUTO_EXTRUSION_OPACITY);
      } else if (mode === "on") {
        map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", 0.72);
      }
    }
  } catch (error) {
    log.debug("estilo aún no listo", error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapa base de respaldo (solo si las teselas vectoriales no están disponibles) */
/* -------------------------------------------------------------------------- */

const SEA_RING: Array<[number, number]> = [
  [1.9, 41.238],
  [1.97, 41.262],
  [2.03, 41.278],
  [2.08, 41.286],
  [2.12, 41.296],
  [2.145, 41.32],
  [2.158, 41.336],
  [2.172, 41.347],
  [2.183, 41.36],
  [2.186, 41.372],
  [2.196, 41.3775],
  [2.199, 41.384],
  [2.206, 41.3895],
  [2.211, 41.395],
  [2.2175, 41.4],
  [2.2215, 41.406],
  [2.229, 41.4115],
  [2.2335, 41.4165],
  [2.245, 41.433],
  [2.26, 41.448],
  [2.28, 41.465],
  [2.3, 41.478],
  [2.6, 41.6],
  [2.6, 41.1],
  [1.8, 41.1],
  [1.9, 41.238],
];

export function installFallbackBasemap(map: MapLike, theme: Theme) {
  if (map.getSource("fts-fallback")) return;
  const p = PALETTE[theme];
  map.addSource("fts-fallback", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [SEA_RING] } },
      ],
    },
  });
  map.addLayer({
    id: "fallback-sea",
    type: "fill",
    source: "fts-fallback",
    paint: { "fill-color": p.water },
  });
  map.addLayer({
    id: "fallback-coast",
    type: "line",
    source: "fts-fallback",
    paint: { "line-color": p.majorCasing, "line-width": 1.6 },
  });
}
