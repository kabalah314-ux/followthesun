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

describe("rótulos encima de las sombras", () => {
  it("barrios y calles llevan un halo ancho y difuminado (conservan el contraste)", async () => {
    const { createOpenMapTilesStyle } = await load();
    for (const theme of ["day", "night"] as const) {
      const style = createOpenMapTilesStyle(theme);
      const byId = (id: string) => style.layers.find((l: { id: string }) => l.id === id);
      for (const id of ["label-place", "label-road"]) {
        const paint = byId(id).paint;
        expect(paint["text-halo-width"] >= 2).toBe(true);
        expect(paint["text-halo-blur"] > 0).toBe(true);
        expect(paint["text-opacity"] >= 0.9).toBe(true);
      }
    }
  });
});

describe("relieve sombreado (Alta)", () => {
  const sun = { azimuthDeg: 135, altitudeDeg: 30 };

  it("la fuente y la capa validan y van sobre el suelo, bajo calles, edificios y rótulos", async () => {
    const { createOpenMapTilesStyle } = await load();
    const { demSource, hillshadeLayer, hillshadeBeforeId, DEM_SOURCE_ID, HILLSHADE_LAYER_ID } = await import("../relief");
    for (const theme of ["day", "night"] as const) {
      const style = createOpenMapTilesStyle(theme);
      const layers = [...style.layers];
      const at = layers.findIndex((l: { id: string }) => l.id === hillshadeBeforeId(layers));
      layers.splice(at, 0, hillshadeLayer(sun, theme));
      const withRelief = { ...style, sources: { ...style.sources, [DEM_SOURCE_ID]: demSource() }, layers };
      expect(errorsOf(withRelief)).toEqual([]);
      const ids = layers.map((l: { id: string }) => l.id);
      const i = ids.indexOf(HILLSHADE_LAYER_ID);
      expect(i > ids.indexOf("water") && i > ids.indexOf("park")).toBe(true);
      expect(i < ids.indexOf("buildings-3d") && i < ids.indexOf("label-place")).toBe(true);
      expect(ids.filter((id: string) => id.startsWith("road-")).every((id: string) => ids.indexOf(id) > i)).toBe(true);
    }
  });

  it("la luz viene del sol; con el sol bajo el relieve se marca más; de noche, luz cartográfica", async () => {
    const { hillshadePaint } = await import("../relief");
    const ex = (p: Record<string, unknown>) => (p["hillshade-exaggeration"] as number[])[4];
    expect(hillshadePaint({ azimuthDeg: 200, altitudeDeg: 20 }, "day")["hillshade-illumination-direction"]).toBe(200);
    expect(hillshadePaint({ azimuthDeg: 200, altitudeDeg: 20 }, "day")["hillshade-illumination-anchor"]).toBe("map");
    const low = ex(hillshadePaint({ azimuthDeg: 240, altitudeDeg: 8 }, "day"));
    const high = ex(hillshadePaint({ azimuthDeg: 180, altitudeDeg: 70 }, "day"));
    expect(low > high).toBe(true);
    expect(hillshadePaint({ azimuthDeg: 200, altitudeDeg: -10 }, "day")["hillshade-illumination-direction"]).toBe(335);
  });

  it("modelo del terreno abierto de Mapterhorn (terrarium, 512 px) citado", async () => {
    const { demSource } = await import("../relief");
    const s = demSource() as { encoding: string; tileSize: number; attribution: string; tiles: string[] };
    expect(s.encoding).toBe("terrarium");
    expect(s.tileSize).toBe(512);
    expect(s.attribution).toContain("Mapterhorn");
    expect(s.tiles[0]).toContain("tiles.mapterhorn.com");
  });
});
