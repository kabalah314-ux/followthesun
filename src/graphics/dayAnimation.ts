import { BARCELONA, GRAPHICS } from "../config";
import { clamp } from "../lib/coordinates";
import { solarService } from "../services/solarService";

/**
 * «El día en 12 segundos»: recorre la hora del amanecer al atardecer con una curva suave y la
 * entrega a quien la pinta (`scrub`). No conoce el mapa ni React: el que llama decide cómo se
 * mueve el reloj de la app (normalmente, el mismo `setSelectedTime` del selector de hora).
 *
 *   const anim = createDayAnimation({ getRange: () => sunriseSunsetRange(dayStart), scrub: setTime });
 *   await anim.play();   // resuelve true al terminar, false si se detuvo
 */

export type Easing = (t: number) => number;

/** Arranca y frena suave (la luz del mediodía pasa algo más rápido que la de las horas doradas). */
export const easeInOutSine: Easing = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
export const linear: Easing = (t) => clamp(t, 0, 1);

export interface DayRange {
  start: number;
  end: number;
}

/** Del amanecer al atardecer (con margen de luz dorada) del día que empieza en `dayStart`. */
export function sunriseSunsetRange(dayStart: number, marginMinutes = 20): DayRange {
  const t = solarService.getSunTimes(dayStart, BARCELONA.lat, BARCELONA.lng);
  return { start: t.sunrise - marginMinutes * 60_000, end: t.sunset + marginMinutes * 60_000 };
}

/** Paso de la hora animada: 10 s de reloj (fluido incluso en el arranque y la frenada suaves). */
export const DAY_ANIMATION_STEP_MS = 10_000;

/** Hora (ms) para un avance 0-1 de la animación, redondeada a 10 s. */
export function dayTimeAt(progress: number, range: DayRange, easing: Easing = easeInOutSine): number {
  const t = range.start + (range.end - range.start) * easing(clamp(progress, 0, 1));
  return Math.round(t / DAY_ANIMATION_STEP_MS) * DAY_ANIMATION_STEP_MS;
}

export interface DayAnimationOptions {
  getRange(): DayRange;
  /** Recibe cada hora nueva (solo cuando cambia: pasos de 10 s de reloj del día). */
  scrub(timeMs: number): void;
  onFrame?(state: { progress: number; time: number }): void;
  /** Al terminar (`true`) o detenerse (`false`). */
  onEnd?(completed: boolean): void;
  /** Duración (por defecto 12 s). */
  durationMs?: number;
  easing?: Easing;
  loop?: boolean;
}

export interface DayAnimation {
  /** Empieza (o vuelve a empezar si había terminado). Resuelve al terminar o detenerse. */
  play(): Promise<boolean>;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Salta a un avance 0-1 (también en pausa). */
  seek(progress: number): void;
  readonly playing: boolean;
  readonly progress: number;
}

/** Reloj inyectable (los tests usan uno falso). */
export interface AnimationClock {
  now(): number;
  request(cb: (ts: number) => void): number;
  cancel(id: number): void;
}

const browserClock: AnimationClock = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export function createDayAnimation(o: DayAnimationOptions, clock: AnimationClock = browserClock): DayAnimation {
  const duration = Math.max(500, o.durationMs ?? GRAPHICS.dayAnimationMs);
  const easing = o.easing ?? easeInOutSine;
  let range: DayRange | null = null;
  let progress = 0;
  let playing = false;
  let raf = 0;
  let lastTs = 0;
  let lastScrub = Number.NaN;
  let resolver: ((done: boolean) => void) | null = null;
  let current: Promise<boolean> | null = null;

  const emit = () => {
    if (!range) range = o.getRange();
    const time = dayTimeAt(progress, range, easing);
    if (time !== lastScrub) {
      lastScrub = time;
      o.scrub(time);
    }
    o.onFrame?.({ progress, time });
  };

  const finish = (completed: boolean) => {
    playing = false;
    if (raf) clock.cancel(raf);
    raf = 0;
    o.onEnd?.(completed);
    const r = resolver;
    resolver = null;
    current = null;
    r?.(completed);
  };

  const tick = (ts: number) => {
    if (!playing) return;
    // Pestaña oculta o fotograma perdido: no se salta media animación de golpe.
    const dt = clamp(ts - lastTs, 0, 100);
    lastTs = ts;
    progress = Math.min(1, progress + dt / duration);
    emit();
    if (progress >= 1) {
      if (!o.loop) {
        finish(true);
        return;
      }
      progress = 0;
      range = o.getRange();
    }
    raf = clock.request(tick);
  };

  const start = () => {
    playing = true;
    lastTs = clock.now();
    raf = clock.request(tick);
  };

  return {
    play() {
      if (current) {
        if (!playing) start();
        return current;
      }
      if (progress >= 1) progress = 0;
      range = o.getRange();
      lastScrub = Number.NaN;
      current = new Promise<boolean>((resolve) => {
        resolver = resolve;
      });
      emit();
      start();
      return current;
    },
    pause() {
      if (!playing) return;
      playing = false;
      if (raf) clock.cancel(raf);
      raf = 0;
    },
    resume() {
      if (playing || !current) return;
      start();
    },
    stop() {
      if (!current && !playing) return;
      finish(false);
    },
    seek(p: number) {
      progress = clamp(p, 0, 1);
      emit();
    },
    get playing() {
      return playing;
    },
    get progress() {
      return progress;
    },
  };
}
