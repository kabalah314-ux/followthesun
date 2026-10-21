import { describe, expect, it } from "vitest";
import {
  apparentTemperature,
  comfortFrom,
  comfortSentence,
  comfortShort,
  uvAdvice,
  uvLevel,
  vaporPressureHPa,
  windWord,
} from "../comfort";

describe("temperatura aparente (Steadman con radiación)", () => {
  it("presión de vapor de saturación a 20 °C ≈ 23,4 hPa", () => {
    expect(vaporPressureHPa(20, 100)).toBeCloseTo(23.4, 0);
  });

  it("a la sombra no suma radiación y el viento enfría", () => {
    const calm = apparentTemperature(22, 60, 0);
    const windy = apparentTemperature(22, 60, 8);
    expect(windy).toBeLessThan(calm);
  });

  it("el sol pleno (DNI 800 W/m², 2 m/s) añade unos 8 °C", () => {
    const c = comfortFrom({ tempC: 25, humidity: 50, windKmh: 7.2, gustKmh: null, uv: 6, dni: 800 })!;
    expect(c.alSolC! - c.aLaSombraC!).toBeGreaterThan(7);
    expect(c.alSolC! - c.aLaSombraC!).toBeLessThan(9.5);
  });

  it("sin DNI no hay valor «al sol», y sin temperatura no hay nada", () => {
    expect(comfortFrom({ tempC: 18, humidity: 60, windKmh: 10, gustKmh: null, uv: null, dni: null })!.alSolC).toBeNull();
    expect(comfortFrom({ tempC: null, humidity: 60, windKmh: 10, gustKmh: null, uv: 3, dni: 500 })).toBeNull();
  });
});

describe("UV y viento en palabras", () => {
  it("niveles de la OMS", () => {
    expect(uvLevel(2)).toBe("bajo");
    expect(uvLevel(4)).toBe("moderado");
    expect(uvLevel(8.4)).toBe("muy alto");
    expect(uvLevel(7)).toBe("alto");
    expect(uvLevel(11)).toBe("extremo");
    expect(uvAdvice(1)).toBe("no hace falta protección");
  });

  it("viento", () => {
    expect(windWord(3)).toBe("sin viento");
    expect(windWord(12)).toBe("brisa suave");
    expect(windWord(45)).toBe("viento fuerte");
  });
});

describe("frases de confort", () => {
  const c = comfortFrom({ tempC: 20, humidity: 55, windKmh: 12, gustKmh: 40, uv: 6, dni: 750 })!;

  it("frase completa para la ficha", () => {
    const s = comfortSentence(c);
    expect(s).toMatch(/^\d+ °C al sol · \d+ °C a la sombra · brisa suave de 12 km\/h \(rachas de 40\) · UV 6: protección alta/);
  });

  it("línea corta según el modo", () => {
    expect(comfortShort(c, "sun")).toMatch(/al sol$/);
    expect(comfortShort(c, "shade")).toMatch(/a la sombra$/);
  });

  it("de noche (UV 0, sin DNI) solo da la sensación", () => {
    const night = comfortFrom({ tempC: 14, humidity: 70, windKmh: 4, gustKmh: null, uv: 0, dni: 0 })!;
    expect(comfortSentence(night)).toMatch(/^Sensación de \d+ °C · sin viento$/);
  });
});
