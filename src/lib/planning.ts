import { BARCELONA, SUN_SCORE_CONFIG as SC } from "../config";
import type {
  LngLat,
  LocationTypeFilter,
  SunIntent,
  SunPreference,
  SunSearchRequest,
  WhenPreset,
} from "../types";
import { dayChoiceLabel, dayStartFor, hhmm, minutesOfDay, zonedMs } from "./planningTime";
import { getSunTimes } from "./solarCalculations";

/**
 * Sun Session Planner — traduce lo que la persona elige en la interfaz a una `SunSearchRequest`.
 * Toda la lógica de franjas ("ahora", "esta tarde", "mañana"…) vive aquí, no en los componentes.
 */

const MIN = 60_000;

export interface PlannerState {
  intent: SunIntent;
  when: WhenPreset;
  /** Solo con `when: "custom"`: 0 = hoy … 6. */
  dayOffset: number;
  /** Minutos desde las 00:00 locales (solo con `when: "custom"`). */
  fromMinutes: number;
  toMinutes: number;
  /** Duración que se quiere disfrutar. */
  durationMinutes: number;
  /** null = cualquier distancia. */
  maxWalkingMinutes: number | null;
  locationType: LocationTypeFilter;
  preference: SunPreference;
  avoidClouds: boolean;
  preferShadeBreaks: boolean;
}

export const DEFAULT_PLANNER: PlannerState = {
  intent: "sun",
  when: "now",
  dayOffset: 0,
  fromMinutes: 17 * 60,
  toMinutes: 19 * 60,
  durationMinutes: 60,
  maxWalkingMinutes: null,
  locationType: "any",
  preference: "maximum_sun",
  avoidClouds: false,
  preferShadeBreaks: false,
};

export interface PlannerContext {
  now: number;
  origin: LngLat | null;
}

const sunOf = (now: number, offset: number) =>
  getSunTimes(dayStartFor(now, offset), BARCELONA.lat, BARCELONA.lng);

/** Franja de tiempo [inicio, fin] de una elección del planificador. */
export function resolveTimeRange(p: PlannerState, now: number): { start: number; end: number } {
  const D = p.durationMinutes * MIN;
  const minuteNow = Math.floor(now / MIN) * MIN;

  switch (p.when) {
    case "now":
      return { start: minuteNow, end: minuteNow + D };
    case "in30":
      return { start: minuteNow + 30 * MIN, end: minuteNow + 30 * MIN + D };
    case "in60":
      return { start: minuteNow + 60 * MIN, end: minuteNow + 60 * MIN + D };
    case "afternoon": {
      const day = dayStartFor(now, 0);
      const sun = sunOf(now, 0);
      const start = Math.max(minuteNow, zonedMs(day, SC.presets.afternoonFromHour * 60));
      let end = Math.min(sun.sunset, zonedMs(day, SC.presets.afternoonUntilHour * 60));
      if (end - start < D) end = start + D;
      return { start, end };
    }
    case "sunset": {
      let offset = 0;
      let sun = sunOf(now, 0);
      if (sun.sunset <= now) {
        offset = 1;
        sun = sunOf(now, offset);
      }
      const lead = Math.max(D, SC.presets.sunsetLeadMinutes * MIN);
      return { start: sun.sunset - lead, end: sun.sunset };
    }
    case "tomorrow": {
      const sun = sunOf(now, 1);
      return { start: sun.sunrise, end: sun.sunset };
    }
    case "custom": {
      const day = dayStartFor(now, p.dayOffset);
      const start = zonedMs(day, p.fromMinutes);
      let end = zonedMs(day, p.toMinutes);
      if (end <= start) end = start + D;
      return { start, end };
    }
  }
}

export function buildSearchRequest(p: PlannerState, ctx: PlannerContext): SunSearchRequest {
  const { start, end } = resolveTimeRange(p, ctx.now);
  const spanMin = Math.max(10, Math.round((end - start) / MIN));
  return {
    startTime: start,
    endTime: end,
    // La duración no puede superar la franja elegida.
    minimumSunlightMinutes: Math.min(p.durationMinutes, spanMin),
    maximumWalkingMinutes: p.maxWalkingMinutes ?? undefined,
    origin: ctx.origin,
    locationType: p.locationType,
    intent: p.intent,
    preference: p.preference,
    avoidClouds: p.avoidClouds,
    preferShadeBreaks: p.preferShadeBreaks,
  };
}

/* -------------------------------------------------------------------------- */
/*  Atajos de primera clase                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Franja con la que arranca el planificador: lo que queda de hoy (si queda luz) o, si ya se ha
 * puesto el sol, la mañana de mañana. Siempre en bloques de 15 min.
 */
export function defaultPlannerWindow(now: number): { dayOffset: number; fromMinutes: number; toMinutes: number } {
  const sunsetToday = minutesOfDay(sunOf(now, 0).sunset);
  const nowMin = minutesOfDay(now);
  const from = Math.min(1439, Math.ceil((nowMin + 15) / 15) * 15);
  if (sunsetToday - from >= 60) {
    return { dayOffset: 0, fromMinutes: from, toMinutes: Math.min(sunsetToday, from + 90) };
  }
  const tomorrow = minutesOfDay(sunOf(now, 1).sunrise);
  const tomorrowFrom = Math.min(1439, Math.ceil((tomorrow + 30) / 15) * 15);
  return { dayOffset: 1, fromMinutes: tomorrowFrom, toMinutes: Math.min(1439, tomorrowFrom + 120) };
}

/** «Encuéntrame 1 hora de sol»: ahora, máximo sol, cerca si hay ubicación. */
export function oneHourOfSun(minutes: number, hasOrigin: boolean): PlannerState {
  return {
    ...DEFAULT_PLANNER,
    durationMinutes: minutes,
    when: "now",
    maxWalkingMinutes: hasOrigin ? 20 : null,
  };
}

/** «Quiero sol a las 17:30 durante 1 hora». Si esa franja ya pasó hoy, se busca mañana. */
export function sunAt(timeMinutes: number, durationMinutes: number, now: number): PlannerState {
  const from = Math.min(timeMinutes, 24 * 60 - 1);
  const today = zonedMs(dayStartFor(now, 0), from);
  const dayOffset = today + durationMinutes * MIN < now ? 1 : 0;
  return {
    ...DEFAULT_PLANNER,
    when: "custom",
    dayOffset,
    fromMinutes: from,
    toMinutes: Math.min(from + durationMinutes, 24 * 60 - 1),
    durationMinutes,
  };
}

/** «Planear mi tarde»: 14:00 → 19:00 (mañana si ya es tarde). */
export function planAfternoon(now: number): PlannerState {
  const late = now > zonedMs(dayStartFor(now, 0), 18 * 60);
  return {
    ...DEFAULT_PLANNER,
    when: "custom",
    dayOffset: late ? 1 : 0,
    fromMinutes: SC.presets.afternoonFromHour * 60,
    toMinutes: SC.presets.afternoonPlanTo * 60,
    durationMinutes: 60,
  };
}

/* -------------------------------------------------------------------------- */
/*  Etiquetas                                                                  */
/* -------------------------------------------------------------------------- */

export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

export function whenLabel(p: PlannerState, now: number): string {
  switch (p.when) {
    case "now":
      return "Ahora";
    case "in30":
      return "En 30 min";
    case "in60":
      return "En 1 h";
    case "afternoon":
      return "Esta tarde";
    case "sunset":
      return "Al atardecer";
    case "tomorrow":
      return "Mañana";
    case "custom":
      return `${dayChoiceLabel(dayStartFor(now, p.dayOffset), now)} ${hhmm(p.fromMinutes)}–${hhmm(p.toMinutes)}`;
  }
}

export function distanceLabel(maxWalkingMinutes: number | null): string {
  return maxWalkingMinutes === null ? "Cualquier distancia" : `≤ ${maxWalkingMinutes} min a pie`;
}
