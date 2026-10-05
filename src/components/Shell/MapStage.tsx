import { Suspense, lazy } from "react";
import { FEATURES } from "../../config";
import type { MapLayers } from "../../hooks/useMapLayers";
import type {
  CameraState,
  CityStats,
  Highlight,
  LightSourceMode,
  LngLat,
  PointTimeline,
  SelectedPoint,
  SunlightResult,
  Theme,
} from "../../types";
import BarcelonaMap, { type MapController } from "../Map/BarcelonaMap";
import BuildingLayer from "../Map/BuildingLayer";
import CloudLayer from "../Map/CloudLayer";
import MapMarkers from "../Map/MapMarkers";
import ShadowLayer from "../Map/ShadowLayer";

const SolarOverlay = lazy(() => import("../Map/SolarOverlay"));

interface Props {
  theme: Theme;
  loaded: boolean;
  layers: MapLayers;
  time: number;
  dayStart: number;
  selection: SelectedPoint | null;
  userLocation: LngLat | null;
  highlights: Highlight[];
  activeSpotId: string | null;
  debugSource: LightSourceMode;
  onSelect(p: SelectedPoint): void;
  onReady(c: MapController): void;
  onLoaded(): void;
  onToast(message: string): void;
  onCamera(c: CameraState): void;
  onUserLocation(p: LngLat): void;
  onStats(s: CityStats): void;
  onPointTimeline(t: PointTimeline | null): void;
  onPointSunlight(r: SunlightResult | null): void;
  onPickSpot(id: string): void;
}

/** Mapa de Barcelona con sus capas (edificios, luz solar, sombras, nubes) y marcadores. */
export default function MapStage(p: Props) {
  return (
    <BarcelonaMap
      theme={p.theme}
      onSelect={p.onSelect}
      onReady={p.onReady}
      onLoaded={p.onLoaded}
      onToast={p.onToast}
      onCamera={p.onCamera}
      onUserLocation={p.onUserLocation}
    >
      <BuildingLayer visible={p.layers.showBuildings} extrude={FEATURES.buildings3D ? true : "auto"} />
      {p.loaded && (
        <Suspense fallback={null}>
          <SolarOverlay
            time={p.time}
            dayStart={p.dayStart}
            showSunPath={p.layers.showSunPath}
            selection={p.selection}
            highlights={p.highlights}
            onStats={p.onStats}
            onPointTimeline={p.onPointTimeline}
            onPointSunlight={p.onPointSunlight}
          >
            <ShadowLayer visible={p.layers.showShadows} />
            <CloudLayer visible={p.layers.showClouds} source={p.debugSource} />
          </SolarOverlay>
        </Suspense>
      )}
      <MapMarkers
        selection={p.selection}
        userLocation={p.userLocation}
        highlights={p.highlights}
        activeSpotId={p.activeSpotId}
        onPickSpot={p.onPickSpot}
      />
    </BarcelonaMap>
  );
}
