import { useEffect } from "react";
import { useSolarEngine } from "./SolarEngineContext";

/**
 * ShadowLayer — sombras urbanas (edificios).
 *
 * Es geometría pura: cada edificio proyecta su sombra según la posición del sol, con los tejados
 * iluminados. No depende de las nubes: una calle puede estar en sombra urbana con cielo despejado
 * o con cielo cubierto, y la aplicación lo distingue.
 */
export default function ShadowLayer({ visible }: { visible: boolean }) {
  const engine = useSolarEngine();
  useEffect(() => {
    engine?.setShowShadows(visible);
  }, [engine, visible]);
  return null;
}
