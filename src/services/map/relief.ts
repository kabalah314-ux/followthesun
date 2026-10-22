import type { Theme } from "../../types";
import type { MapLike } from "./types";

/**
 * Relieve sombreado (guía 2, Fase C4) con la luz del sol de la hora elegida. Solo en calidad Alta.
 *
 * Modelo del terreno abierto de Mapterhorn (teselas terrarium de 512 px; en España sale del
 * MDT02/MDT05 del IGN–CNIG, CC BY 4.0, y del Copernicus GLO-30 en el resto). Se usa hasta el zoom 12,
 * que tiene cobertura mundial garantizada; por encima MapLibre lo amplía: para un sombreado suave
 * de Montjuïc, Collserola o las pendientes de Gràcia no hace falta más, y no hay peticiones fallidas.
 *
 * Va encima del suelo (usos, parques, agua) y debajo de calles, edificios, la capa solar y los
 * rótulos. El método «standard» solo sombrea pendientes: el llano queda intacto. Ese método no usa
 * la altura de la luz, así que la altura del sol se traduce en intensidad (sol bajo, relieve marcado).
 */

export const DEM_SOURCE_ID = "fts-dem";
export const HILLSHADE_LAYER_ID = "fts-hillshade";

export const DEM = {
  tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
  tileSize: 512,
  encoding: "terrarium",
  maxzoom: 12,
  attribution: '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>',
} as const;

/** Por encima de este zoom el relieve ya no aporta (la ciudad se lee calle a calle). */
const HILLSHADE_MAX_ZOOM = 18.5;

export interface ReliefSun {
  /** Azimut desde el norte (horario) y altitud, en grados. */
  azimuthDeg: number;
  altitudeDeg: number;
}

export function demSource(): Record<string, unknown> {
  return {
    type: "raster-dem",
    tiles: [...DEM.tiles],
    tileSize: DEM.tileSize,
    encoding: DEM.encoding,
    maxzoom: DEM.maxzoom,
    attribution: DEM.attribution,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Pintura del sombreado: luz desde el sol (de noche, la cartográfica de siempre y muy tenue). */
export function hillshadePaint(sun: ReliefSun, theme: Theme): Record<string, unknown> {
  const night = theme === "night" || sun.altitudeDeg < -1;
  const az = ((sun.azimuthDeg % 360) + 360) % 360;
  const dir = night ? 335 : (Math.round(az / 2) * 2) % 360;
  const alt = Math.min(90, Math.max(0, sun.altitudeDeg));
  const low = night ? 0 : 1 - Math.sin((alt * Math.PI) / 180);
  const e = round2(night ? 0.2 : 0.28 + 0.2 * low);
  return {
    "hillshade-illumination-direction": dir,
    "hillshade-illumination-anchor": "map",
    "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 11, e, 15, e, 17.5, round2(e * 0.45)],
    "hillshade-shadow-color": night ? "rgba(4,7,20,0.55)" : "rgba(36,52,94,0.5)",
    "hillshade-highlight-color": night ? "rgba(143,155,196,0.08)" : "rgba(255,240,214,0.4)",
    "hillshade-accent-color": night ? "rgba(4,7,20,0.12)" : "rgba(36,52,94,0.14)",
  };
}

export function hillshadeLayer(sun: ReliefSun, theme: Theme): Record<string, unknown> {
  return {
    id: HILLSHADE_LAYER_ID,
    type: "hillshade",
    source: DEM_SOURCE_ID,
    maxzoom: HILLSHADE_MAX_ZOOM,
    paint: hillshadePaint(sun, theme),
  };
}

/** Justo debajo de calles y edificios (y así de la capa solar y de los rótulos). */
export function hillshadeBeforeId(layers: ReadonlyArray<{ id: string; type: string }>): string | undefined {
  return layers.find(
    (l) => l.id.startsWith("road-") || l.id === "buildings" || l.id === "buildings-3d" || l.type === "symbol"
  )?.id;
}

/**
 * Añade, actualiza o quita el relieve del mapa. Se puede llamar a menudo: solo toca el estilo si
 * cambia algo. En la vista satélite no se dibuja (la foto ya enseña el relieve).
 */
export class ReliefLayer {
  private map: MapLike;
  private paintKey = "";

  constructor(map: MapLike) {
    this.map = map;
  }

  update(enabled: boolean, sun: ReliefSun, theme: Theme) {
    const map = this.map;
    try {
      const want = enabled && !map.getLayer("satellite-base");
      const has = !!map.getLayer(HILLSHADE_LAYER_ID);
      if (!want) {
        if (has) map.removeLayer?.(HILLSHADE_LAYER_ID);
        if (map.getSource(DEM_SOURCE_ID)) map.removeSource?.(DEM_SOURCE_ID);
        this.paintKey = "";
        return;
      }
      const layer = hillshadeLayer(sun, theme);
      const paint = layer.paint as Record<string, unknown>;
      const key = JSON.stringify(paint);
      if (!map.getSource(DEM_SOURCE_ID)) map.addSource(DEM_SOURCE_ID, demSource());
      if (!has) {
        map.addLayer(layer, hillshadeBeforeId(map.getStyle?.()?.layers ?? []));
        this.paintKey = key;
        return;
      }
      if (key === this.paintKey) return;
      for (const [k, v] of Object.entries(paint)) map.setPaintProperty(HILLSHADE_LAYER_ID, k, v);
      this.paintKey = key;
    } catch {
      // Estilo en transición: se reintenta en la siguiente actualización.
      this.paintKey = "";
    }
  }
}
