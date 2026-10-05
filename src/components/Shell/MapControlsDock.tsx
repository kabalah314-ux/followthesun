import type { RefObject } from "react";
import type { MapLayers } from "../../hooks/useMapLayers";
import type { CameraState } from "../../types";
import type { MapController } from "../Map/BarcelonaMap";
import MapControls from "../Map/MapControls";

/** Controles del mapa (zoom, ubicación, norte y capas), arriba a la derecha. */
export default function MapControlsDock({
  layers,
  camera,
  controller,
}: {
  layers: MapLayers;
  camera: CameraState;
  controller: RefObject<MapController | null>;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-[136px] z-20 sm:right-5 sm:top-[104px]">
      <div className="pointer-events-auto">
        <MapControls
          onZoomIn={() => controller.current?.zoomIn()}
          onZoomOut={() => controller.current?.zoomOut()}
          onLocate={() => controller.current?.locate()}
          onResetNorth={() => controller.current?.resetNorth()}
          bearing={camera.bearing}
          pitch={camera.pitch}
          showBuildings={layers.showBuildings}
          onToggleBuildings={layers.toggleBuildings}
          showShadows={layers.showShadows}
          onToggleShadows={layers.toggleShadows}
          showClouds={layers.showClouds}
          onToggleClouds={layers.toggleClouds}
          showSunPath={layers.showSunPath}
          onToggleSunPath={layers.toggleSunPath}
        />
      </div>
    </div>
  );
}
