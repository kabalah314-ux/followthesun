import { compassLabel } from "./solarCalculations";
import { formatClock, formatDuration } from "../services/timeService";
import type { SunState, TimelineInterval } from "../types";

/**
 * Frase-respuesta: traduce el estado del sol de un punto (o de la ciudad) a lo que la persona
 * necesita saber, con una hora concreta. «Sol directo aquí hasta las 17:05» en vez de «sol parcial
 * 45 %». Funciones puras: sin red ni mapa; todo llega por parámetros.
 */

export type AnswerState = SunState | "night";
export type SunShadeMode = "sun" | "shade";

export interface SunAnswer {
  /** Estado que resume la respuesta (icono). */
  state: AnswerState;
  /** Frase principal, con hora. */
  headline: string;
  /** Contexto en una línea, o null. */
  detail: string | null;
  /** Lo que queda del estado actual (ms), si aplica. */
  remainingMs: number | null;
}

const MIN = 60_000;
/** Un tramo que acaba a menos de esto de la puesta se lee «hasta la puesta». */
const NEAR_SUNSET = 6 * MIN;
/** Sensación térmica a partir de la que se habla de calor (°C). */
export const DEFAULT_HEAT_FROM_C = 27;

const sunny = (s: SunState) => s === "sun" || s === "partial";
const round = (v: number) => Math.round(v);

export interface PointAnswerInput {
  /** Instante evaluado. */
  time: number;
  /** Tramos del día del punto (orto → ocaso), en orden. */
  intervals: TimelineInterval[];
  sunrise: number;
  sunset: number;
  /** Orto del día siguiente (para la noche). */
  nextSunrise?: number | null;
  /** false: sin datos de nubes; el sol es «posible», no confirmado. */
  weatherAvailable?: boolean;
  /** Modo de la app: buscar sol o buscar sombra. */
  mode?: SunShadeMode;
  /** Sensación térmica (°C), si se conoce. */
  apparentC?: number | null;
  heatFromC?: number;
  /** Formato de hora (por defecto, el de la app en hora de Barcelona). */
  clock?: (ms: number) => string;
}

function currentIndex(intervals: TimelineInterval[], time: number): number {
  const i = intervals.findIndex((iv) => time >= iv.start && time < iv.end);
  if (i >= 0) return i;
  if (intervals.length === 0) return -1;
  if (time < intervals[0].start) return 0;
  return intervals.length - 1;
}

function nightAnswer(input: { time: number; sunrise: number; sunset: number; nextSunrise?: number | null; firstSun?: number | null }, clock: (ms: number) => string): SunAnswer {
  if (input.time >= input.sunset) {
    return {
      state: "night",
      headline: "Ya no hay sol",
      detail: input.nextSunrise ? `Mañana sale a las ${clock(input.nextSunrise)}` : null,
      remainingMs: null,
    };
  }
  const arrives =
    input.firstSun != null && input.firstSun - input.sunrise > 10 * MIN ? ` y llega aquí a las ${clock(input.firstSun)}` : "";
  return {
    state: "night",
    headline: "Todavía es de noche",
    detail: `Sale a las ${clock(input.sunrise)}${arrives}`,
    remainingMs: null,
  };
}

/** Respuesta para un punto concreto a partir de sus tramos del día. */
export function describePoint(input: PointAnswerInput): SunAnswer {
  const clock = input.clock ?? formatClock;
  const { time, intervals, sunrise, sunset } = input;
  const heat = input.apparentC != null && input.apparentC >= (input.heatFromC ?? DEFAULT_HEAT_FROM_C);
  const shadeMode = input.mode === "shade";
  const firstSun = intervals.find((iv) => sunny(iv.state))?.start ?? null;

  if (time >= sunset || time < sunrise) {
    return nightAnswer({ time, sunrise, sunset, nextSunrise: input.nextSunrise, firstSun }, clock);
  }

  const idx = currentIndex(intervals, time);
  if (idx < 0) {
    return { state: "shade", headline: "Sin sol directo aquí ahora", detail: `El sol se pone a las ${clock(sunset)}`, remainingMs: null };
  }
  const cur = intervals[idx];
  const untilSunset = (end: number) => end >= sunset - NEAR_SUNSET;
  const until = (end: number) => (untilSunset(end) ? `hasta la puesta (${clock(sunset)})` : `hasta las ${clock(end)}`);

  if (sunny(cur.state)) {
    let j = idx;
    while (j + 1 < intervals.length && sunny(intervals[j + 1].state)) j++;
    const runEnd = intervals[j].end;
    const next = intervals[j + 1]?.state;

    if (shadeMode) {
      const shadeAt = intervals.slice(idx + 1).find((iv) => iv.state === "shade")?.start ?? null;
      return {
        state: cur.state,
        headline: heat ? `Sol aquí ahora: ${round(input.apparentC!)} °C de sensación` : "Sol aquí ahora",
        detail: shadeAt ? `Sombra a partir de las ${clock(shadeAt)}` : `Sol hasta la puesta, a las ${clock(sunset)}`,
        remainingMs: runEnd - time,
      };
    }

    const what =
      input.weatherAvailable === false ? "Sol posible aquí" : cur.state === "sun" ? "Sol directo aquí" : "Sol suave (nubes finas)";
    const after = next === "shade" ? " · después, sombra" : next === "cloud" ? " · después, nubes" : "";
    return {
      state: cur.state,
      headline: `${what} ${until(runEnd)}`,
      detail: `Quedan ${formatDuration(runEnd - time)}${after}`,
      remainingMs: runEnd - time,
    };
  }

  if (cur.state === "cloud") {
    let j = idx;
    while (j + 1 < intervals.length && intervals[j + 1].state === "cloud") j++;
    const end = intervals[j].end;
    const next = intervals[j + 1]?.state;
    return {
      state: "cloud",
      headline: `Nubes ${until(end)}`,
      detail: next ? (sunny(next) ? "Después, sol probable" : "Después, sombra de edificios") : null,
      remainingMs: end - time,
    };
  }

  // Sombra (edificios o relieve).
  const back = intervals.slice(idx + 1).find((iv) => sunny(iv.state))?.start ?? null;
  if (shadeMode) {
    return {
      state: "shade",
      headline: back ? `Sombra aquí hasta las ${clock(back)}` : "Sombra el resto del día",
      detail: heat
        ? `${round(input.apparentC!)} °C de sensación al sol`
        : back
          ? `Quedan ${formatDuration(back - time)} de sombra`
          : `El sol se pone a las ${clock(sunset)}`,
      remainingMs: back ? back - time : null,
    };
  }
  return {
    state: "shade",
    headline: back ? `Sombra ahora · vuelve el sol a las ${clock(back)}` : "Sombra el resto del día",
    detail: back ? `En ${formatDuration(back - time)}` : `El sol se pone a las ${clock(sunset)}`,
    remainingMs: back ? back - time : null,
  };
}

export interface CityAnswerInput {
  time: number;
  sunrise: number;
  sunset: number;
  nextSunrise?: number | null;
  /** % del área visible con sol directo / en sombra / tapado por nubes. */
  sunPercent?: number | null;
  shadePercent?: number | null;
  cloudPercent?: number | null;
  temperatureC?: number | null;
  apparentC?: number | null;
  mode?: SunShadeMode;
  heatFromC?: number;
  clock?: (ms: number) => string;
}

/** Respuesta para lo que se ve en el mapa (sin un punto elegido). */
export function describeCity(input: CityAnswerInput): SunAnswer {
  const clock = input.clock ?? formatClock;
  const { time, sunrise, sunset } = input;
  if (time >= sunset || time < sunrise) return nightAnswer({ time, sunrise, sunset, nextSunrise: input.nextSunrise }, clock);

  const heat = input.apparentC != null && input.apparentC >= (input.heatFromC ?? DEFAULT_HEAT_FROM_C);
  const shadeMode = input.mode === "shade";
  const parts: string[] = [`Se pone a las ${clock(sunset)}`];
  if (input.temperatureC != null) parts.push(`${round(input.temperatureC)} °C`);
  if (heat) parts.push(`sensación ${round(input.apparentC!)} °C`);
  const detail = parts.join(" · ");

  if (input.cloudPercent != null && input.cloudPercent >= 65) {
    return { state: "cloud", headline: "Las nubes tapan casi todo el sol", detail, remainingMs: null };
  }
  // Sin muestras todavía (el mapa acaba de cargar o se está recalculando la hora): sol y sombra a 0.
  const sampled = (input.sunPercent ?? 0) + (input.shadePercent ?? 0) > 0;
  if (!sampled && (input.sunPercent != null || input.shadePercent != null)) {
    return { state: "sun", headline: "Calculando dónde da el sol…", detail, remainingMs: null };
  }
  if (shadeMode) {
    const shade = input.shadePercent ?? (input.sunPercent != null ? 100 - input.sunPercent : null);
    return {
      state: "shade",
      headline: shade != null ? `Sombra en el ${round(shade)} % de las calles que ves` : "Hace calor: busca la sombra",
      detail,
      remainingMs: null,
    };
  }
  if (input.sunPercent != null && input.sunPercent < 10) {
    return {
      state: "shade",
      headline: "Casi todo está a la sombra ahora",
      detail: `Sol directo en el ${round(input.sunPercent)} % de las calles que ves · ${detail}`,
      remainingMs: null,
    };
  }
  return {
    state: "sun",
    headline: input.sunPercent != null ? `Sol directo en el ${round(input.sunPercent)} % de las calles que ves` : "Hay sol en Barcelona",
    detail,
    remainingMs: null,
  };
}

const COMPASS_WORDS: Record<string, string> = {
  N: "el norte",
  NE: "el noreste",
  E: "el este",
  SE: "el sureste",
  S: "el sur",
  SO: "el suroeste",
  O: "el oeste",
  NO: "el noroeste",
};

/** «Sol bajo por el suroeste» · «Sol alto por el sur». */
export function sunPositionPhrase(altitudeDeg: number, azimuthDeg: number): string {
  const where = COMPASS_WORDS[compassLabel(azimuthDeg)] ?? "el horizonte";
  const height = altitudeDeg < 15 ? "Sol bajo" : altitudeDeg < 45 ? "Sol" : "Sol alto";
  return `${height} por ${where}`;
}
