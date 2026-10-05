import { createContext, useContext } from "react";
import type { MapLike, MapProvider } from "../../services/mapService";

/**
 * Contexto del mapa: <BarcelonaMap> publica aquí la instancia y su proveedor cuando el estilo
 * está cargado. Los hijos (capa solar, edificios, marcadores) la consumen sin conocer la librería.
 */
export interface MapContextValue {
  map: MapLike | null;
  provider: MapProvider | null;
}

export const MapContext = createContext<MapContextValue>({ map: null, provider: null });

export const useMapContext = (): MapContextValue => useContext(MapContext);
