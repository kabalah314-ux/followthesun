import { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT_MODEL_CONFIG, SEARCH_CONFIG } from "../config";
import type { StreetInfo } from "../components/Map/StreetProbe";
import { facadeDistance, offsetPoint, sectorOf, streetAlignments, type StreetAlignment } from "../lib/streetSun";
import { createShadowEvaluator, type ShadowEvaluator } from "../services/shadowService";
import { solarService } from "../services/solarService";
import { getZoneParts } from "../services/timeService";
import { urbanGeometryService } from "../services/urbanGeometryService";

/**
 * Las dos aceras de la calle del punto a la hora elegida y los días en que el sol sale o se pone al
 * fondo de la calle. Cada acera se mira a 1,5 m de su fachada (o a 6 m del eje si no hay fachada).
 */

export interface StreetSide {
  /** Hacia dónde queda esa acera desde el eje (rumbo). */
  azimuthDeg: number;
  sector: number;
  /** true = al sol, false = a la sombra, null = de noche o sin edificios cargados. */
  sunny: boolean | null;
}

export interface StreetSun {
  pointId: number;
  bearingDeg: number;
  sides: StreetSide[];
  alignments: StreetAlignment[];
}

interface SideGeometry {
  azimuthDeg: number;
  evaluator: ShadowEvaluator | null;
}

export function useStreetSun(info: StreetInfo | null, time: number): StreetSun | null {
  const [sides, setSides] = useState<{ pointId: number; list: SideGeometry[] } | null>(null);
  const infoRef = useRef(info);
  infoRef.current = info;
  const key = info?.pointId ?? null;

  useEffect(() => {
    const s = infoRef.current;
    setSides(null);
    if (!s) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const g = await urbanGeometryService.load([{ lng: s.lng, lat: s.lat }], SEARCH_CONFIG.shadowRadiusM, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        const list = [s.bearingDeg + 90, s.bearingDeg + 270].map((az) => {
          const azimuthDeg = az % 360;
          if (!g.buildings) return { azimuthDeg, evaluator: null };
          const d = facadeDistance(g.buildings, s.lng, s.lat, azimuthDeg, 30);
          const [lng, lat] = offsetPoint(s.lng, s.lat, azimuthDeg, d === null ? 6 : Math.max(1, d - 1.5));
          const evaluator = createShadowEvaluator({ latitude: lat, longitude: lng, buildings: g.buildings });
          return { azimuthDeg, evaluator: evaluator.buildingsKnown ? evaluator : null };
        });
        setSides({ pointId: s.pointId, list });
      } catch {
        /* sin edificios: solo las alineaciones */
      }
    })();
    return () => ctrl.abort();
  }, [key]);

  const year = getZoneParts(time).year;
  const alignments = useMemo(() => {
    const s = infoRef.current;
    return s ? streetAlignments(year, s.lat, s.lng, s.bearingDeg) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, year]);

  return useMemo(() => {
    if (!info) return null;
    const sun = solarService.getPosition(time, info.lat, info.lng);
    const day = sun.altitudeDeg >= LIGHT_MODEL_CONFIG.MIN_SUN_ELEVATION_DEG;
    const list = sides && sides.pointId === info.pointId ? sides.list : null;
    const out: StreetSide[] = (list ?? [{ azimuthDeg: (info.bearingDeg + 90) % 360, evaluator: null }, { azimuthDeg: (info.bearingDeg + 270) % 360, evaluator: null }]).map((g) => {
      let sunny: boolean | null = null;
      if (day && g.evaluator) {
        const r = g.evaluator.evaluate(sun);
        sunny = !(r.urbanShadow || r.terrainShadow);
      }
      return { azimuthDeg: g.azimuthDeg, sector: sectorOf(g.azimuthDeg), sunny };
    });
    return { pointId: info.pointId, bearingDeg: info.bearingDeg, sides: out, alignments };
  }, [info, sides, time, alignments]);
}
