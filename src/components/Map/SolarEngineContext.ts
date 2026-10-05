import { createContext, useContext } from "react";
import type { SolarOverlayEngine } from "../../engine/SolarOverlayEngine";

/**
 * <SolarOverlay> publica aquí su motor para que las capas hijas (<ShadowLayer>, <CloudLayer>)
 * se activen y desactiven de forma independiente, igual que <BuildingLayer> con el mapa.
 */
export const SolarEngineContext = createContext<SolarOverlayEngine | null>(null);

export const useSolarEngine = (): SolarOverlayEngine | null => useContext(SolarEngineContext);
