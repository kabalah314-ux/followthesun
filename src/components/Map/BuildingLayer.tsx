import { useEffect } from "react";
import { useMapContext } from "./MapContext";

/**
 * BuildingLayer — edificios del mapa.
 *
 *  · huellas planas: la vista de lejos, sutil
 *  · relieve 3D: al acercarse (zoom ≥ 14,6) los edificios crecen hasta su altura real, con un tono
 *    más profundo cuanto más altos, iluminados por la luz del sol (ver `SolarOverlayEngine`).
 *
 * Los edificios (geometría + altura + orientación) alimentan el cálculo de sombras a través de
 * `buildingService`, se vean o no.
 */

export interface BuildingLayerProps {
  /** Mostrar los edificios. */
  visible: boolean;
  /** Levantarlos en 3D al acercarse. */
  extrude?: boolean;
}

export default function BuildingLayer({ visible, extrude = false }: BuildingLayerProps) {
  const { map, provider } = useMapContext();

  useEffect(() => {
    if (!map || !provider) return;
    provider.setBuildingsVisible(map, visible);
    provider.setBuildings3D(map, visible && extrude);
  }, [map, provider, visible, extrude]);

  return null;
}
