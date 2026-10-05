import { useEffect } from "react";
import { useMapContext } from "./MapContext";

/**
 * BuildingLayer — edificios del mapa.
 *
 * Controla dos capas del estilo:
 *  · huellas planas (la vista por defecto, sutil y elegante)
 *  · extrusión 3D sutil que aparece gradualmente al acercar el mapa (≥ zoom 15,35).
 *
 * Los edificios (geometría + altura + orientación) alimentan el cálculo de sombras a través de
 * `buildingService`, independientemente de cuál de las dos se vea. Para activar el 3D basta con
 * `extrude` como booleano puede forzarla o apagarla; en la vista normal usa `auto`.
 */

export interface BuildingLayerProps {
  /** Mostrar los edificios. */
  visible: boolean;
  /** false: plano · true: 3D forzado · auto: transición al acercar (valor normal). */
  extrude?: boolean | "auto";
}

export default function BuildingLayer({ visible, extrude = "auto" }: BuildingLayerProps) {
  const { map, provider } = useMapContext();

  useEffect(() => {
    if (!map || !provider) return;
    provider.setBuildingsVisible(map, visible);
    const mode = !visible || extrude === false ? "off" : extrude === true ? "on" : "auto";
    provider.setBuildings3D(map, mode);
  }, [map, provider, visible, extrude]);

  return null;
}
