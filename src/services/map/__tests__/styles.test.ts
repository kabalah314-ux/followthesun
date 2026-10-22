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

    it(`la «Vista real» con la ortofoto del ICGC valida (${theme})`, async () => {
      const { createOpenMapTilesStyle, createSatelliteStyle } = await load();
      const sat = createSatelliteStyle(createOpenMapTilesStyle(theme), theme, "icgc");
      expect(errorsOf(sat)).toEqual([]);
      const src = sat.sources["fts-satellite"];
      expect(src.maxzoom).toBe(20);
      expect(String(src.attribution)).toContain("Institut Cartogràfic i Geològic de Catalunya");
      expect(String(src.tiles[0])).toContain("geoserveis.icgc.cat");
    });
  }

  it("detalle hasta zoom 20: calles con su ancho a z20, contornos y números de portal", async () => {
    const { createOpenMapTilesStyle } = await load();
    const style = createOpenMapTilesStyle("day");
    const byId = (id: string) => style.layers.find((l: { id: string }) => l.id === id);
    const minor = byId("road-minor").paint["line-width"] as unknown[];
    expect(minor.slice(-2)).toEqual([20, 25]);
    expect(byId("buildings-outline").type).toBe("line");
    expect(byId("label-housenumber").minzoom).toBe(17.5);
    // Las etiquetas siguen al final: la capa solar se inserta debajo de los edificios 3D.
    const ids = style.layers.map((l: { id: string }) => l.id);
    expect(ids.indexOf("buildings-3d")).toBeLessThan(ids.indexOf("label-water"));
  });
});
