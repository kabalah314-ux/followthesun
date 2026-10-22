import { useCallback, useEffect, useRef, useState } from "react";
import { createDayAnimation, type DayAnimation, type DayRange } from "./dayAnimation";

export interface UseDayAnimationOptions {
  /** Tramo a recorrer (normalmente `sunriseSunsetRange(dayStart)`). */
  getRange(): DayRange;
  /** Mueve la hora de la app (p. ej. `setSelectedTime`). */
  scrub(timeMs: number): void;
  durationMs?: number;
  /**
   * Cada cuánto se entrega la hora a la app (ms). Por defecto 100: la interfaz se actualiza ~10
   * veces por segundo y el motor solar suaviza las sombras entre medias (sin re-renderizar React
   * en cada fotograma).
   */
  minScrubIntervalMs?: number;
}

export interface DayAnimationControls {
  playing: boolean;
  /** Avance 0-1. */
  progress: number;
  play(): void;
  stop(): void;
  toggle(): void;
}

/**
 * Botón «▶ el día en 12 s» listo para usar (p. ej. en la línea de tiempo):
 *
 *   const day = useDayAnimation({ getRange: () => sunriseSunsetRange(dayStart), scrub: setSelectedTime });
 *   <button onClick={day.toggle}>{day.playing ? "Parar" : "Ver el día"}</button>
 */
export function useDayAnimation(o: UseDayAnimationOptions): DayAnimationControls {
  const optsRef = useRef(o);
  optsRef.current = o;
  const animRef = useRef<DayAnimation | null>(null);
  const [state, setState] = useState({ playing: false, progress: 0 });

  useEffect(
    () => () => {
      animRef.current?.stop();
      animRef.current = null;
    },
    []
  );

  const stop = useCallback(() => {
    animRef.current?.stop();
  }, []);

  const play = useCallback(() => {
    animRef.current?.stop();
    let lastUi = -1;
    const anim = createDayAnimation({
      getRange: () => optsRef.current.getRange(),
      scrub: (t) => optsRef.current.scrub(t),
      durationMs: optsRef.current.durationMs,
      minScrubIntervalMs: optsRef.current.minScrubIntervalMs ?? 100,
      onFrame: ({ progress }) => {
        // La barra de avance no necesita 60 actualizaciones por segundo.
        const p = Math.round(progress * 100);
        if (p !== lastUi) {
          lastUi = p;
          setState({ playing: true, progress });
        }
      },
      onEnd: (completed) => {
        if (animRef.current === anim) animRef.current = null;
        setState({ playing: false, progress: completed ? 1 : 0 });
      },
    });
    animRef.current = anim;
    setState({ playing: true, progress: 0 });
    void anim.play();
  }, []);

  const toggle = useCallback(() => {
    if (animRef.current?.playing) stop();
    else play();
  }, [play, stop]);

  return { ...state, play, stop, toggle };
}
