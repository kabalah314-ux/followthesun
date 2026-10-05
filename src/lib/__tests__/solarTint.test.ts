import { describe, expect, it } from "vitest";
import { sunlightTint } from "../solarTint";

describe("solarTint — diferencia continua entre sol débil y fuerte", () => {
  it("más luz directa produce un tono más intenso y más visible", () => {
    const low = sunlightTint(0.22, 1, true);
    const middle = sunlightTint(0.52, 1, true);
    const strong = sunlightTint(0.95, 1, true);
    expect(low.opacity).toBeLessThan(middle.opacity);
    expect(middle.opacity).toBeLessThan(strong.opacity);
    expect(low.strength).toBeLessThan(middle.strength);
    expect(middle.strength).toBeLessThan(strong.strength);
    // El tono profundo tiene menos azul: no se convierte en un mapa meteorológico saturado.
    expect(strong.rgb[2]).toBeLessThan(low.rgb[2]);
  });

  it("sin datos meteorológicos atenúa el tono: sol posible, no confirmado", () => {
    const measured = sunlightTint(0.8, 1, true);
    const possible = sunlightTint(0.8, 1, false);
    expect(possible.opacity).toBeLessThan(measured.opacity);
    expect(sunlightTint(0, 1, true).opacity).toBe(0);
    expect(sunlightTint(0.8, 0, true).opacity).toBe(0);
  });

  it("la fuerza sigue siendo gradual; no hay saltos de clase", () => {
    const scores = [0.2, 0.3, 0.45, 0.65, 0.85].map((v) => sunlightTint(v, 1, true));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].opacity).toBeGreaterThanOrEqual(scores[i - 1].opacity);
      expect(scores[i].strength).toBeGreaterThanOrEqual(scores[i - 1].strength);
    }
  });
});