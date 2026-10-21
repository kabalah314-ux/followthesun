import { compassIndex } from "./solarCalculations";
import { formatClock, formatDuration } from "../services/timeService";
import type { SunState, TimelineInterval } from "../types";
import { tr } from "../i18n";

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
      headline: tr("answer.ya_no_hay_sol"),
      detail: input.nextSunrise ? tr("answer.manana_sale_a_las", { p0: clock(input.nextSunrise) }) : null,
      remainingMs: null,
    };
  }
  const arrives =
    input.firstSun != null && input.firstSun - input.sunrise > 10 * MIN ? tr("answer.y_llega_aqui_a_las", { p0: clock(input.firstSun) }) : "";
  return {
    state: "night",
    headline: tr("answer.todavia_es_de_noche"),
    detail: tr("answer.sale_a_las", { p0: clock(input.sunrise), p1: arrives }),
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
    return { state: "shade", headline: tr("answer.sin_sol_directo_aqui_ahora"), detail: tr("answer.el_sol_se_pone_a", { p0: clock(sunset) }), remainingMs: null };
  }
  const cur = intervals[idx];
  const untilSunset = (end: number) => end >= sunset - NEAR_SUNSET;
  const until = (end: number) => (untilSunset(end) ? tr("answer.hasta_la_puesta", { p0: clock(sunset) }) : tr("answer.hasta_las", { p0: clock(end) }));

  if (sunny(cur.state)) {
    let j = idx;
    while (j + 1 < intervals.length && sunny(intervals[j + 1].state)) j++;
    const runEnd = intervals[j].end;
    const next = intervals[j + 1]?.state;

    if (shadeMode) {
      const shadeAt = intervals.slice(idx + 1).find((iv) => iv.state === "shade")?.start ?? null;
      return {
        state: cur.state,
        headline: heat ? tr("answer.sol_aqui_ahora_c_de", { p0: round(input.apparentC!) }) : tr("answer.sol_aqui_ahora"),
        detail: shadeAt ? tr("answer.sombra_a_partir_de_las", { p0: clock(shadeAt) }) : tr("answer.sol_hasta_la_puesta_a", { p0: clock(sunset) }),
        remainingMs: runEnd - time,
      };
    }

    const what =
      input.weatherAvailable === false ? tr("answer.sol_posible_aqui") : cur.state === "sun" ? tr("answer.sol_directo_aqui") : tr("answer.sol_suave_nubes_finas");
    const after = next === "shade" ? tr("answer.despues_sombra") : next === "cloud" ? tr("answer.despues_nubes") : "";
    return {
      state: cur.state,
      headline: `${what} ${until(runEnd)}`,
      detail: tr("answer.quedan", { p0: formatDuration(runEnd - time) }) + after,
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
      headline: tr("answer.nubes", { p0: until(end) }),
      detail: next ? (sunny(next) ? tr("answer.despues_sol_probable") : tr("answer.despues_sombra_de_edificios")) : null,
      remainingMs: end - time,
    };
  }

  // Sombra (edificios o relieve).
  const back = intervals.slice(idx + 1).find((iv) => sunny(iv.state))?.start ?? null;
  if (shadeMode) {
    return {
      state: "shade",
      headline: back ? tr("answer.sombra_aqui_hasta_las", { p0: clock(back) }) : tr("answer.sombra_el_resto_del_dia"),
      detail: heat
        ? tr("answer.c_de_sensacion_al_sol", { p0: round(input.apparentC!) })
        : back
          ? tr("answer.quedan_de_sombra", { p0: formatDuration(back - time) })
          : tr("answer.el_sol_se_pone_a", { p0: clock(sunset) }),
      remainingMs: back ? back - time : null,
    };
  }
  return {
    state: "shade",
    headline: back ? tr("answer.sombra_ahora_vuelve_el_sol", { p0: clock(back) }) : tr("answer.sombra_el_resto_del_dia"),
    detail: back ? tr("answer.en", { p0: formatDuration(back - time) }) : tr("answer.el_sol_se_pone_a", { p0: clock(sunset) }),
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
  const parts: string[] = [tr("answer.se_pone_a_las", { p0: clock(sunset) })];
  if (input.temperatureC != null) parts.push(`${round(input.temperatureC)} °C`);
  if (heat) parts.push(tr("answer.sensacion_c", { p0: round(input.apparentC!) }));
  const detail = parts.join(" · ");

  if (input.cloudPercent != null && input.cloudPercent >= 65) {
    return { state: "cloud", headline: tr("answer.las_nubes_tapan_casi_todo"), detail, remainingMs: null };
  }
  // Sin muestras todavía (el mapa acaba de cargar o se está recalculando la hora): sol y sombra a 0.
  const sampled = (input.sunPercent ?? 0) + (input.shadePercent ?? 0) > 0;
  if (!sampled && (input.sunPercent != null || input.shadePercent != null)) {
    return { state: "sun", headline: tr("answer.calculando_donde_da_el_sol"), detail, remainingMs: null };
  }
  if (shadeMode) {
    const shade = input.shadePercent ?? (input.sunPercent != null ? 100 - input.sunPercent : null);
    return {
      state: "shade",
      headline: shade != null ? tr("answer.sombra_en_el_de_las", { p0: round(shade) }) : tr("answer.hace_calor_busca_la_sombra"),
      detail,
      remainingMs: null,
    };
  }
  if (input.sunPercent != null && input.sunPercent < 10) {
    return {
      state: "shade",
      headline: tr("answer.casi_todo_esta_a_la"),
      detail: tr("answer.sol_directo_en_el_de", { p0: round(input.sunPercent), p1: detail }),
      remainingMs: null,
    };
  }
  return {
    state: "sun",
    headline: input.sunPercent != null ? tr("answer.sol_directo_en_el_de_2", { p0: round(input.sunPercent) }) : tr("answer.hay_sol_en_barcelona"),
    detail,
    remainingMs: null,
  };
}

/** Dónde está el sol, en el orden de `compassIndex` (N, NE, E… NO). Con la preposición de cada idioma: «pel nord», «per l'est». */
const SUN_WHERE = [
  tr("answer.por_el_norte"),
  tr("answer.por_el_noreste"),
  tr("answer.por_el_este"),
  tr("answer.por_el_sureste"),
  tr("answer.por_el_sur"),
  tr("answer.por_el_suroeste"),
  tr("answer.por_el_oeste"),
  tr("answer.por_el_noroeste"),
];

/** «Sol bajo por el suroeste» · «Sol alto por el sur». */
export function sunPositionPhrase(altitudeDeg: number, azimuthDeg: number): string {
  const where = SUN_WHERE[compassIndex(azimuthDeg)] ?? tr("answer.por_el_horizonte");
  const height = altitudeDeg < 15 ? tr("answer.sol_bajo") : altitudeDeg < 45 ? tr("pointPanel.sol") : tr("answer.sol_alto");
  return `${height} ${where}`;
}
