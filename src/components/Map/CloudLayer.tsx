import { useEffect } from "react";
import type { LightSourceMode } from "../../types";
import { useSolarEngine } from "./SolarEngineContext";

/**
 * CloudLayer — velo de luz atenuada sobre el mapa.
 *
 * Representa lo que las nubes bloquean del sol DIRECTO (1 − transmisión), no una cobertura de nubes
 * genérica. La fuente es la fusión de la observación satelital y la previsión del modelo; la capa
 * cambia de fuente sola según el instante sin que cambie la interfaz (`source` solo existe para
 * depurar: `fused` · `model` · `satellite`).
 *
 * Es suave y translúcida, a la escala real de los datos (celdas de ~2,5 km): sin textura añadida
 * ni bordes nítidos que sugieran una precisión de calle que no existe. Si no hay datos
 * meteorológicos no se dibuja nada.
 */
export default function CloudLayer({
  visible,
  source = "fused",
}: {
  visible: boolean;
  source?: LightSourceMode;
}) {
  const engine = useSolarEngine();
  useEffect(() => {
    engine?.setShowClouds(visible);
  }, [engine, visible]);
  useEffect(() => {
    engine?.setLightSource(source);
  }, [engine, source]);
  return null;
}
