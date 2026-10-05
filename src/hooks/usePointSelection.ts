import { useCallback, useRef, useState } from "react";
import type { PointTimeline, SelectedPoint, SunlightResult } from "../types";

/** Punto seleccionado en el mapa y la información solar que calcula la capa para él. */
export function usePointSelection() {
  const [selection, setSelection] = useState<SelectedPoint | null>(null);
  const [pointTimeline, setPointTimeline] = useState<PointTimeline | null>(null);
  const [pointSunlight, setPointSunlight] = useState<SunlightResult | null>(null);
  const counter = useRef(1_000_000);

  const clear = useCallback(() => {
    setSelection(null);
    setPointTimeline(null);
    setPointSunlight(null);
  }, []);

  /** Selecciona un punto (del mapa, un resultado o un favorito) y limpia los datos del anterior. */
  const select = useCallback((p: SelectedPoint | Omit<SelectedPoint, "id">) => {
    setPointTimeline(null);
    setPointSunlight(null);
    setSelection("id" in p ? p : { ...p, id: ++counter.current });
  }, []);

  return { selection, pointTimeline, pointSunlight, setPointTimeline, setPointSunlight, select, clear };
}
