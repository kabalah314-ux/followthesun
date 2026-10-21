import { describe, expect, it } from "vitest";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

/**
 * Un estilo con una sola propiedad inválida hace que MapLibre lo rechace entero y el mapa se quede
 * en blanco (pasó con la vista satélite en producción). Todos los estilos generados deben validar.
 */

// `styles.ts` arrastra módulos que leen `window`/`localStorage` al importarse.
const g = globalThis as Record<string, unknown>;
g.window ??= globalThis;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const load = () => import("../styles");
const errorsOf = (style: unknown) => validateStyleMin(style as never).map((e) => e.message);

describe("estilos del mapa abierto (MapLibre + OpenFreeMap)", () => {
  for (const theme of ["day", "night"] as const) {
    it(`el estilo base valida (${theme})`, async () => {
      const { createOpenMapTilesStyle } = await load();
      expect(errorsOf(createOpenMapTilesStyle(theme))).toEqual([]);
    });

    it(`el estilo satélite valida (${theme})`, async () => {
      const { createOpenMapTilesStyle, createSatelliteStyle } = await load();
      const sat = createSatelliteStyle(createOpenMapTilesStyle(theme), theme, "esri");
      expect(errorsOf(sat)).toEqual([]);
    });
  }
});
