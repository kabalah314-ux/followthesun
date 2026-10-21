import { TtlCache } from "../../lib/cache";
import type { SunPlace } from "../../types";
import {
  datastoreSearch,
  datastoreSql,
  fetchText,
  newestResource,
  packageResources,
  type CkanResource,
} from "./ckan";
import { OPEN_DATA_CONFIG as C } from "./config";
import { csvToObjects } from "./csv";
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

async function newestCsvRows(slug: string) {
  const resources = await resourcesOf(slug);
  const csv = newestResource(resources, "csv");
  if (!csv) throw new Error(`Open Data BCN: «${slug}» sin CSV`);
  return csvToObjects(await fetchText(csv.url));
}

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
  fountains: async () => parseFountains(await newestCsvRows(C.datasets.fountains)),
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
  async () => parseTerraces(await newestCsvRows(C.datasets.terraces)),
  packTerraces,
  unpackTerraces,
  (v) => v.length === 0
);

const placeLoaders = Object.fromEntries(
  OPEN_DATA_PLACE_SETS.map((set) => [
    set,
    new Loader<SunPlace[], PackedPlace[]>(placeCache, set, LOADERS[set], packPlaces, unpackPlaces, (v) => v.length === 0),
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
