import { describe, expect, it } from "vitest";

/**
 * Validación de la semántica de `sunshine_duration` con datos REALES de Open-Meteo / AROME France
 * para Barcelona (3-oct-2026, celda 41,375 N · 2,175 E), descargados con
 *   hourly=sunshine_duration            (serie horaria, marcas en GMT+0 con timeformat=unixtime)
 *   minutely_15=sunshine_duration       (serie de 15 min del mismo modelo)
 *
 * Pregunta: el valor horario de la marca T, ¿es la suma de la hora ANTERIOR (T−1h, T] o de la
 * SIGUIENTE (T, T+1h]? La documentación dice "preceding hour sum"; aquí se comprueba con datos.
 */

/** Serie de 15 min (segundos de sol por cuarto de hora). El índice i corresponde a las i·15 min UTC. */
const QUARTERS_FROM_45: number[] = [
  784.15, 547.81, 461.75, 510.93, 611.75, 673.76, 614.56, 413.9, 213.52, 127.9, 224.06, 568.1, 900, 900, 900, 900,
  900, 900, 900, 886.82, 507.05, 168.55, 0, 0,
];
const FIRST_INDEX = 45;
const quarter = (i: number) => QUARTERS_FROM_45[i - FIRST_INDEX] ?? NaN;

/** Serie horaria del mismo modelo, por hora UTC. */
const HOURLY: Record<number, number> = {
  12: 1949.21,
  13: 2683.54,
  14: 577.06,
  15: 3600,
  16: 3600,
};

const precedingSum = (hour: number) => {
  let s = 0;
  for (let k = 0; k < 4; k++) s += quarter(hour * 4 - k);
  return s;
};
const followingSum = (hour: number) => {
  let s = 0;
  for (let k = 1; k <= 4; k++) s += quarter(hour * 4 + k);
  return s;
};

describe("sunshine_duration — la marca T cubre la hora ANTERIOR (T−1h, T]", () => {
  const hours = Object.keys(HOURLY).map(Number);

  it("la hipótesis «hora anterior» se ajusta mucho mejor que «hora siguiente»", () => {
    const errPreceding = hours.reduce((a, h) => a + Math.abs(HOURLY[h] - precedingSum(h)), 0);
    const errFollowing = hours.reduce((a, h) => a + Math.abs(HOURLY[h] - followingSum(h)), 0);
    expect(errPreceding).toBeLessThan(errFollowing / 3);
  });

  it("las horas de sol pleno coinciden con la suma de los cuatro cuartos anteriores", () => {
    expect(precedingSum(15)).toBeCloseTo(3600, 0);
    expect(precedingSum(16)).toBeCloseTo(HOURLY[16], -2); // 3586,8 frente a 3600
  });

  it("por tanto el valor i debe centrarse en t_i − 30 min (sunshineOffsetMs)", () => {
    // Es la alineación que aplica `WeatherGridModel.nodeAt`: idx = (t − offset − t0) / paso.
    const offset = -30 * 60_000;
    const hourMs = 3_600_000;
    const t0 = Date.UTC(2026, 9, 3, 0, 0);
    // 11:30 UTC es el centro del intervalo (11:00, 12:00], que describe la marca de las 12:00.
    const targetNoon30 = Date.UTC(2026, 9, 3, 11, 30);
    const idx = (targetNoon30 - offset - t0) / hourMs;
    expect(idx).toBeCloseTo(12, 5);
  });
});
