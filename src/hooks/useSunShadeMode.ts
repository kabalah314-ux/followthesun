import { useCallback, useEffect, useState } from "react";
import { SUN_SHADE_AUTO } from "../config";
import { onIdle } from "../lib/idle";
import { comfortAt, comfortService } from "../services/comfortService";
import { zoneDayKey } from "../services/timeService";
import { usePreferences } from "./usePreferences";

export type SunShadeMode = "sun" | "shade";

export interface SunShadeState {
  /** Modo efectivo: la elección manual de hoy o, si no la hay, el automático. */
  mode: SunShadeMode;
  /** Lo que propondría la app por la temperatura. */
  auto: SunShadeMode;
  overridden: boolean;
  /** Temperatura y sensación térmica del modelo en la próxima media hora, si se conocen. */
  temperatureC: number | null;
  apparentC: number | null;
  /** Sensación al sol directo (lib/comfort.ts), si se conoce. */
  sunExposedC: number | null;
  /** Elección manual: dura hasta la medianoche de Barcelona. */
  choose(mode: SunShadeMode): void;
}

const HALF_HOUR = 30 * 60_000;

/**
 * Modo «busco sol / busco sombra». Por defecto lo decide la sensación térmica
 * (`SUN_SHADE_AUTO.shadeFromApparentC`); si la persona elige, se respeta hasta medianoche.
 * La temperatura se pide una vez (caché de 60 min de comfortService), en tiempo ocioso.
 */
export function useSunShadeMode(now: number): SunShadeState {
  const [prefs, setPrefs] = usePreferences();
  const [comfort, setComfort] = useState<{ temp: number; apparent: number; sun: number | null } | null>(null);
  const slot = Math.floor(now / HALF_HOUR);

  useEffect(() => {
    let alive = true;
    const cancel = onIdle(() => {
      void comfortService.load().then((ok) => {
        if (!alive || !ok) return;
        const t = Date.now();
        const s = comfortService.summarize(t, t + HALF_HOUR);
        const sun = comfortAt(t + HALF_HOUR / 2)?.alSolC ?? null;
        setComfort(s ? { temp: s.meanTemperatureC, apparent: s.meanApparentC, sun } : null);
      });
    }, 3500);
    return () => {
      alive = false;
      cancel();
    };
  }, [slot]);

  const today = zoneDayKey(now);
  const override = prefs.sunShadeOverride && prefs.sunShadeOverride.day === today ? prefs.sunShadeOverride.mode : null;
  // Con la sensación al sol (incluye la radiación) se decide con su propio umbral; si falta, con la
  // sensación térmica del modelo, como antes.
  const auto: SunShadeMode = !comfort
    ? "sun"
    : comfort.sun !== null
      ? comfort.sun >= SUN_SHADE_AUTO.shadeFromSunExposedC
        ? "shade"
        : "sun"
      : comfort.apparent >= SUN_SHADE_AUTO.shadeFromApparentC
        ? "shade"
        : "sun";

  const choose = useCallback(
    (mode: SunShadeMode) => setPrefs({ sunShadeOverride: { mode, day: zoneDayKey(Date.now()) } }),
    [setPrefs]
  );

  return {
    mode: override ?? auto,
    auto,
    overridden: override !== null,
    temperatureC: comfort?.temp ?? null,
    apparentC: comfort?.apparent ?? null,
    sunExposedC: comfort?.sun ?? null,
    choose,
  };
}
