import { describe, expect, it } from "vitest";
import {
  DAY_ANIMATION_STEP_MS,
  createDayAnimation,
  dayTimeAt,
  easeInOutSine,
  type AnimationClock,
} from "../dayAnimation";

const range = { start: Date.UTC(2026, 9, 22, 6, 0), end: Date.UTC(2026, 9, 22, 17, 0) };

/** Reloj falso: cada `step()` avanza `ms` y ejecuta el fotograma pendiente. */
function fakeClock() {
  let now = 0;
  let pending: ((ts: number) => void) | null = null;
  const clock: AnimationClock = {
    now: () => now,
    request: (cb) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    clock,
    step(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.(now);
    },
    get pending() {
      return pending !== null;
    },
  };
}

describe("dayTimeAt", () => {
  it("va del amanecer al atardecer, en pasos de 10 s y sin retroceder", () => {
    expect(dayTimeAt(0, range)).toBe(range.start);
    expect(dayTimeAt(1, range)).toBe(range.end);
    let prev = -Infinity;
    for (let p = 0; p <= 1; p += 0.01) {
      const t = dayTimeAt(p, range);
      expect(t % DAY_ANIMATION_STEP_MS).toBe(0);
      expect(t).toBeGreaterThan(prev - 1);
      prev = t;
    }
  });

  it("la curva arranca y frena suave", () => {
    expect(easeInOutSine(0)).toBe(0);
    expect(easeInOutSine(1)).toBeCloseTo(1, 9);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOutSine(0.05)).toBeLessThan(0.05);
  });
});

describe("createDayAnimation", () => {
  it("recorre el día en la duración pedida y resuelve true", async () => {
    const fc = fakeClock();
    const seen: number[] = [];
    const anim = createDayAnimation({ getRange: () => range, scrub: (t) => seen.push(t), durationMs: 1000 }, fc.clock);
    const done = anim.play();
    expect(seen[0]).toBe(range.start);
    for (let i = 0; i < 70 && fc.pending; i++) fc.step(16);
    expect(await done).toBe(true);
    expect(seen[seen.length - 1]).toBe(range.end);
    expect(anim.playing).toBe(false);
    // Nunca repite la misma hora seguida.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it("stop() resuelve false; pause() congela y resume() sigue", async () => {
    const fc = fakeClock();
    const anim = createDayAnimation({ getRange: () => range, scrub: () => {}, durationMs: 1000 }, fc.clock);
    const done = anim.play();
    fc.step(16);
    fc.step(16);
    anim.pause();
    const p = anim.progress;
    fc.step(500);
    expect(anim.progress).toBe(p);
    anim.resume();
    fc.step(16);
    expect(anim.progress).toBeGreaterThan(p);
    anim.stop();
    expect(await done).toBe(false);
  });

  it("un hueco largo (pestaña oculta) no salta media animación", () => {
    const fc = fakeClock();
    const anim = createDayAnimation({ getRange: () => range, scrub: () => {}, durationMs: 1000 }, fc.clock);
    void anim.play();
    fc.step(5000);
    expect(anim.progress).toBeLessThan(0.11);
    anim.stop();
  });
});
