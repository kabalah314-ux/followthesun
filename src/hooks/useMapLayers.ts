import { useCallback, useState } from "react";

/** Capas visibles del mapa (edificios, sombras, nubes, trayectoria del sol). */
export function useMapLayers() {
  const [showBuildings, setShowBuildings] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [showSunPath, setShowSunPath] = useState(false);
  return {
    showBuildings,
    showShadows,
    showClouds,
    showSunPath,
    toggleBuildings: useCallback(() => setShowBuildings((v) => !v), []),
    toggleShadows: useCallback(() => setShowShadows((v) => !v), []),
    toggleClouds: useCallback(() => setShowClouds((v) => !v), []),
    toggleSunPath: useCallback(() => setShowSunPath((v) => !v), []),
  };
}

export type MapLayers = ReturnType<typeof useMapLayers>;
