import { tr } from "../i18n";
/**
 * Confort al sol y a la sombra (fase 2, F2-05).
 *
 * Temperatura aparente de Steadman (1994, «Norms of apparent temperature in Australia», Aust. Met.
 * Mag. 43, 1-16), en la versión con radiación que publica el Bureau of Meteorology australiano:
 *
 *   AT = Ta + 0,348·e − 0,70·ws + 0,70·Q / (ws + 10) − 4,25
 *
 *   Ta  temperatura del aire (°C)
 *   e   presión de vapor (hPa) = HR/100 · 6,105 · exp(17,27·Ta / (237,7 + Ta))
 *   ws  viento a 10 m (m/s)
 *   Q   radiación neta absorbida por unidad de superficie del cuerpo (W/m²)
 *
 * A la sombra se toma Q = 0. Al sol, Q = α · fp · DNI: absortividad media de piel y ropa α = 0,7 y
 * factor de área proyectada de una persona de pie fp = 0,25 (valores habituales en biometeorología),
 * con DNI la irradiancia normal directa del modelo, que ya descuenta las nubes previstas.
 * Con DNI = 800 W/m² y viento de 2 m/s el sol añade ≈ 8 °C, del orden de los «hasta 15 °F» que el
 * Servicio Meteorológico de EE. UU. atribuye al sol pleno. Orienta; no es un modelo fisiológico.
 *
 * Índice UV con la escala de la OMS: 0-2 bajo, 3-5 moderado, 6-7 alto, 8-10 muy alto, 11+ extremo.
 * Si falta un dato, el valor que depende de él es null: nunca se inventa.
 */

export const COMFORT_CONSTANTS = { absorptivity: 0.7, projectedArea: 0.25 } as const;

/** Una muestra horaria interpolada del modelo (Open-Meteo) en un instante. */
export interface WeatherSample {
  tempC: number | null;
  /** Humedad relativa (%). */
  humidity: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  uv: number | null;
  /** Irradiancia normal directa (W/m²). */
  dni: number | null;
}

export type UvLevel = "bajo" | "moderado" | "alto" | "muy alto" | "extremo";

export interface Comfort {
  tempC: number;
  /** Sensación térmica al sol directo. */
  alSolC: number | null;
  /** Sensación térmica a la sombra. */
  aLaSombraC: number | null;
  vientoKmh: number | null;
  rachasKmh: number | null;
  uv: number | null;
  uvNivel: UvLevel | null;
  /** Consejo de protección solar de la OMS para el nivel de UV. */
  consejo: string | null;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function vaporPressureHPa(tempC: number, humidity: number): number {
  return (humidity / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
}

/** Temperatura aparente de Steadman con radiación absorbida `absorbedWm2` (0 = a la sombra). */
export function apparentTemperature(tempC: number, humidity: number, windMs: number, absorbedWm2 = 0): number {
  const e = vaporPressureHPa(tempC, humidity);
  return tempC + 0.348 * e - 0.7 * windMs + (0.7 * absorbedWm2) / (windMs + 10) - 4.25;
}

export function uvLevel(uv: number): UvLevel {
  const u = Math.round(uv);
  if (u <= 2) return "bajo";
  if (u <= 5) return "moderado";
  if (u <= 7) return "alto";
  if (u <= 10) return "muy alto";
  return "extremo";
}

/** Consejo de la OMS para cada nivel, en pocas palabras. */
export function uvAdvice(uv: number): string {
  switch (uvLevel(uv)) {
    case "bajo":
      return tr("comfort.no_hace_falta_proteccion");
    case "moderado":
      return tr("comfort.proteccion_moderada_si_vas_a");
    case "alto":
      return tr("comfort.proteccion_alta_crema_gorra");
    case "muy alto":
      return tr("comfort.proteccion_muy_alta_evita_el");
    case "extremo":
      return tr("comfort.riesgo_extremo_evita_estar");
  }
}

export function windWord(kmh: number): string {
  if (kmh < 6) return tr("comfort.sin_viento");
  if (kmh < 20) return tr("comfort.brisa_suave");
  if (kmh < 29) return tr("comfort.brisa");
  if (kmh < 39) return tr("comfort.viento_moderado");
  return tr("comfort.viento_fuerte");
}

export function comfortFrom(s: WeatherSample): Comfort | null {
  if (!finite(s.tempC)) return null;
  const windMs = finite(s.windKmh) ? s.windKmh / 3.6 : null;
  const humidity = finite(s.humidity) ? s.humidity : null;
  const shade = humidity !== null && windMs !== null ? apparentTemperature(s.tempC, humidity, windMs, 0) : null;
  const absorbed = finite(s.dni)
    ? COMFORT_CONSTANTS.absorptivity * COMFORT_CONSTANTS.projectedArea * Math.max(0, s.dni)
    : null;
  const sun =
    humidity !== null && windMs !== null && absorbed !== null
      ? apparentTemperature(s.tempC, humidity, windMs, absorbed)
      : null;
  const uv = finite(s.uv) ? Math.max(0, s.uv) : null;
  return {
    tempC: s.tempC,
    alSolC: sun,
    aLaSombraC: shade,
    vientoKmh: finite(s.windKmh) ? s.windKmh : null,
    rachasKmh: finite(s.gustKmh) ? s.gustKmh : null,
    uv,
    uvNivel: uv === null ? null : uvLevel(uv),
    consejo: uv === null ? null : uvAdvice(uv),
  };
}

const deg = (c: number) => `${Math.round(c)} °C`;

/** Sensación en palabras: «19 °C al sol · 15 °C a la sombra» o, sin sol, «sensación de 15 °C». */
export function feelsLine(c: Comfort): string {
  if (c.alSolC !== null && c.aLaSombraC !== null && Math.round(c.alSolC) !== Math.round(c.aLaSombraC)) {
    return tr("comfort.al_sol_a_la_sombra", { p0: deg(c.alSolC), p1: deg(c.aLaSombraC) });
  }
  if (c.aLaSombraC !== null) return tr("comfort.sensacion_de", { p0: deg(c.aLaSombraC) });
  return deg(c.tempC);
}

/** Viento en palabras, con las rachas solo si destacan: «brisa suave de 12 km/h». */
export function windLine(c: Comfort): string | null {
  if (c.vientoKmh === null) return null;
  let w = c.vientoKmh < 6 ? tr("comfort.sin_viento") : tr("comfort.de_km_h", { p0: windWord(c.vientoKmh), p1: Math.round(c.vientoKmh) });
  if (c.rachasKmh !== null && c.rachasKmh >= 30 && c.rachasKmh >= c.vientoKmh + 15) {
    w += tr("comfort.rachas_de", { p0: Math.round(c.rachasKmh) });
  }
  return w;
}

/** UV con su consejo, solo a partir de 3 (por debajo no hace falta decir nada). */
export function uvLine(c: Comfort): string | null {
  return c.uv !== null && c.uv >= 2.5 && c.consejo ? tr("comfort.uv", { p0: Math.round(c.uv), p1: c.consejo }) : null;
}

/**
 * «19 °C al sol · 15 °C a la sombra · brisa suave de 12 km/h · UV 6: protección alta: …».
 * Con `withUv = false` se queda en sensación y viento (para quien pinta el UV en su propia línea).
 */
export function comfortSentence(c: Comfort, withUv = true): string {
  const s = [feelsLine(c), windLine(c), withUv ? uvLine(c) : null].filter(Boolean).join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Línea corta para tarjetas: la sensación que interesa según lo que se busca. */
export function comfortShort(c: Comfort, mode: "sun" | "shade"): string {
  if (mode === "shade" && c.aLaSombraC !== null) return tr("comfort.a_la_sombra", { p0: deg(c.aLaSombraC) });
  if (mode === "sun" && c.alSolC !== null) return tr("comfort.al_sol", { p0: deg(c.alSolC) });
  return c.aLaSombraC !== null ? tr("comfort.sensacion_de_2", { p0: deg(c.aLaSombraC) }) : deg(c.tempC);
}
