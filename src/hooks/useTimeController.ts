import { useCallback, useRef, useState } from "react";
import { clamp } from "../lib/coordinates";

export type TimeMode = "now" | "ahead";

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Controla el instante que se está visualizando:
 *  - "now": sigue al reloj real
 *  - "ahead": instante elegido por el usuario arrastrando la línea de tiempo
 */
export function useTimeController(now: number, range: TimeRange) {
  const [mode, setMode] = useState<TimeMode>("now");
  const [custom, setCustom] = useState(now);

  const rangeRef = useRef(range);
  rangeRef.current = range;

  /** Instante que se está visualizando. Por defecto sigue al reloj (`selectedTime = currentTime`). */
  const selectedTime = mode === "now" ? now : custom;

  const goNow = useCallback(() => {
    setMode("now");
  }, []);

  const scrub = useCallback((ms: number) => {
    setMode("ahead");
    setCustom(clamp(ms, rangeRef.current.start, rangeRef.current.end));
  }, []);

  return { mode, selectedTime, scrub, goNow };
}
