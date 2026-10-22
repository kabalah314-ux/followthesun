import { useEffect, useRef } from "react";
import { streetBearingAt, type StreetHit } from "../../lib/streetSun";
import type { LngLatPair } from "../../lib/terraceShape";
import type { SelectedPoint } from "../../types";
import { useMapContext } from "./MapContext";

/**
 * StreetProbe — la calle del punto elegido, leída de las teselas que ya dibuja el mapa (capa
 * `transportation` del esquema OpenMapTiles): el rumbo del tramo más cercano. Si aún no estaban
 * dibujadas, vuelve a mirar cuando el mapa queda quieto.
 */

export interface StreetInfo extends StreetHit {
  pointId: number;
}

const STREET_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]);

type QueriedFeature = {
  sourceLayer?: string;
  properties?: Record<string, unknown>;
  geometry?: { type: string; coordinates: unknown };
};

function streetLines(features: QueriedFeature[]): LngLatPair[][] {
  const lines: LngLatPair[][] = [];
  for (const f of features) {
    if (f.sourceLayer !== "transportation") continue;
    const cls = String(f.properties?.class ?? "");
    const sub = String(f.properties?.subclass ?? "");
    if (!STREET_CLASSES.has(cls) && !(cls === "path" && sub === "pedestrian")) continue;
    const g = f.geometry;
    if (g?.type === "LineString") lines.push(g.coordinates as LngLatPair[]);
    else if (g?.type === "MultiLineString") lines.push(...(g.coordinates as LngLatPair[][]));
  }
  return lines;
}

export default function StreetProbe({ point, onStreet }: { point: SelectedPoint | null; onStreet(s: StreetInfo | null): void }) {
  const { map } = useMapContext();
  const cb = useRef(onStreet);
  cb.current = onStreet;
  const pointRef = useRef(point);
  pointRef.current = point;
  const id = point?.id ?? null;

  useEffect(() => {
    const p = pointRef.current;
    if (!map || !p) {
      cb.current(null);
      return;
    }
    let done = false;
    const probe = (): boolean => {
      if (done) return true;
      let features: QueriedFeature[] = [];
      try {
        const s = map.project([p.lng, p.lat]);
        const r = 22;
        features = map.queryRenderedFeatures([
          [s.x - r, s.y - r],
          [s.x + r, s.y + r],
        ]) as QueriedFeature[];
      } catch {
        features = [];
      }
      const hit = streetBearingAt(streetLines(features), p.lng, p.lat, 25);
      if (hit) {
        done = true;
        cb.current({ pointId: p.id, ...hit });
      }
      return !!hit;
    };
    cb.current(null);
    if (probe()) return;
    const onIdle = () => {
      if (!probe()) cb.current(null);
      done = true;
      map.off("idle", onIdle);
    };
    map.on("idle", onIdle);
    return () => {
      done = true;
      map.off("idle", onIdle);
    };
  }, [map, id]);

  return null;
}
