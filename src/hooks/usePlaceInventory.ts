import { useEffect, useMemo, useSyncExternalStore } from "react";
import { placeService } from "../services/placeService";
import type { PlaceInventoryStatus } from "../types";

/**
 * Estado del inventario de lugares (OpenStreetMap). Con `enabled` empieza la descarga en segundo
 * plano para que los tipos de lugar ya estén disponibles cuando la persona llegue a ese paso.
 */
export function usePlaceInventory(enabled: boolean): PlaceInventoryStatus {
  const version = useSyncExternalStore(placeService.subscribe, placeService.getVersion, placeService.getVersion);
  useEffect(() => {
    if (enabled) placeService.load().catch(() => undefined);
  }, [enabled]);
  // Instantánea sellada con la versión del inventario: cambia solo cuando cambian los datos.
  return useMemo(() => ({ ...placeService.getStatus(), version }), [version]);
}
