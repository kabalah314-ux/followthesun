/**
 * ETL de datos precalculados de I Follow the Sun.
 *
 * Genera en `public/data/` el inventario que la app pide primero (desde la CDN, en milisegundos) en
 * lugar de depender en cada visita de los servidores públicos de Overpass y del portal de Open Data
 * BCN, que a veces tardan minutos o devuelven 503:
 *
 *   places.json    lugares de OpenStreetMap (parques, plazas, playas, miradores, espacios abiertos…)
 *   venues.json    cafés, bares y restaurantes de OSM (para nombrar las terrazas con licencia)
 *   opendata.json  Open Data BCN: terrazas con licencia, fuentes, refugios, lavabos, miradores y
 *                  áreas de juego
 *
 * Reutiliza las consultas, los parsers y la normalización de la app (src/services), así que la app y
 * el ETL producen exactamente los mismos lugares. Aquí no hay prisa: timeouts largos, reintentos con
 * espera y todos los servidores de Overpass. Si una fuente falla, se conserva su parte del fichero
 * anterior en lugar de vaciarla.
 *
 * Uso:  npx vite-node scripts/etl/build-inventory.ts
 * (en GitHub Actions lo lanza .github/workflows/datos.yml cada lunes)
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES_CONFIG } from "../../src/config";
import { isRetryable, withRetry } from "../../src/lib/net";
import { configureCkan } from "../../src/services/openData/ckan";
import { OPEN_DATA_CONFIG } from "../../src/services/openData/config";
import { packPlaces, packTerraces } from "../../src/services/openData/datasets";
import { OPEN_DATA_PLACE_SETS, openDataLive } from "../../src/services/openData/openDataService";
import { overpass } from "../../src/services/overpass";
import { buildOverpassQuery, normalizeOverpass, type OvElement } from "../../src/services/placeService";
import {
  STATIC_DATA_VERSION,
  acceptStatic,
  type OpenDataSectionKey,
  type StaticOpenDataFile,
  type StaticPlacesFile,
  type StaticSource,
  type StaticVenuesFile,
} from "../../src/services/staticData";
import { buildVenueQuery, packVenueElement, type OvNode } from "../../src/services/venueService";

const OUT_DIR = resolve(process.cwd(), "public/data");
const UA = "IFollowTheSun-ETL/1.0 (+https://github.com/kabalah314-ux/followthesun)";
const NOW = new Date().toISOString();

const OSM_SOURCE: StaticSource = {
  name: "OpenStreetMap",
  license: "ODbL 1.0 · © OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
};
const BCN_SOURCE: StaticSource = {
  name: "Ajuntament de Barcelona · Open Data BCN",
  license: "CC BY 4.0",
  url: "https://opendata-ajuntament.barcelona.cat/",
};

/** Mínimos razonables: por debajo, la respuesta está incompleta y no debe sustituir a la anterior. */
const MIN_PLACES = 300;
const MIN_VENUES = 1500;

configureCkan({
  headers: { "User-Agent": UA },
  timeoutMs: 120_000,
  retries: 4,
  delaysMs: [3000, 8000, 20_000, 45_000],
  retryOn: isRetryable,
});

const summary: Array<{ fuente: string; estado: string; elementos: number | string; ms: number }> = [];
let warnings = 0;

function warn(msg: string) {
  warnings++;
  // Anotación visible en GitHub Actions.
  console.log(`::warning::${msg}`);
}

async function step<T>(name: string, fn: () => Promise<T>, count: (v: T) => number): Promise<T | null> {
  const t0 = Date.now();
  try {
    const v = await fn();
    const n = count(v);
    summary.push({ fuente: name, estado: "ok", elementos: n, ms: Date.now() - t0 });
    console.log(`✓ ${name}: ${n} elementos en ${Math.round((Date.now() - t0) / 1000)} s`);
    return v;
  } catch (e) {
    summary.push({ fuente: name, estado: "falló", elementos: "—", ms: Date.now() - t0 });
    warn(`${name}: ${e instanceof Error ? e.message : String(e)} · se conserva el dato anterior si existe`);
    return null;
  }
}

function readPrevious<T>(file: string, kind: "places" | "venues" | "opendata"): T | null {
  const path = resolve(OUT_DIR, file);
  if (!existsSync(path)) return null;
  try {
    return acceptStatic(JSON.parse(readFileSync(path, "utf8")), kind) as T | null;
  } catch {
    return null;
  }
}

function write(file: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, file);
  writeFileSync(path, JSON.stringify(data) + "\n", "utf8");
  console.log(`  → ${file}: ${(statSync(path).size / 1024).toFixed(0)} KB`);
}

const overpassEtl = <T>(query: string, timeoutMs: number) =>
  withRetry(() => overpass<T>(query, { timeoutMs, headers: { "User-Agent": UA }, includeCooling: true }), {
    retries: 2,
    delaysMs: [20_000, 60_000],
    retryOn: () => true,
  });

async function main() {
  const bbox = PLACES_CONFIG.bbox;

  /* 1 · Lugares de OpenStreetMap */
  const places = await step(
    "OSM · lugares",
    async () => {
      const query = buildOverpassQuery().replace("[timeout:60]", "[timeout:240]");
      const list = normalizeOverpass(await overpassEtl<OvElement>(query, 300_000));
      if (list.length < MIN_PLACES) throw new Error(`solo ${list.length} lugares (mínimo ${MIN_PLACES})`);
      return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    (v) => v.length
  );
  const prevPlaces = readPrevious<StaticPlacesFile>("places.json", "places");
  if (places) {
    const file: StaticPlacesFile = { v: STATIC_DATA_VERSION, kind: "places", generatedAt: NOW, sources: [OSM_SOURCE], bbox, places };
    write("places.json", file);
  } else if (!prevPlaces) warn("places.json no existe todavía y no se ha podido generar");

  /* 2 · Negocios de OpenStreetMap (todos, sin tope: aquí no hay prisa) */
  const venues = await step(
    "OSM · cafés, bares y restaurantes",
    async () => {
      const elements = await overpassEtl<OvNode>(buildVenueQuery(bbox, null, 240), 300_000);
      const list = elements.map(packVenueElement).filter((v): v is NonNullable<typeof v> => v !== null);
      if (list.length < MIN_VENUES) throw new Error(`solo ${list.length} negocios (mínimo ${MIN_VENUES})`);
      return list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    },
    (v) => v.length
  );
  const prevVenues = readPrevious<StaticVenuesFile>("venues.json", "venues");
  if (venues) {
    const file: StaticVenuesFile = { v: STATIC_DATA_VERSION, kind: "venues", generatedAt: NOW, sources: [OSM_SOURCE], bbox, venues };
    write("venues.json", file);
  } else if (!prevVenues) warn("venues.json no existe todavía y no se ha podido generar");

  /* 3 · Open Data BCN: cada conjunto por separado; el que falle conserva su sección anterior */
  const prevOpen = readPrevious<StaticOpenDataFile>("opendata.json", "opendata");
  const sections: StaticOpenDataFile["sections"] = { ...(prevOpen?.sections ?? {}) };
  let changedOpen = false;

  const terraces = await step("Open Data BCN · terrazas con licencia", () => openDataLive.terraces(), (v) => v.length);
  if (terraces && terraces.length > 0) {
    const items = packTerraces(terraces).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    sections.terraces = { fetchedAt: NOW, items };
    changedOpen = true;
  }
  for (const set of OPEN_DATA_PLACE_SETS) {
    const list = await step(`Open Data BCN · ${set}`, () => openDataLive.places[set](), (v) => v.length);
    if (list && list.length > 0) {
      const items = packPlaces(list).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      sections[set as Exclude<OpenDataSectionKey, "terraces">] = { fetchedAt: NOW, items };
      changedOpen = true;
    }
  }
  if (changedOpen || prevOpen) {
    const file: StaticOpenDataFile = {
      v: STATIC_DATA_VERSION,
      kind: "opendata",
      generatedAt: changedOpen ? NOW : prevOpen!.generatedAt,
      sources: [BCN_SOURCE],
      sections,
    };
    if (changedOpen) write("opendata.json", file);
  } else warn("opendata.json no existe todavía y no se ha podido generar");

  /* Resumen */
  const table = [
    "| Fuente | Estado | Elementos | Tiempo |",
    "| --- | --- | --- | --- |",
    ...summary.map((s) => `| ${s.fuente} | ${s.estado} | ${s.elementos} | ${Math.round(s.ms / 1000)} s |`),
  ].join("\n");
  console.log(`\n${table}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Datos precalculados (${NOW})\n\n${table}\n\nAtribución: ${OSM_SOURCE.license} · ${OPEN_DATA_CONFIG.attribution}\n`);
  }

  const anyFile = ["places.json", "venues.json", "opendata.json"].some((f) => existsSync(resolve(OUT_DIR, f)));
  if (!anyFile) {
    console.error("Ninguna fuente respondió y no hay ficheros anteriores.");
    process.exit(1);
  }
  if (warnings > 0) console.log(`${warnings} aviso(s): revisa el resumen.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
