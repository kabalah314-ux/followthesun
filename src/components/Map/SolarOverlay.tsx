import { useEffect, useRef, useState, type ReactNode } from "react";
import { SolarOverlayEngine } from "../../engine/SolarOverlayEngine";
import type {
  CityStats,
  Highlight,
  PointTimeline,
  SelectedPoint,
  SolarPoint,
  SunlightResult,
} from "../../types";
import { useMapContext } from "./MapContext";
import { SolarEngineContext } from "./SolarEngineContext";

/**
 * SolarOverlay — capa solar que se monta sobre el mapa. No renderiza DOM propio.
 *
 * Recibe el instante elegido (`time`) y pinta, sincronizada con la cámara del mapa, la luz, las
 * sombras, las nubes y la trayectoria del sol. Cada capa visual es un hijo independiente:
 *
 *   <SolarOverlay …>
 *     <ShadowLayer visible />   sombras de edificios
 *     <CloudLayer visible />    velo de nubes
 *   </SolarOverlay>
 *
 * Los datos de nubes llegan solos desde `lightFusionService` (el componente no conoce a los
 * proveedores). Pasando `solarPoints` se sustituyen las fuentes por datos externos.
 *
 * La búsqueda de lugares (Find the Sun) NO pasa por aquí: vive en `sunSearchService` y usa sus
 * propios edificios; este componente solo pinta lo que se ve en pantalla.
 */

export interface SolarOverlayProps {
  /** Instante elegido (`selectedTime`). */
  time: number;
  dayStart: number;
  showSunPath: boolean;
  selection: SelectedPoint | null;
  highlights: Highlight[];
  /** Datos solares externos. Si se omiten se usan relieve + nubes reales. */
  solarPoints?: SolarPoint[] | null;
  onStats(s: CityStats): void;
  onPointTimeline(t: PointTimeline | null): void;
  onPointSunlight(r: SunlightResult | null): void;
  children?: ReactNode;
}

export default function SolarOverlay(props: SolarOverlayProps) {
  const { map, provider } = useMapContext();
  const [engine, setEngine] = useState<SolarOverlayEngine | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  /* ------------------------------ creación ------------------------------ */
  useEffect(() => {
    if (!map || !provider) return;
    const p = propsRef.current;

    const created = new SolarOverlayEngine(map, {
      sourceId: provider.sourceId,
      getAreaName: (lng, lat, zoom) => provider.getAreaName(map, lng, lat, zoom),
      onStats: (s) => propsRef.current.onStats(s),
      onPointTimeline: (t) => propsRef.current.onPointTimeline(t),
      onPointSunlight: (r) => propsRef.current.onPointSunlight(r),
    });

    created.setDay(p.dayStart);
    created.setSolarPoints(p.solarPoints ?? null);
    created.setTarget(p.time, true);
    created.setShowSunPath(p.showSunPath);
    created.setHighlights(p.highlights);
    if (p.selection) created.selectPoint({ lng: p.selection.lng, lat: p.selection.lat });
    created.reveal();

    setEngine(created);
    return () => {
      created.destroy();
      setEngine(null);
    };
  }, [map, provider]);

  /* ------------------------------ sincronización ------------------------------ */
  useEffect(() => {
    engine?.setTarget(props.time);
  }, [engine, props.time]);

  useEffect(() => {
    engine?.setDay(props.dayStart);
  }, [engine, props.dayStart]);

  useEffect(() => {
    engine?.setSolarPoints(props.solarPoints ?? null);
  }, [engine, props.solarPoints]);

  useEffect(() => {
    engine?.setShowSunPath(props.showSunPath);
  }, [engine, props.showSunPath]);

  useEffect(() => {
    engine?.setHighlights(props.highlights);
  }, [engine, props.highlights]);

  const selId = props.selection?.id;
  useEffect(() => {
    if (!engine) return;
    const current = propsRef.current.selection;
    engine.selectPoint(current ? { lng: current.lng, lat: current.lat } : null);
  }, [engine, selId]);

  return <SolarEngineContext.Provider value={engine}>{props.children}</SolarEngineContext.Provider>;
}
