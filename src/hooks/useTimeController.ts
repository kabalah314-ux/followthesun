import { useCallback, useRef, useState } from "react";
import { clamp } from "../lib/coordinates";
import { presentOnDay } from "./useDaySun";

export type TimeMode = "now" | "ahead";

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Controla el instante que se está visualizando:
 *  - "now": sigue al reloj real del día elegido (por defecto, hoy)
 *  - "ahead": instante elegido por la persona arrastrando la línea de tiempo
 */
export function useTimeController(now: number, range: TimeRange, dayOffset = 0) {
  const [mode, setMode] = useState<TimeMode>("now");
  const [custom, setCustom] = useState(now);

  const rangeRef = useRef(range);
  rangeRef.current = range;

  /** Hora presente sobre el día elegido: ahí arranca siempre la línea de tiempo. */
  const present = presentOnDay(now, dayOffset);
  const selectedTime = mode === "now" ? clamp(present, range.start, range.end) : custom;

  const goNow = useCallback(() => setMode("now"), []);

  const scrub = useCallback((ms: number) => {
    setMode("ahead");
    setCustom(clamp(ms, rangeRef.current.start, rangeRef.current.end));
  }, []);

  return { mode, selectedTime, scrub, goNow };
}
