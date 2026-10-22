import { useEffect, useRef } from "react";
import type { ShadeRouteState } from "../../hooks/useShadeRoute";
import type { LngLatPair } from "../../lib/terraceShape";
import { useMapContext } from "./MapContext";

/**
 * RouteLayer — una ruta en el mapa con sus tramos al sol (ámbar) y a la sombra (azul) sobre un
 * borde claro; las alternativas, finas y en gris. Sirve para la ruta por la sombra hasta un sitio
 * y para los recorridos de correr o ir en bici.
 */

export interface RouteDrawing {
  routes: Array<{ coords: LngLatPair[]; segments: Array<{ coords: LngLatPair[]; shaded: boolean }> }>;
  /** La que se dibuja entera con sus tramos (las demás, como alternativas). */
  best: number;
  /** Ida y vuelta por el mismo camino: cada sentido se dibuja a un lado para que se vean los dos. */
  twoWay?: boolean;
}

const LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 13, 3.5, 18, 8];
const LINE_WIDTH_TWO_WAY = ["interpolate", ["linear"], ["zoom"], 13, 2.6, 18, 6];
const LINE_OFFSET_TWO_WAY = ["interpolate", ["linear"], ["zoom"], 13, 1.5, 18, 3.6];
const CASING_WIDTH = ["interpolate", ["linear"], ["zoom"], 13, 6, 18, 12];
const CASING_WIDTH_TWO_WAY = ["interpolate", ["linear"], ["zoom"], 13, 7.5, 18, 16];

/** La ruta por la sombra hasta un sitio, lista para dibujar. */
export const drawingOfShadeRoute = (s: ShadeRouteState | null): RouteDrawing | null => (s && s.status === "ready" ? { routes: s.routes, best: s.best } : null);

const SOURCE = "fts-route";
const ALT = "fts-route-alt";
const CASING = "fts-route-casing";
const LINE = "fts-route-line";

const COLORS = {
  day: { sun: "#e9a23b", shade: "#56648f", alt: "#1f1c26", casing: "#ffffff" },
  night: { sun: "#f2b866", shade: "#8da2da", alt: "#eceff8", casing: "#0f1428" },
} as const;

function toGeoJSON(s: RouteDrawing | null) {
  const features: unknown[] = [];
  if (s) {
    s.routes.forEach((r, i) => {
      if (i === s.best) return;
      features.push({ type: "Feature", properties: { k: "alt" }, geometry: { type: "LineString", coordinates: r.coords } });
    });
    const best = s.routes[s.best];
    if (best) {
      features.push({ type: "Feature", properties: { k: "casing" }, geometry: { type: "LineString", coordinates: best.coords } });
      for (const seg of best.segments) {
        features.push({ type: "Feature", properties: { k: "seg", s: seg.shaded ? 1 : 0 }, geometry: { type: "LineString", coordinates: seg.coords } });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

export default function RouteLayer({ state }: { state: RouteDrawing | null }) {
  const { map, theme } = useMapContext();
  const stateRef = useRef(state);
  stateRef.current = state;
  const colors = theme === "night" ? COLORS.night : COLORS.day;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    if (!map) return;
    const ensure = () => {
      try {
        if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: toGeoJSON(stateRef.current) });
        const layers = map.getStyle?.()?.layers ?? [];
        const before = layers.find((l) => l.type === "symbol")?.id;
        const c = colorsRef.current;
        const round = { "line-cap": "round", "line-join": "round" };
        if (!map.getLayer(ALT)) {
          map.addLayer(
            { id: ALT, type: "line", source: SOURCE, filter: ["==", ["get", "k"], "alt"], layout: round, paint: { "line-color": c.alt, "line-opacity": 0.35, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 18, 5], "line-dasharray": [1.5, 1.5] } },
            before
          );
        }
        if (!map.getLayer(CASING)) {
          map.addLayer(
            {
              id: CASING,
              type: "line",
              source: SOURCE,
              filter: ["==", ["get", "k"], "casing"],
              layout: round,
              paint: { "line-color": c.casing, "line-opacity": 0.9, "line-width": stateRef.current?.twoWay ? CASING_WIDTH_TWO_WAY : CASING_WIDTH },
            },
            before
          );
        }
        if (!map.getLayer(LINE)) {
          map.addLayer(
            {
              id: LINE,
              type: "line",
              source: SOURCE,
              filter: ["==", ["get", "k"], "seg"],
              layout: round,
              paint: {
                "line-color": ["match", ["get", "s"], 1, c.shade, c.sun],
                "line-width": stateRef.current?.twoWay ? LINE_WIDTH_TWO_WAY : LINE_WIDTH,
                "line-offset": stateRef.current?.twoWay ? LINE_OFFSET_TWO_WAY : 0,
              },
            },
            before
          );
        }
      } catch {
        /* el estilo aún carga: se reintenta en el siguiente `styledata` */
      }
    };
    ensure();
    map.on("styledata", ensure);
    return () => {
      map.off("styledata", ensure);
      try {
        for (const id of [LINE, CASING, ALT]) if (map.getLayer(id)) map.removeLayer?.(id);
        if (map.getSource(SOURCE)) (map as unknown as { removeSource?(id: string): void }).removeSource?.(SOURCE);
      } catch {
        /* mapa ya destruido */
      }
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SOURCE) as { setData?(d: unknown): void } | undefined;
    src?.setData?.(toGeoJSON(state));
    const two = !!state?.twoWay;
    try {
      if (map.getLayer(LINE)) {
        map.setPaintProperty(LINE, "line-offset", two ? LINE_OFFSET_TWO_WAY : 0);
        map.setPaintProperty(LINE, "line-width", two ? LINE_WIDTH_TWO_WAY : LINE_WIDTH);
      }
      if (map.getLayer(CASING)) map.setPaintProperty(CASING, "line-width", two ? CASING_WIDTH_TWO_WAY : CASING_WIDTH);
    } catch {
      /* estilo cargando */
    }
  }, [map, state]);

  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(LINE)) map.setPaintProperty(LINE, "line-color", ["match", ["get", "s"], 1, colors.shade, colors.sun]);
      if (map.getLayer(ALT)) map.setPaintProperty(ALT, "line-color", colors.alt);
      if (map.getLayer(CASING)) map.setPaintProperty(CASING, "line-color", colors.casing);
    } catch {
      /* estilo cargando */
    }
  }, [map, colors]);

  return null;
}
