import { describe, expect, it } from "vitest";
import { describeCity, describePoint, sunPositionPhrase } from "../answer";
import type { SunState, TimelineInterval } from "../../types";

// 21 de octubre de 2026 en Barcelona (UTC+2).
const at = (h: number, m: number, day = 21) => Date.UTC(2026, 9, day, h - 2, m);
const clock = (ms: number) =>
  new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Madrid" }).format(new Date(ms));

const iv = (state: SunState, h0: number, m0: number, h1: number, m1: number): TimelineInterval => ({
  state,
  start: at(h0, m0),
  end: at(h1, m1),
});

const DAY: TimelineInterval[] = [
  iv("partial", 8, 11, 9, 11),
  iv("sun", 9, 11, 15, 0),
  iv("shade", 15, 0, 16, 30),
  iv("sun", 16, 30, 17, 5),
  iv("cloud", 17, 5, 18, 0),
  iv("partial", 18, 0, 19, 0),
];
const base = { intervals: DAY, sunrise: at(8, 11), sunset: at(19, 3), nextSunrise: at(8, 12, 22), clock };

describe("describePoint", () => {
  it("sol directo: hasta cuándo y qué viene después", () => {
    const a = describePoint({ ...base, time: at(10, 0) });
    expect(a.state).toBe("sun");
    expect(a.headline).toBe("Sol directo aquí hasta las 15:00");
    expect(a.detail).toBe("Quedan 5 h · después, sombra");
  });

  it("sombra: cuándo vuelve el sol", () => {
    const a = describePoint({ ...base, time: at(15, 30) });
    expect(a.headline).toBe("Sombra ahora · vuelve el sol a las 16:30");
    expect(a.detail).toBe("En 1 h");
  });

  it("nubes: hasta cuándo y qué viene después", () => {
    const a = describePoint({ ...base, time: at(17, 30) });
    expect(a.headline).toBe("Nubes hasta las 18:00");
    expect(a.detail).toBe("Después, sol probable");
  });

  it("sol suave hasta la puesta", () => {
    const a = describePoint({ ...base, time: at(18, 30) });
    expect(a.headline).toBe("Sol suave (nubes finas) hasta la puesta (19:03)");
  });

  it("de noche: cuándo sale mañana", () => {
    const a = describePoint({ ...base, time: at(20, 0) });
    expect(a.state).toBe("night");
    expect(a.headline).toBe("Ya no hay sol");
    expect(a.detail).toBe("Mañana sale a las 08:12");
  });

  it("antes del amanecer: cuándo sale y cuándo llega al punto", () => {
    expect(describePoint({ ...base, time: at(7, 30) }).detail).toBe("Sale a las 08:11");
    const shadedMorning = [iv("shade", 8, 11, 9, 40), iv("sun", 9, 40, 15, 0), ...DAY.slice(2)];
    expect(describePoint({ ...base, intervals: shadedMorning, time: at(7, 30) }).detail).toBe(
      "Sale a las 08:11 y llega aquí a las 09:40"
    );
  });

  it("sin datos de nubes el sol es «posible»", () => {
    expect(describePoint({ ...base, time: at(10, 0), weatherAvailable: false }).headline).toBe(
      "Sol posible aquí hasta las 15:00"
    );
  });

  it("modo sombra con calor", () => {
    const sun = describePoint({ ...base, time: at(10, 0), mode: "shade", apparentC: 31.4 });
    expect(sun.headline).toBe("Sol aquí ahora: 31 °C de sensación");
    expect(sun.detail).toBe("Sombra a partir de las 15:00");
    const shade = describePoint({ ...base, time: at(15, 30), mode: "shade" });
    expect(shade.headline).toBe("Sombra aquí hasta las 16:30");
    expect(shade.detail).toBe("Quedan 1 h de sombra");
  });
});

describe("describeCity", () => {
  it("de día: porcentaje de sol, puesta y temperatura", () => {
    const a = describeCity({ time: at(12, 0), sunrise: at(8, 11), sunset: at(19, 3), sunPercent: 62, temperatureC: 21.2, clock });
    expect(a.headline).toBe("Sol directo en el 62 % de las calles que ves");
    expect(a.detail).toBe("Se pone a las 19:03 · 21 °C");
  });

  it("modo sombra y nubes", () => {
    const shade = describeCity({ time: at(12, 0), sunrise: at(8, 11), sunset: at(19, 3), sunPercent: 62, shadePercent: 38, mode: "shade", clock });
    expect(shade.headline).toBe("Sombra en el 38 % de las calles que ves");
    const cloudy = describeCity({ time: at(12, 0), sunrise: at(8, 11), sunset: at(19, 3), cloudPercent: 80, clock });
    expect(cloudy.headline).toBe("Las nubes tapan casi todo el sol");
  });

  it("de noche", () => {
    const a = describeCity({ time: at(22, 0), sunrise: at(8, 11), sunset: at(19, 3), nextSunrise: at(8, 12, 22), clock });
    expect(a.headline).toBe("Ya no hay sol");
    expect(a.detail).toBe("Mañana sale a las 08:12");
  });
});

describe("sunPositionPhrase", () => {
  it("altura y dirección en palabras", () => {
    expect(sunPositionPhrase(10, 240)).toBe("Sol bajo por el suroeste");
    expect(sunPositionPhrase(30, 180)).toBe("Sol por el sur");
    expect(sunPositionPhrase(60, 175)).toBe("Sol alto por el sur");
  });
});
