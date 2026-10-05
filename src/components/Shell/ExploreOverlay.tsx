import type { CSSProperties } from "react";
import type { LightSourceState } from "../../hooks/useLightSource";
import type { MapLayers } from "../../hooks/useMapLayers";
import type { SunTimes } from "../../services/solarService";
import type { CameraState, CityStats } from "../../types";
import { cn } from "../../utils/cn";
import InfoPanel from "../InfoPanel";
import SunIndicator from "../Map/SunIndicator";

interface Props {
  isMobile: boolean;
  hidden: boolean;
  panelLeft: number;
  stats: CityStats | null;
  time: number;
  sunTimes: SunTimes;
  up: boolean;
  altitudeDeg: number;
  azimuthDeg: number;
  light: LightSourceState;
  layers: MapLayers;
  camera: CameraState;
}

/** Explorar: titular del cielo arriba a la izquierda y, si se activa, el indicador solar. */
export default function ExploreOverlay(p: Props) {
  const sunPath = p.layers.showSunPath;
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute top-[80px] z-10 flex flex-col items-start gap-3 transition-all duration-500 sm:top-[124px]",
          p.hidden && "-translate-y-2 opacity-0",
          p.isMobile ? "left-3" : "left-[var(--fts-panel-left)]"
        )}
        style={!p.isMobile ? ({ "--fts-panel-left": `${p.panelLeft}px` } as CSSProperties) : undefined}
      >
        <div className={p.hidden ? "pointer-events-none" : "pointer-events-auto"}>
          <InfoPanel
            stats={p.stats}
            time={p.time}
            sunTimes={p.sunTimes}
            up={p.up}
            altitudeDeg={p.altitudeDeg}
            azimuthDeg={p.azimuthDeg}
            light={p.light}
            showClouds={p.layers.showClouds}
            showShadows={p.layers.showShadows}
          />
        </div>
        {sunPath && (
          <div className="pointer-events-auto hidden sm:block">
            <SunIndicator variant="capsule" azimuthDeg={p.azimuthDeg} altitudeDeg={p.altitudeDeg} bearing={p.camera.bearing} />
          </div>
        )}
      </div>
      {sunPath && (
        <div
          className={cn(
            "pointer-events-none absolute right-3 top-[66px] z-20 transition-opacity duration-500 sm:hidden",
            p.hidden && "opacity-0"
          )}
        >
          <SunIndicator variant="dial" azimuthDeg={p.azimuthDeg} altitudeDeg={p.altitudeDeg} bearing={p.camera.bearing} />
        </div>
      )}
    </>
  );
}
