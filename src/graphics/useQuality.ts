import { useEffect, useState } from "react";
import { qualityApi, type QualityState } from "./quality";

/** Estado de la calidad gráfica para la interfaz (se actualiza si baja sola o se cambia). */
export function useQuality(): QualityState {
  const [state, setState] = useState<QualityState>(() => qualityApi.get());
  useEffect(() => {
    setState(qualityApi.get());
    return qualityApi.subscribe(setState);
  }, []);
  return state;
}
