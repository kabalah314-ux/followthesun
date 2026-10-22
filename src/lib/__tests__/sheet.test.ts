import { describe, expect, it } from "vitest";
import { nearestLevel, releaseVelocity, rubberBand, settleDuration, sheetHeights, snapLevel, stepLevel } from "../sheet";

describe("alturas de la hoja", () => {
  it("asomada ~120 px, media ~45 % y completa ~90 % de la pantalla, sobre la barra de navegación", () => {
    const h = sheetHeights(844, 64 + 34, 47);
    expect(h.peek).toBe(120);
    expect(h.half).toBe(380);
    expect(h.full).toBe(662);
  });

  it("en un móvil pequeño (360×740) los tres niveles siguen separados", () => {
    const h = sheetHeights(740, 64, 24);
    expect(h.peek).toBe(120);
    expect(h.half).toBe(333);
    expect(h.full).toBe(602);
    expect(h.half - h.peek).toBeGreaterThan(55);
    expect(h.full - h.half).toBeGreaterThan(55);
  });

  it("en una pantalla muy baja no se solapan", () => {
    const h = sheetHeights(420, 64, 20);
    expect(h.peek).toBeLessThan(h.half);
    expect(h.half).toBeLessThan(h.full);
    expect(h.full).toBeLessThan(420 - 64 - 19);
  });
});

describe("física de la hoja", () => {
  const h = { peek: 120, half: 380, full: 662 };

  it("sin velocidad, se queda en el nivel más cercano", () => {
    expect(nearestLevel(200, h)).toBe("peek");
    expect(nearestLevel(300, h)).toBe("half");
    expect(nearestLevel(600, h)).toBe("full");
    expect(snapLevel(395, 0, "half", h)).toBe("half");
  });

  it("la inercia proyecta el gesto", () => {
    // 300 px subiendo a 0,4 px/ms → proyecta a 380: media.
    expect(snapLevel(300, 0.4, "peek", h)).toBe("half");
    // 420 px bajando despacio → se queda en media.
    expect(snapLevel(420, -0.1, "half", h)).toBe("half");
  });

  it("un gesto rápido avanza al menos un nivel", () => {
    expect(snapLevel(390, 0.9, "half", h)).toBe("full");
    expect(snapLevel(370, -0.9, "half", h)).toBe("peek");
    expect(snapLevel(140, -2, "peek", h)).toBe("peek");
  });

  it("los pasos de teclado no se salen de los límites", () => {
    expect(stepLevel("peek", -1)).toBe("peek");
    expect(stepLevel("peek", 1)).toBe("half");
    expect(stepLevel("half", 1)).toBe("full");
    expect(stepLevel("full", 1)).toBe("full");
  });

  it("mide la velocidad con las últimas muestras", () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 0, y: 500 }, { t: 50, y: 450 }, { t: 100, y: 400 }])).toBe(1);
    // El dedo se paró 200 ms antes de soltar: sin lanzamiento.
    expect(releaseVelocity([{ t: 0, y: 600 }, { t: 50, y: 400 }, { t: 250, y: 400 }])).toBe(0);
    expect(releaseVelocity([{ t: 0, y: 300 }, { t: 40, y: 340 }])).toBe(-1);
  });

  it("resiste al estirarse más allá de los límites", () => {
    expect(rubberBand(500, 120, 662)).toBe(500);
    expect(rubberBand(762, 120, 662)).toBe(702);
    expect(rubberBand(20, 120, 662)).toBe(80);
  });

  it("anima más deprisa un gesto rápido", () => {
    expect(settleDuration(0, 0)).toBe(0);
    expect(settleDuration(300, 0)).toBe(360);
    expect(settleDuration(300, 2)).toBe(160);
  });
});
