import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../lib/coordinates";

export type TimeMode = "now" | "ahead";

export interface TimeRange {
  start: number;
  end: number;
}

/** Minutos simulados por segundo real durante la reproducción de "Próximas horas". */
const PLAY_MINUTES_PER_SECOND = 42;

/**
 * Controla el instante que se está visualizando:
 *  - "now": sigue al reloj real
 *  - "ahead": instante elegido por el usuario (arrastrando la línea de tiempo o reproduciendo)
 */
export function useTimeController(now: number, range: TimeRange) {
  const [mode, setMode] = useState<TimeMode>("now");
  const [custom, setCustom] = useState(now);
  const [playing, setPlaying] = useState(false);

  const nowRef = useRef(now);
  nowRef.current = now;
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const customRef = useRef(custom);
  customRef.current = custom;

  /** Instante que se está visualizando. Por defecto sigue al reloj (`selectedTime = currentTime`). */
  const selectedTime = mode === "now" ? now : custom;

  const goNow = useCallback(() => {
    setPlaying(false);
    setMode("now");
  }, []);

  const scrub = useCallback((ms: number) => {
    setPlaying(false);
    setMode("ahead");
    setCustom(clamp(ms, rangeRef.current.start, rangeRef.current.end));
  }, []);

  const startAhead = useCallback(() => {
    const r = rangeRef.current;
    const n = nowRef.current;
    const from = n < r.start || n > r.end - 20 * 60_000 ? r.start : n;
    setCustom(from);
    setMode("ahead");
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const r = rangeRef.current;
    if (customRef.current >= r.end - 60_000) setCustom(r.start);
    setMode("ahead");
    setPlaying(true);
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      const dt = t - last;
      last = t;
      const next = customRef.current + dt * PLAY_MINUTES_PER_SECOND * 60;
      const end = rangeRef.current.end;
      if (next >= end) {
        setCustom(end);
        setPlaying(false);
      } else {
        setCustom(next);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [playing]);

  return { mode, selectedTime, playing, scrub, goNow, startAhead, togglePlay };
}
