import { describe, expect, it } from "vitest";
import { commonsPhotos, commonsThumb } from "../commons";
import { getPlaceMedia } from "../mediaService";
import { panoramaxImages } from "../panoramax";
import {
  angleDiffDeg,
  attributionLabel,
  bearingDeg,
  distanceM,
  looksUnwanted,
  nameMatch,
  nameTokens,
  prettyLicense,
  scoreStreet,
  yearOf,
} from "../scoring";
import type { MediaTarget } from "../types";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** fetch falso que responde según la URL y cuenta las llamadas. */
function fakeFetch(routes: Array<[RegExp, unknown]>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response("not found", { status: 404 });
    return json(hit[1]);
  }) as typeof fetch;
  return { impl, calls };
}

const PLAZA: MediaTarget = { id: "osm:way/1", name: "Plaça Reial", type: "square", latitude: 41.38008, longitude: 2.17532 };
const BAR: MediaTarget = { id: "osm:node/2", name: "Bar Pepe", type: "terrace", latitude: 41.39, longitude: 2.16 };

const info = (title: string, extra: Record<string, string> = {}, size = { w: 4000, h: 3000 }) => ({
  title,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/x/${encodeURIComponent(title)}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      thumburl: `https://upload.wikimedia.org/thumb/x/1280px-${encodeURIComponent(title)}`,
      thumbwidth: 1280,
      thumbheight: Math.round((1280 * size.h) / size.w),
      width: size.w,
      height: size.h,
      mime: "image/jpeg",
      extmetadata: {
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Ana">Ana</a>' },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        DateTimeOriginal: { value: "2021-06-12 10:20:00" },
        Categories: { value: extra.categories ?? "" },
        ...(extra.date ? { DateTimeOriginal: { value: extra.date } } : {}),
      },
    },
  ],
});

describe("geometría y textos", () => {
  it("calcula rumbos y diferencias de ángulo", () => {
    expect(bearingDeg(41, 2, 41.001, 2)).toBeCloseTo(0, 0);
    expect(bearingDeg(41, 2, 41, 2.001)).toBeCloseTo(90, 0);
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(90, 270)).toBe(180);
    expect(distanceM(41, 2, 41.001, 2)).toBeCloseTo(111, 0);
  });

  it("saca las palabras con significado del nombre", () => {
    expect(nameTokens("Plaça Reial")).toEqual(["reial"]);
    expect(nameTokens("Bar Pepe de la Barceloneta")).toEqual(["pepe", "barceloneta"]);
    expect(nameMatch("File:Placa Reial, Barcelona.jpg", ["reial"])).toBe(1);
  });

  it("descarta interiores, retratos y archivos históricos", () => {
    expect(looksUnwanted("File:Interior de la Sagrada Família.jpg")).toBe(true);
    expect(looksUnwanted("File:Improvised photo shoot (5023).jpg")).toBe(true);
    expect(looksUnwanted("File:Plaça Reial al vespre.jpg")).toBe(false);
  });

  it("normaliza licencias y compone la atribución", () => {
    expect(prettyLicense("CC-BY-SA-4.0")).toBe("CC BY-SA 4.0");
    expect(prettyLicense("cc by 2.0")).toBe("CC BY 2.0");
    expect(prettyLicense("CC0")).toBe("CC0");
    expect(prettyLicense("Public domain")).toBe("Public domain");
    expect(attributionLabel({ author: "Ana", license: "CC BY-SA 4.0", provider: "commons" })).toBe(
      "© Ana · CC BY-SA 4.0 · Wikimedia Commons"
    );
  });

  it("una foto de calle tiene que mirar al sitio", () => {
    expect(scoreStreet({ distanceM: 20, heading: 0, bearingToPlace: 10, is360: false }, BAR)).not.toBeNull();
    expect(scoreStreet({ distanceM: 20, heading: 180, bearingToPlace: 10, is360: false }, BAR)).toBeNull();
    expect(scoreStreet({ distanceM: 30, bearingToPlace: 10, is360: true }, BAR)).not.toBeNull();
    expect(scoreStreet({ distanceM: 80, heading: 10, bearingToPlace: 10, is360: false }, BAR)).toBeNull();
  });

  it("lee años sueltos y no dentro de otros números", () => {
    expect(yearOf("2021-06-12 10:20:00")).toBe(2021);
    expect(yearOf("File:Plaça Reial 1910.jpg")).toBe(1910);
    expect(yearOf("File:Improvised photo shoot (50235319338).jpg")).toBeUndefined();
  });

  it("cambia el ancho de una miniatura de Commons", () => {
    expect(commonsThumb("https://u.org/thumb/a/b/1280px-Foo.jpg", 400)).toBe("https://u.org/thumb/a/b/400px-Foo.jpg");
  });
});

describe("commonsPhotos", () => {
  const geo = {
    query: {
      geosearch: [
        { title: "File:Plaça Reial, Barcelona.jpg", dist: 20 },
        { title: "File:Improvised photo shoot (50235319338).jpg", dist: 3 },
        { title: "File:Carrer qualsevol.jpg", dist: 180 },
        { title: "File:Font de les Tres Gràcies.jpg", dist: 40 },
        { title: "File:Plaça Reial 1910.jpg", dist: 15 },
      ],
    },
  };
  const pages = {
    query: {
      pages: {
        "1": info("File:Plaça Reial, Barcelona.jpg"),
        "2": info("File:Improvised photo shoot (50235319338).jpg"),
        "3": info("File:Carrer qualsevol.jpg"),
        "4": info("File:Font de les Tres Gràcies.jpg", { categories: "Plaça Reial|Fountains in Barcelona" }),
        "5": info("File:Plaça Reial 1910.jpg", { date: "1910" }),
      },
    },
  };

  it("se queda con fotos del sitio, recientes y sin gente en primer plano", async () => {
    const { impl, calls } = fakeFetch([
      [/list=geosearch/, geo],
      [/prop=imageinfo/, pages],
    ]);
    const list = await commonsPhotos(PLAZA, { fetchImpl: impl });
    expect(calls).toHaveLength(2);
    expect(list.map((m) => m.title)).toEqual(["Plaça Reial, Barcelona", "Font de les Tres Gràcies"]);
    const first = list[0];
    expect(first.author).toBe("Ana");
    expect(first.license).toBe("CC BY-SA 4.0");
    expect(first.sourceUrl).toContain("commons.wikimedia.org/wiki/");
    expect(first.thumbUrl).toContain("/400px-");
    expect(first.capturedAt).toBe("2021-06-12");
  });

  it("para un local exige que la foto lo nombre", async () => {
    const { impl } = fakeFetch([
      [/list=geosearch/, { query: { geosearch: [{ title: "File:Carrer amb bars.jpg", dist: 10 }, { title: "File:Bar Pepe terrassa.jpg", dist: 12 }] } }],
      [/prop=imageinfo/, { query: { pages: { a: info("File:Carrer amb bars.jpg"), b: info("File:Bar Pepe terrassa.jpg") } } }],
    ]);
    const list = await commonsPhotos(BAR, { fetchImpl: impl });
    expect(list.map((m) => m.title)).toEqual(["Bar Pepe terrassa"]);
  });

  it("sin resultados no hace la segunda petición", async () => {
    const { impl, calls } = fakeFetch([[/list=geosearch/, { query: { geosearch: [] } }]]);
    expect(await commonsPhotos(PLAZA, { fetchImpl: impl })).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe("panoramaxImages", () => {
  // Cámara 20 m al sur del bar: mirando al norte ve el sitio; mirando al sur, no.
  const south = [BAR.longitude, BAR.latitude - 20 / 111_194];
  const feature = (id: string, azimuth: number, extra: Record<string, unknown> = {}) => ({
    id,
    geometry: { coordinates: south },
    properties: { datetime: "2025-05-01T10:00:00+00:00", "view:azimuth": azimuth, license: "CC-BY-SA-4.0", ...extra },
    assets: {
      sd: { href: `https://px.example/${id}/sd.jpg` },
      hd: { href: `https://px.example/${id}/hd.jpg` },
      thumb: { href: `https://px.example/${id}/thumb.jpg` },
    },
    providers: [{ name: "mapcomplete", roles: ["producer"] }, { name: "Toni", roles: ["producer"] }],
    links: [{ rel: "license", href: "https://spdx.org/licenses/CC-BY-SA-4.0.html" }],
  });

  it("elige las fotos que miran al sitio y separa los 360°", async () => {
    const { impl } = fakeFetch([
      [
        /panoramax/,
        {
          features: [
            feature("mira", 2),
            feature("espalda", 182),
            feature("pano", 0, { "pers:interior_orientation": { field_of_view: 360 } }),
          ],
        },
      ],
    ]);
    const list = await panoramaxImages(BAR, { fetchImpl: impl });
    expect(list.map((m) => `${m.kind}:${m.id}`).sort()).toEqual(["pano:panoramax:pano", "photo:panoramax:mira"]);
    const photo = list.find((m) => m.kind === "photo")!;
    expect(photo.author).toBe("Toni");
    expect(photo.license).toBe("CC BY-SA 4.0");
    expect(photo.url).toContain("/sd.jpg");
    expect(list.find((m) => m.kind === "pano")!.url).toContain("/hd.jpg");
  });
});

describe("getPlaceMedia", () => {
  it("combina fuentes, ordena y guarda en caché", async () => {
    const target: MediaTarget = { ...PLAZA, id: "test:cache" };
    const { impl, calls } = fakeFetch([
      [/list=geosearch/, { query: { geosearch: [{ title: "File:Plaça Reial, Barcelona.jpg", dist: 20 }] } }],
      [/prop=imageinfo/, { query: { pages: { "1": info("File:Plaça Reial, Barcelona.jpg") } } }],
      [/panoramax/, { features: [] }],
    ]);
    const first = await getPlaceMedia(target, { fetchImpl: impl, mapillaryToken: "" });
    expect(first.photos).toHaveLength(1);
    expect(first.panos).toHaveLength(0);
    const n = calls.length;
    const again = await getPlaceMedia(target, { fetchImpl: impl, mapillaryToken: "" });
    expect(again.photos[0].id).toBe(first.photos[0].id);
    expect(calls.length).toBe(n);
  });

  it("si una fuente falla, usa las demás", async () => {
    const target: MediaTarget = { ...PLAZA, id: "test:partial" };
    const { impl } = fakeFetch([[/panoramax/, { features: [] }]]);
    const r = await getPlaceMedia(target, { fetchImpl: impl, mapillaryToken: "" });
    expect(r.photos).toEqual([]);
  });
});
