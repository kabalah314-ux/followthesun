import { TtlCache } from "../../lib/cache";
import type { SunPlace } from "../../types";
import { isFreshStatic, loadStatic, type OpenDataSectionKey } from "../staticData";
import {
  datastoreSearch,
  datastoreSearchOnce,
  datastoreSql,
  fetchText,
  newestResource,
  packageResources,
  type CkanResource,
} from "./ckan";
import { OPEN_DATA_CONFIG as C } from "./config";
import { csvToObjects, type CsvRow } from "./csv";
import {
  NASIA_FIELDS,
  PLAY_FIELDS,
  packPlaces,
  packTerraces,
  parseFountains,
  parseShelters,
  parseTerraces,
  parseToilets,
  parseViewpoints,
  playGroupsFromRecords,
  playGroupsFromSql,
  playGroupsToPlaces,
  playgroundSql,
  unpackPlaces,
  unpackTerraces,
  type LicensedTerrace,
  type NasiaRecord,
  type PackedPlace,
  type PackedTerrace,
  type PlayRecord,
  type PlaySqlRow,
} from "./datasets";

/**
 * openDataService — conjuntos de Open Data BCN descargados desde el navegador.
 *
 * Cada conjunto se pide por separado, se convierte al modelo de la app y se guarda una semana
 * (respaldo de hasta dos meses si la red falla). Un conjunto que falla no rompe los demás ni la
 * app: simplemente no aporta lugares. Atribución: «Ajuntament de Barcelona · Open Data BCN».
 */

export type OpenDataPlaceSet = "fountains" | "shelters" | "toilets" | "viewpoints" | "playgrounds";

export interface OpenDataLoad<T> {
  value: T;
  /** true: la red falló y se usa la última copia guardada (caducada). */
  stale: boolean;
  fetchedAt: number;
}

const terraceCache = new TtlCache<PackedTerrace[]>({
  namespace: "fts:opendata:terraces",
  ttlMs: C.ttlMs,
  maxStaleMs: C.maxStaleMs,
  version: 1,
  persist: true,
});

const placeCache = new TtlCache<PackedPlace[]>({
  namespace: "fts:opendata:places",
  ttlMs: C.ttlMs,
  maxStaleMs: C.maxStaleMs,
  version: 1,
  persist: true,
});

async function resourcesOf(slug: string): Promise<CkanResource[]> {
  return packageResources(slug);
}

/** Fila con las claves en mayúsculas y los valores como texto (el datastore devuelve números). */
export function normalizeRow(r: Record<string, unknown>): CsvRow {
  const out: CsvRow = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined) continue;
    out[k.trim().toUpperCase()] = typeof v === "string" ? v : String(v);
  }
  return out;
}

const hasColumns = (row: CsvRow | undefined, required: readonly string[]) => !!row && required.every((c) => c in row);

/**
 * Filas de un conjunto tabular: primero el CSV más reciente (lo de siempre, rápido) y, si no trae
 * las columnas esperadas, el datastore (JSON paginado) con un tiempo máximo y sin reintentos para
 * no atascar el ETL. Si ninguna fuente sirve, falla con lo que vio (para el registro del ETL) en
 * lugar de dar 0 filas.
 */
async function tabularRows(slug: string, required: readonly string[], wanted: readonly string[]): Promise<CsvRow[]> {
  const seen: string[] = [];
  try {
    const resources = await resourcesOf(slug);
    const csv = newestResource(resources, "csv");
    if (!csv) throw new Error("sin CSV");
    const text = await fetchText(csv.url);
    const rows = csvToObjects(text).map((r) => normalizeRow(r));
    if (rows.length > 0 && hasColumns(rows[0], required)) return rows;
    const head = text.slice(0, 120).replace(/\s+/g, " ");
    seen.push(`csv «${csv.name ?? csv.url}» ${rows.length} filas [${Object.keys(rows[0] ?? {}).slice(0, 8).join(",")}] «${head}»`);
  } catch (e) {
    seen.push(`csv: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const id = await datastoreIdOf(slug);
    let records: Array<Record<string, unknown>>;
    // Páginas pequeñas con margen por página y un tope total: el portal a veces va muy lento.
    const opts = { pageSize: 1000, maxRows: 60_000, timeoutMs: 90_000, budgetMs: 9 * 60_000 };
    try {
      records = await datastoreSearchOnce<Record<string, unknown>>(id, wanted, opts);
    } catch (e) {
      // Solo si el problema eran los nombres de columna (no el tiempo), se prueba sin elegirlas.
      if (e instanceof Error && /tiempo agotado|aborted|abort/i.test(e.message)) throw e;
      records = await datastoreSearchOnce<Record<string, unknown>>(id, [], opts);
    }
    const rows = records.map(normalizeRow);
    if (rows.length > 0 && hasColumns(rows[0], required)) return rows;
    seen.push(`datastore ${rows.length} filas [${Object.keys(rows[0] ?? {}).slice(0, 8).join(",")}]`);
  } catch (e) {
    seen.push(`datastore: ${e instanceof Error ? e.message : String(e)}`);
  }
  throw new Error(`Open Data BCN: «${slug}» sin filas con ${required.join(", ")} (${seen.join(" · ")})`);
}

/** Columnas que usan `parseTerraces` y `parseFountains`. */
export const TERRACE_COLUMNS = [
  "EMPLACAMENT",
  "NOM_BARRI",
  "NOM_DISTRICTE",
  "SUPERFICIE_OCUPADA",
  "TAULES",
  "CADIRES",
  "TAULES_CALCADA",
  "VIGENCIA",
  "OCUPACIO",
  "LATITUD",
  "LONGITUD",
] as const;
export const FOUNTAIN_COLUMNS = ["CODI", "NOM", "CARRER", "NUMERO_CARRER", "NOM_BARRI", "LATITUD", "LONGITUD"] as const;

async function datastoreIdOf(slug: string): Promise<string> {
  const resources = await resourcesOf(slug);
  const r = newestResource(resources, "csv", { datastore: true }) ?? resources.find((x) => x.datastore_active);
  if (!r) throw new Error(`Open Data BCN: «${slug}» sin datastore`);
  return r.id;
}

/** NP-NASIA: los campos de coordenadas se llaman distinto en cada conjunto; se piden todos. */
async function nasiaRecords(slug: string): Promise<NasiaRecord[]> {
  const id = await datastoreIdOf(slug);
  try {
    return await datastoreSearch<NasiaRecord>(id, [
      ...NASIA_FIELDS,
      "geo_epgs_4326_lat",
      "geo_epgs_4326_lon",
    ]);
  } catch {
    return await datastoreSearch<NasiaRecord>(id, [...NASIA_FIELDS, "geo_epgs_4326_x", "geo_epgs_4326_y"]);
  }
}

const LOADERS: Record<OpenDataPlaceSet, () => Promise<SunPlace[]>> = {
  fountains: async () => parseFountains(await tabularRows(C.datasets.fountains, ["LATITUD", "LONGITUD"], FOUNTAIN_COLUMNS)),
  shelters: async () => parseShelters(await nasiaRecords(C.datasets.shelters)),
  toilets: async () => parseToilets(await nasiaRecords(C.datasets.toilets)),
  viewpoints: async () => parseViewpoints(await nasiaRecords(C.datasets.viewpoints)),
  playgrounds: async () => {
    const id = await datastoreIdOf(C.datasets.playgrounds);
    try {
      const rows = await datastoreSql<PlaySqlRow>(playgroundSql(id));
      if (rows.length > 0) return playGroupsToPlaces(playGroupsFromSql(rows));
    } catch {
      /* sin SQL: se agrupa en el navegador */
    }
    return playGroupsToPlaces(playGroupsFromRecords(await datastoreSearch<PlayRecord>(id, PLAY_FIELDS)));
  },
};

/**
 * Sección del fichero precalculado (`public/data/opendata.json`), con su frescura. `null` si no hay
 * fichero o la sección falta o está vacía.
 */
async function staticSection<P>(key: OpenDataSectionKey): Promise<{ items: P[]; fresh: boolean } | null> {
  const st = await loadStatic("opendata");
  const sec = (st?.sections as Record<string, { fetchedAt?: string; items?: P[] } | undefined> | undefined)?.[key];
  if (!sec || !Array.isArray(sec.items) || sec.items.length === 0) return null;
  return { items: sec.items, fresh: isFreshStatic({ generatedAt: sec.fetchedAt }) };
}

/** Precalculado reciente → en vivo → precalculado antiguo (antes de recurrir a la caché caducada). */
async function staticThenLive<P, T>(key: OpenDataSectionKey, unpack: (p: P[]) => T, live: () => Promise<T>): Promise<T> {
  const st = await staticSection<P>(key);
  if (st?.fresh) return unpack(st.items);
  try {
    return await live();
  } catch (err) {
    if (st) return unpack(st.items);
    throw err;
  }
}

/** Descarga directa de Open Data BCN, sin cachés (la usa el ETL de datos precalculados). */
export const openDataLive = {
  terraces: async (): Promise<LicensedTerrace[]> =>
    parseTerraces(await tabularRows(C.datasets.terraces, ["LATITUD", "LONGITUD", "EMPLACAMENT"], TERRACE_COLUMNS)),
  places: LOADERS,
};

export const OPEN_DATA_PLACE_SETS: OpenDataPlaceSet[] = [
  "playgrounds",
  "shelters",
  "fountains",
  "toilets",
  "viewpoints",
];

/** Memoria → caché fresca → red → caché caducada → error. Las llamadas simultáneas se comparten. */
class Loader<T, P> {
  private inflight: Promise<OpenDataLoad<T>> | null = null;
  private mem: OpenDataLoad<T> | null = null;
  private failedAt = 0;

  constructor(
    private readonly cache: TtlCache<P>,
    private readonly key: string,
    private readonly fetcher: () => Promise<T>,
    private readonly pack: (v: T) => P,
    private readonly unpack: (p: P) => T,
    private readonly isEmpty: (v: T) => boolean
  ) {}

  load(force = false): Promise<OpenDataLoad<T>> {
    if (this.mem && !force && (!this.mem.stale || Date.now() - this.failedAt < C.retryAfterMs)) {
      return Promise.resolve(this.mem);
    }
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const hit = force ? null : this.cache.get(this.key);
        if (hit) return (this.mem = { value: this.unpack(hit.value), stale: false, fetchedAt: hit.storedAt });
        try {
          const value = await this.fetcher();
          if (this.isEmpty(value)) throw new Error(`Open Data BCN: «${this.key}» vacío`);
          const now = Date.now();
          this.cache.set(this.key, this.pack(value), now);
          return (this.mem = { value, stale: false, fetchedAt: now });
        } catch (err) {
          this.failedAt = Date.now();
          const old = this.cache.getAllowStale(this.key);
          if (!old) throw err;
          return (this.mem = { value: this.unpack(old.value), stale: true, fetchedAt: old.storedAt });
        }
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

const terraceLoader = new Loader<LicensedTerrace[], PackedTerrace[]>(
  terraceCache,
  "terraces",
  () => staticThenLive<PackedTerrace, LicensedTerrace[]>("terraces", unpackTerraces, openDataLive.terraces),
  packTerraces,
  unpackTerraces,
  (v) => v.length === 0
);

const placeLoaders = Object.fromEntries(
  OPEN_DATA_PLACE_SETS.map((set) => [
    set,
    new Loader<SunPlace[], PackedPlace[]>(
      placeCache,
      set,
      () => staticThenLive<PackedPlace, SunPlace[]>(set, unpackPlaces, LOADERS[set]),
      packPlaces,
      unpackPlaces,
      (v) => v.length === 0
    ),
  ])
) as Record<OpenDataPlaceSet, Loader<SunPlace[], PackedPlace[]>>;

export interface OpenDataPlacesResult {
  places: SunPlace[];
  /** Conjuntos que no se pudieron cargar (ni de la red ni de la caché). */
  failed: OpenDataPlaceSet[];
  stale: boolean;
}

export const openDataService = {
  attribution: C.attribution,

  /** Licencias de terrazas vigentes (~7.000). */
  loadTerraces(force = false): Promise<OpenDataLoad<LicensedTerrace[]>> {
    return terraceLoader.load(force);
  },

  /** Áreas de juego, refugios climáticos, fuentes, lavabos y miradores. Nunca lanza. */
  async loadPlaces(sets: OpenDataPlaceSet[] = OPEN_DATA_PLACE_SETS, force = false): Promise<OpenDataPlacesResult> {
    const settled = await Promise.allSettled(sets.map((s) => placeLoaders[s].load(force)));
    const places: SunPlace[] = [];
    const failed: OpenDataPlaceSet[] = [];
    let stale = false;
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        places.push(...r.value.value);
        stale ||= r.value.stale;
      } else {
        failed.push(sets[i]);
      }
    });
    return { places, failed, stale };
  },
};
