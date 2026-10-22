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
import { fetchWithTimeout, isRetryable, withRetry } from "../../src/lib/net";
import { configureCkan, datastoreSearch, packageResources } from "../../src/services/openData/ckan";
import { OPEN_DATA_CONFIG } from "../../src/services/openData/config";
import { packPlaces, packTerraces } from "../../src/services/openData/datasets";
import {
  NEIGHBORHOOD_FIELDS,
  createNeighborhoodIndex,
  splitBounds,
  toNeighborhoods,
  type NeighborhoodRecord,
} from "../../src/services/openData/neighborhoods";
import { OPEN_DATA_PLACE_SETS, openDataLive } from "../../src/services/openData/openDataService";
import { overpass } from "../../src/services/overpass";
import { buildOverpassQuery, normalizeOverpass, type OvElement } from "../../src/services/placeService";
import {
  STATIC_DATA_VERSION,
  acceptStatic,
  type OpenDataSectionKey,
  type PackedVenue,
  type StaticOpenDataFile,
  type StaticPlacesFile,
  type StaticSource,
  type StaticVenuesFile,
} from "../../src/services/staticData";
import { buildVenueQuery, packVenueElement, type OvNode } from "../../src/services/venueService";
import { venuesFromGeojsonSeq } from "./osmiumVenues";

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
/** Negocios con nombre (cafés, bares, restaurantes…). Además, nunca menos del 70 % del fichero anterior. */
const MIN_VENUES = 600;
/** Conjunto «Unitats administratives de la ciutat» de Open Data BCN (barrios y distritos, CC BY 4.0). */
const NEIGHBORHOODS_DATASET = "20170706-districtes-barris";
/** Tope para las consultas de negocios por teselas: si se pasa, se conserva el fichero anterior. */
const VENUES_DEADLINE_MS = 25 * 60_000;

configureCkan({
  headers: { "User-Agent": UA },
  timeoutMs: 90_000,
  retries: 2,
  delaysMs: [3000, 10_000],
  retryOn: isRetryable,
});

/**
 * ¿Responde el portal de Open Data BCN? Una sola consulta corta: si está caído, se saltan todos
 * sus pasos (cada uno, con sus reintentos, tardaría minutos) y se conservan los datos anteriores.
 */
async function openDataUp(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${OPEN_DATA_CONFIG.apiBase}package_show?id=${NEIGHBORHOODS_DATASET}`,
      { headers: { "User-Agent": UA } },
      60_000
    );
    const json = (await res.json()) as { success?: boolean };
    return json?.success === true;
  } catch {
    return false;
  }
}

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

const overpassEtl = <T>(query: string, timeoutMs: number, retries = 2) =>
  withRetry(() => overpass<T>(query, { timeoutMs, headers: { "User-Agent": UA }, includeCooling: true }), {
    retries,
    delaysMs: [20_000, 60_000],
    retryOn: () => true,
  });

type Places = StaticPlacesFile["places"];
type NeighborhoodIndex = ReturnType<typeof createNeighborhoodIndex>;

/** Añade `metadata.neighborhood` y `metadata.district` a cada lugar que cae dentro de un barrio. */
function withNeighborhoods(list: Places, index: NeighborhoodIndex): { places: Places; located: number } {
  let located = 0;
  const places = list.map((p) => {
    const hit = index.locate(p.latitude, p.longitude);
    if (!hit) return p;
    located++;
    return { ...p, metadata: { ...(p.metadata ?? {}), neighborhood: hit.name, district: hit.district } };
  });
  return { places, located };
}

/** Sin barrios nuevos (portal caído): cada lugar conserva el barrio que tenía en el fichero anterior. */
function withPreviousNeighborhoods(list: Places, prev: Places): { places: Places; located: number } {
  const byId = new Map(prev.map((p) => [p.id, p.metadata]));
  let located = 0;
  const places = list.map((p) => {
    const m = byId.get(p.id);
    if (!m || typeof m.neighborhood !== "string") return p;
    located++;
    return { ...p, metadata: { ...(p.metadata ?? {}), neighborhood: m.neighborhood, district: m.district } };
  });
  return { places, located };
}

async function main() {
  const bbox = PLACES_CONFIG.bbox;

  /* 1 · Lugares de OpenStreetMap */
  const places = await step(
    "OSM · lugares",
    async () => {
      const query = buildOverpassQuery().replace("[timeout:60]", "[timeout:180]");
      // Un reintento como mucho: si Overpass va lento, se conserva places.json y el resto sigue.
      const list = normalizeOverpass(await overpassEtl<OvElement>(query, 200_000, 1));
      if (list.length < MIN_PLACES) throw new Error(`solo ${list.length} lugares (mínimo ${MIN_PLACES})`);
      return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    (v) => v.length
  );
  const prevPlaces = readPrevious<StaticPlacesFile>("places.json", "places");

  const portal = await openDataUp();
  if (!portal) warn("Open Data BCN no responde: se conservan los barrios, las terrazas y los servicios anteriores");

  /* 1b · Barrio de cada lugar, para las páginas /barrio/<slug> del prerender */
  const neighborhoods = !portal ? null : await step(
    "Open Data BCN · barrios",
    async () => {
      const resources = await packageResources(NEIGHBORHOODS_DATASET);
      const res = resources.find((r) => r.datastore_active && /barris/i.test(r.name ?? "") && /csv/i.test(r.format ?? ""));
      if (!res) throw new Error("no se encuentra el recurso de barrios en el conjunto");
      const records = await datastoreSearch<NeighborhoodRecord>(res.id, NEIGHBORHOOD_FIELDS, { pageSize: 100, maxRows: 300 });
      const list = toNeighborhoods(records);
      if (list.length < 60) throw new Error(`solo ${list.length} barrios con geometría`);
      return list;
    },
    (v) => v.length
  );
  const index = neighborhoods ? createNeighborhoodIndex(neighborhoods) : null;

  const basePlaces = places ?? prevPlaces?.places ?? null;
  if (basePlaces) {
    let list = basePlaces;
    if (index) {
      const r = withNeighborhoods(basePlaces, index);
      list = r.places;
      console.log(`  barrio asignado a ${r.located} de ${list.length} lugares`);
    } else if (places && prevPlaces) {
      // Lugares nuevos pero sin barrios: no se pierden los de antes (las páginas /barrio/ dependen de ellos).
      const r = withPreviousNeighborhoods(places, prevPlaces.places);
      list = r.places;
      console.log(`  barrio del fichero anterior en ${r.located} de ${list.length} lugares`);
    }
    // Se escribe si hay lugares nuevos o si los anteriores ganan el barrio (conservando su fecha).
    if (places || index) {
      const generatedAt = places ? NOW : prevPlaces!.generatedAt;
      const file: StaticPlacesFile = { v: STATIC_DATA_VERSION, kind: "places", generatedAt, sources: [OSM_SOURCE], bbox, places: list };
      write("places.json", file);
    }
  } else warn("places.json no existe todavía y no se ha podido generar");

  /* 2 · Negocios de OpenStreetMap, en 3 × 3 teselas: consultas más ligeras que una sola de toda la
   *     ciudad (algunos servidores la cortan) y un recuento por tesela para el resumen. */
  const prevVenues = readPrevious<StaticVenuesFile>("venues.json", "venues");
  const minVenues = Math.max(MIN_VENUES, Math.round((prevVenues?.venues.length ?? 0) * 0.7));
  const venues = await step(
    "OSM · cafés, bares y restaurantes",
    async () => {
      // 2a · Extracto de Geofabrik filtrado con osmium (lo prepara el flujo de GitHub Actions).
      const seq = process.env.VENUES_GEOJSONSEQ?.trim();
      if (seq && existsSync(seq)) {
        const byRef = new Map<string, PackedVenue>();
        for (const el of await venuesFromGeojsonSeq(seq, bbox)) {
          const v = packVenueElement(el);
          if (v && !byRef.has(v[0])) byRef.set(v[0], v);
        }
        const list = [...byRef.values()];
        console.log(`  extracto de Geofabrik: ${list.length} negocios con nombre en la caja`);
        if (list.length >= minVenues) return list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        warn(`el extracto solo trae ${list.length} negocios (mínimo ${minVenues}); se prueba con Overpass`);
      }
      // 2b · Overpass por teselas (respaldo).
      const t0 = Date.now();
      const byRef = new Map<string, PackedVenue>();
      const perTile: number[] = [];
      for (const tile of splitBounds(bbox, 3, 3)) {
        if (Date.now() - t0 > VENUES_DEADLINE_MS) throw new Error(`tiempo agotado tras ${perTile.length} de 9 teselas`);
        const elements = await overpassEtl<OvNode>(buildVenueQuery(tile, null, 180), 200_000, 1);
        let added = 0;
        for (const el of elements) {
          const v = packVenueElement(el);
          if (v && !byRef.has(v[0])) {
            byRef.set(v[0], v);
            added++;
          }
        }
        perTile.push(added);
      }
      console.log(`  negocios por tesela: ${perTile.join(" · ")}`);
      const list = [...byRef.values()];
      if (list.length < minVenues) throw new Error(`solo ${list.length} negocios (mínimo ${minVenues}; por tesela ${perTile.join("/")})`);
      return list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    },
    (v) => v.length
  );
  if (venues) {
    const file: StaticVenuesFile = { v: STATIC_DATA_VERSION, kind: "venues", generatedAt: NOW, sources: [OSM_SOURCE], bbox, venues };
    write("venues.json", file);
  } else if (!prevVenues) warn("venues.json no existe todavía y no se ha podido generar");

  /* 3 · Open Data BCN: cada conjunto por separado; el que falle conserva su sección anterior */
  const prevOpen = readPrevious<StaticOpenDataFile>("opendata.json", "opendata");
  const sections: StaticOpenDataFile["sections"] = { ...(prevOpen?.sections ?? {}) };
  let changedOpen = false;

  const terraces = !portal ? null : await step("Open Data BCN · terrazas con licencia", () => openDataLive.terraces(), (v) => v.length);
  if (terraces && terraces.length > 0) {
    const items = packTerraces(terraces).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    sections.terraces = { fetchedAt: NOW, items };
    changedOpen = true;
  }
  for (const set of portal ? OPEN_DATA_PLACE_SETS : []) {
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
