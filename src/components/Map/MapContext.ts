import { createContext, useContext } from "react";
import type { MapLike, MapProvider } from "../../services/mapService";
import type { Theme } from "../../types";

/**
 * Contexto del mapa: <BarcelonaMap> publica aquí la instancia y su proveedor cuando el estilo
 * está cargado. Los hijos (capa solar, edificios, marcadores) la consumen sin conocer la librería.
 */
export interface MapContextValue {
  map: MapLike | null;
  provider: MapProvider | null;
  /** Paleta activa del mapa (día / noche). */
  theme?: Theme;
}

export const MapContext = createContext<MapContextValue>({ map: null, provider: null });

export const useMapContext = () => useContext(MapContext);
