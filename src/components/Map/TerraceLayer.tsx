import { useEffect, useRef } from "react";
import type { TerraceSun } from "../../hooks/useTerraceSun";
import { useMapContext } from "./MapContext";

/**
 * TerraceLayer — la terraza de la ficha dibujada en el suelo: el rectángulo de la licencia y sus
 * 25 celdas al sol (ámbar) o a la sombra (azul) para la hora elegida. Va bajo los edificios 3D y
 * las etiquetas, y se vuelve a añadir si cambia el estilo (vista real, tema).
 */

const SOURCE = "fts-terrace";
const CELLS = "fts-terrace-cells";
const OUTLINE = "fts-terrace-outline";

const PALETTE = {
  day: { sun: "#e9a23b", shade: "#56648f", unknown: "#1f1c26", line: "#1f1c26" },
  night: { sun: "#f2b866", shade: "#8da2da", unknown: "#eceff8", line: "#eceff8" },
} as const;

function toGeoJSON(t: TerraceSun | null) {
  if (!t) return { type: "FeatureCollection", features: [] };
  const features: unknown[] = t.shape.cells.map((c, i) => ({
    type: "Feature",
    properties: { k: "cell", s: t.sunny ? (t.sunny[i] ? 1 : 0) : -1 },
    geometry: { type: "Polygon", coordinates: [c.ring] },
  }));
  features.push({ type: "Feature", properties: { k: "outline" }, geometry: { type: "LineString", coordinates: t.shape.ring } });
  return { type: "FeatureCollection", features };
}

export default function TerraceLayer({ data }: { data: TerraceSun | null }) {
  const { map, theme } = useMapContext();
  const dataRef = useRef(data);
  dataRef.current = data;
  const palette = theme === "night" ? PALETTE.night : PALETTE.day;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  useEffect(() => {
    if (!map) return;
    const ensure = () => {
      try {
        if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: toGeoJSON(dataRef.current) });
        const layers = map.getStyle?.()?.layers ?? [];
        const before = map.getLayer("buildings-3d") ? "buildings-3d" : layers.find((l) => l.type === "symbol")?.id;
        const p = paletteRef.current;
        if (!map.getLayer(CELLS)) {
          map.addLayer(
            {
              id: CELLS,
              type: "fill",
              source: SOURCE,
              minzoom: 15.5,
              filter: ["==", ["get", "k"], "cell"],
              paint: {
                "fill-color": ["match", ["get", "s"], 1, p.sun, 0, p.shade, p.unknown],
                "fill-opacity": ["match", ["get", "s"], -1, 0.12, 0.78],
                "fill-outline-color": "rgba(0,0,0,0)",
              },
            },
            before
          );
        }
        if (!map.getLayer(OUTLINE)) {
          map.addLayer(
            {
              id: OUTLINE,
              type: "line",
              source: SOURCE,
              minzoom: 15.5,
              filter: ["==", ["get", "k"], "outline"],
              paint: {
                "line-color": p.line,
                "line-opacity": 0.85,
                "line-width": ["interpolate", ["linear"], ["zoom"], 16, 1, 20, 2.5],
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
        if (map.getLayer(OUTLINE)) map.removeLayer?.(OUTLINE);
        if (map.getLayer(CELLS)) map.removeLayer?.(CELLS);
        if (map.getSource(SOURCE)) (map as unknown as { removeSource?(id: string): void }).removeSource?.(SOURCE);
      } catch {
        /* mapa ya destruido */
      }
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SOURCE) as { setData?(d: unknown): void } | undefined;
    src?.setData?.(toGeoJSON(data));
  }, [map, data]);

  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(CELLS)) map.setPaintProperty(CELLS, "fill-color", ["match", ["get", "s"], 1, palette.sun, 0, palette.shade, palette.unknown]);
      if (map.getLayer(OUTLINE)) map.setPaintProperty(OUTLINE, "line-color", palette.line);
    } catch {
      /* estilo cargando */
    }
  }, [map, palette]);

  return null;
}
