import { useEffect, useMemo, useRef, useState } from "react";
import { LIGHT_MODEL_CONFIG, SEARCH_CONFIG } from "../config";
import { nearestFacade, terraceShape, type TerraceShape } from "../lib/terraceShape";
import type { TerraceLicenseInfo } from "../services/openData/terraceMatching";
import { createShadowEvaluator, type ShadowEvaluator } from "../services/shadowService";
import { solarService } from "../services/solarService";
import { urbanGeometryService } from "../services/urbanGeometryService";
import type { SunPlace } from "../types";

/**
 * La terraza dibujada con su % al sol (guía maestra 2, B10): el rectángulo de la licencia junto a
 * la fachada, 25 puntos de muestra y, para la hora elegida, cuáles quedan fuera de la sombra de
 * los edificios y del relieve. Las nubes no entran aquí (las dice la ficha): es la geometría.
 */

export interface TerraceSun {
  placeId: string;
  shape: TerraceShape;
  areaM2: number;
  /** Superficie estimada por las mesas (la licencia no traía m²). */
  estimated: boolean;
  time: number;
  /** Por celda: true = le da el sol. null de noche o sin edificios cargados. */
  sunny: boolean[] | null;
  /** % de la terraza al sol (0–100). null de noche o sin edificios cargados. */
  percent: number | null;
}

/** m² que se dibujan: los de la licencia o, si no constan, 2,5 m² por mesa. */
export function terraceAreaOf(place: SunPlace): { areaM2: number; estimated: boolean } | null {
  const lic = place.metadata?.licensed as TerraceLicenseInfo | undefined;
  if (!lic) return null;
  if (lic.areaM2 !== null && lic.areaM2 > 0) return { areaM2: lic.areaM2, estimated: false };
  if (lic.tables !== null && lic.tables > 0) return { areaM2: lic.tables * 2.5, estimated: true };
  return null;
}

interface TerraceGeometry {
  placeId: string;
  shape: TerraceShape;
  areaM2: number;
  estimated: boolean;
  latitude: number;
  longitude: number;
  evaluators: ShadowEvaluator[];
  buildingsKnown: boolean;
}

export function useTerraceSun(place: SunPlace | null, time: number): TerraceSun | null {
  const [geo, setGeo] = useState<TerraceGeometry | null>(null);
  const id = place?.id ?? null;
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    const p = placeRef.current;
    setGeo(null);
    if (!p) return;
    const area = terraceAreaOf(p);
    if (!area) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const g = await urbanGeometryService.load([{ lng: p.longitude, lat: p.latitude }], SEARCH_CONFIG.shadowRadiusM, {
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const facade = g.buildings ? nearestFacade(g.buildings, p.longitude, p.latitude) : null;
        const shape = terraceShape(p.longitude, p.latitude, area.areaM2, facade);
        const evaluators = shape.cells.map((c) => createShadowEvaluator({ latitude: c.center[1], longitude: c.center[0], buildings: g.buildings }));
        setGeo({
          placeId: p.id,
          shape,
          ...area,
          latitude: p.latitude,
          longitude: p.longitude,
          evaluators,
          buildingsKnown: evaluators.every((e) => e.buildingsKnown),
        });
      } catch {
        /* sin edificios no se dibuja */
      }
    })();
    return () => ctrl.abort();
  }, [id]);

  return useMemo(() => {
    if (!geo || geo.placeId !== id) return null;
    const sun = solarService.getPosition(time, geo.latitude, geo.longitude);
    let sunny: boolean[] | null = null;
    if (geo.buildingsKnown && sun.altitudeDeg >= LIGHT_MODEL_CONFIG.MIN_SUN_ELEVATION_DEG) {
      sunny = geo.evaluators.map((e) => {
        const r = e.evaluate(sun);
        return !(r.urbanShadow || r.terrainShadow);
      });
    }
    const percent = sunny ? Math.round((sunny.filter(Boolean).length / sunny.length) * 100) : null;
    return { placeId: geo.placeId, shape: geo.shape, areaM2: geo.areaM2, estimated: geo.estimated, time, sunny, percent };
  }, [geo, id, time]);
}
