/**
 * ETL del arbolado de Barcelona → public/data/trees/ (teselas z14 para el mapa).
 *
 * Fuentes (Open Data BCN · Ajuntament de Barcelona · CC BY 4.0):
 *   arbrat-viari  árboles de calle        (~43 MB en CSV)
 *   arbrat-zona   árboles de zona         (~14 MB)
 *   arbrat-parcs  árboles de los parques  (~10 MB)
 *
 * De cada árbol se guarda solo lo que dibuja el mapa: posición, tipo (perenne, caducifolio,
 * palmera, conífera, semicaducifolio), altura y copa (porte típico de su especie, corregido por
 * categoría y edad: ver src/graphics/trees/species.ts). Si las fuentes fallan o devuelven
 * demasiado pocos árboles, se conservan los ficheros anteriores.
 *
 * Respaldo: si un conjunto no se puede descargar (el portal da 403 a los servidores de GitHub con
 * el arbolado de calle), se completa con los árboles de OpenStreetMap (`natural=tree`, ODbL) del
 * extracto de Geofabrik que deja el flujo en TREES_GEOJSONSEQ, sin repetir los que ya están. Y si
 * aún no hay ningún arbolado publicado, se publica lo que haya llegado (marcado como parcial).
 *
 * Uso:  npx vite-node scripts/etl/build-trees.ts      (lo lanza .github/workflows/datos.yml)
 */
import { existsSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES_CONFIG } from "../../src/config";
import { fetchWithTimeout, isRetryable } from "../../src/lib/net";
import { configureCkan, datastoreSearchOnce, fetchText, packageResources, type CkanResource } from "../../src/services/openData/ckan";
import { parseCsv, toNumber } from "../../src/services/openData/csv";
import { mergeTrees, osmTreeRecord } from "../../src/graphics/trees/osmTrees";
import { treeDims } from "../../src/graphics/trees/species";
import { TREE_TILE_ZOOM, encodeTreeTiles, type TreeIndexFile, type TreeRecord } from "../../src/graphics/trees/treeTiles";
import { venuesFromGeojsonSeq } from "./osmiumVenues";

const OUT_DIR = resolve(process.cwd(), "public/data/trees");
const UA = "IFollowTheSun-ETL/1.0 (+https://github.com/kabalah314-ux/followthesun)";
const DATASETS = ["arbrat-viari", "arbrat-zona", "arbrat-parcs"] as const;
/** Por debajo, el inventario está incompleto y no sustituye al anterior. */
const MIN_TREES = 100_000;
/** Mínimo para publicar un arbolado parcial cuando todavía no hay ninguno. */
const MIN_PARTIAL = 20_000;

configureCkan({
  headers: { "User-Agent": UA },
  timeoutMs: 240_000,
  retries: 3,
  delaysMs: [5000, 20_000, 45_000],
  retryOn: isRetryable,
});

/** El CSV «vivo» del conjunto (OD_Arbrat_*_BCN.csv); si no está, el CSV más reciente. */
function pickCsv(resources: CkanResource[]): CkanResource | null {
  const csv = resources.filter((r) => (r.format ?? "").toLowerCase() === "csv");
  return csv.find((r) => /^OD_Arbrat_.*_BCN\.csv$/i.test(r.name ?? "")) ?? csv[0] ?? null;
}

/** Columnas que se usan (en minúsculas, como en la cabecera del CSV). */
const TREE_COLUMNS = ["codi", "latitud", "longitud", "cat_nom_cientific", "categoria_arbrat", "data_plantacio", "tipus_element"] as const;

/**
 * Filas del conjunto como objetos con las claves en minúsculas: primero el CSV y, si el portal no
 * deja descargarlo (403 de su protección) o no trae las columnas, el datastore (la API oficial)
 * por páginas y con un tiempo máximo.
 */
async function datasetRows(slug: string): Promise<Array<Record<string, string>>> {
  const resources = await packageResources(slug);
  const errors: string[] = [];
  const res = pickCsv(resources);
  if (res) {
    try {
      const rows = parseCsv(await fetchText(res.url));
      const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
      if (header.includes("latitud") && header.includes("longitud")) {
        return rows.slice(1).map((row) => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ""])));
      }
      errors.push(`csv sin latitud/longitud [${header.slice(0, 8).join(",")}]`);
    } catch (e) {
      errors.push(`csv: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const ds = resources.find((r) => r.datastore_active && (r.format ?? "").toLowerCase() === "csv") ?? resources.find((r) => r.datastore_active);
  if (ds) {
    try {
      const records = await datastoreSearchOnce<Record<string, unknown>>(ds.id, [], { pageSize: 5000, maxRows: 400_000, timeoutMs: 120_000, budgetMs: 15 * 60_000 });
      return records.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v === null || v === undefined ? "" : String(v)])));
    } catch (e) {
      errors.push(`datastore: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`«${slug}»: ${errors.join(" · ") || "sin CSV ni datastore"}`);
}

async function loadDataset(slug: string, now: Date): Promise<{ trees: Map<string, TreeRecord>; rows: number }> {
  const rows = await datasetRows(slug);
  const [cCode, cLat, cLng, cSci, cCat, cPlanted, cType] = TREE_COLUMNS;
  const b = PLACES_CONFIG.bbox;
  const trees = new Map<string, TreeRecord>();
  for (const row of rows) {
    const lat = toNumber(row[cLat]);
    const lng = toNumber(row[cLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < b.south - 0.02 || lat > b.north + 0.02 || lng < b.west - 0.02 || lng > b.east + 0.02) continue;
    const type = row[cType] ?? "";
    const d = treeDims({
      scientific: row[cSci] || undefined,
      category: row[cCat] || undefined,
      planted: row[cPlanted] || undefined,
      palm: /palmera/i.test(type),
      now,
    });
    const code = row[cCode] || `${lat.toFixed(6)},${lng.toFixed(6)}`;
    trees.set(code, { lng, lat, kind: d.kind, heightM: d.heightM, crownM: d.crownM });
  }
  return { trees, rows: rows.length };
}

/** Árboles de OpenStreetMap del extracto (vacío si el flujo no lo dejó). */
async function osmTreeList(now: Date): Promise<TreeRecord[]> {
  const path = process.env.TREES_GEOJSONSEQ;
  if (!path || !existsSync(path)) return [];
  const b = PLACES_CONFIG.bbox;
  const nodes = await venuesFromGeojsonSeq(path, { west: b.west - 0.02, south: b.south - 0.02, east: b.east + 0.02, north: b.north + 0.02 });
  return nodes
    .filter((n) => n.type === "node" && n.lat !== undefined && n.lon !== undefined)
    .map((n) => osmTreeRecord(n.lon as number, n.lat as number, n.tags ?? {}, now));
}

async function main() {
  // Si el portal no responde, se conservan las teselas anteriores sin gastar media hora en reintentos.
  try {
    const res = await fetchWithTimeout(
      `https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=${DATASETS[0]}`,
      { headers: { "User-Agent": UA } },
      60_000
    );
    const json = (await res.json()) as { success?: boolean };
    if (json?.success !== true) throw new Error("respuesta inesperada");
  } catch (e) {
    console.log(`::warning::Arbolado: Open Data BCN no responde (${e instanceof Error ? e.message : String(e)}); se conservan las teselas anteriores`);
    return;
  }
  const now = new Date();
  const all = new Map<string, TreeRecord>();
  const summary: string[] = [];
  let failed = 0;
  for (const slug of DATASETS) {
    const t0 = Date.now();
    try {
      const { trees, rows } = await loadDataset(slug, now);
      for (const [k, v] of trees) all.set(k, v);
      summary.push(`| ${slug} | ok | ${trees.size} de ${rows} filas | ${Math.round((Date.now() - t0) / 1000)} s |`);
      console.log(`✓ ${slug}: ${trees.size} árboles`);
    } catch (e) {
      failed++;
      summary.push(`| ${slug} | falló | — | ${Math.round((Date.now() - t0) / 1000)} s |`);
      console.log(`::warning::Arbolado · ${slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let list = [...all.values()];
  // Un conjunto no llegó: se completa con OpenStreetMap sin repetir árboles.
  let osmAdded = 0;
  if (failed > 0) {
    const t0 = Date.now();
    try {
      const osm = await osmTreeList(now);
      if (osm.length > 0) {
        const merged = mergeTrees(list, osm);
        list = merged.trees;
        osmAdded = merged.added;
        summary.push(`| OpenStreetMap (respaldo) | ok | ${merged.added} añadidos de ${osm.length} | ${Math.round((Date.now() - t0) / 1000)} s |`);
        console.log(`✓ OpenStreetMap: ${merged.added} árboles añadidos (de ${osm.length})`);
      } else {
        summary.push("| OpenStreetMap (respaldo) | sin extracto | — | — |");
      }
    } catch (e) {
      summary.push("| OpenStreetMap (respaldo) | falló | — | — |");
      console.log(`::warning::Arbolado · OpenStreetMap: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const table = ["| Conjunto | Estado | Árboles | Tiempo |", "| --- | --- | --- | --- |", ...summary].join("\n");
  console.log(`\n${table}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Arbolado (${now.toISOString()})\n\n${table}\n\nTotal: ${list.length} árboles\n`);
  }

  const complete = (failed === 0 || osmAdded > 0) && list.length >= MIN_TREES;
  const previous = existsSync(resolve(OUT_DIR, "index.json"));
  if (!complete && (previous || list.length < MIN_PARTIAL)) {
    console.log(`::warning::Arbolado incompleto (${list.length} árboles, ${failed} conjunto(s) con fallo): se conservan los ficheros anteriores`);
    return;
  }
  if (!complete) console.log(`::warning::Arbolado parcial (${list.length} árboles): se publica porque aún no había ninguno`);

  const tiles = encodeTreeTiles(list, TREE_TILE_ZOOM);
  // Se rehace la carpeta entera: una tesela que se queda sin árboles no debe sobrevivir.
  const zDir = resolve(OUT_DIR, String(TREE_TILE_ZOOM));
  if (existsSync(zDir)) rmSync(zDir, { recursive: true, force: true });
  let bytes = 0;
  for (const [key, file] of tiles) {
    const [x, y] = key.split("/");
    const dir = resolve(zDir, x);
    mkdirSync(dir, { recursive: true });
    const body = JSON.stringify(file) + "\n";
    bytes += body.length;
    writeFileSync(resolve(dir, `${y}.json`), body, "utf8");
  }
  const index: TreeIndexFile = {
    v: 1,
    kind: "trees",
    generatedAt: now.toISOString(),
    z: TREE_TILE_ZOOM,
    tiles: [...tiles.keys()],
    count: list.length,
    ...(complete ? {} : { partial: true }),
    sources: [
      {
        name: "Ajuntament de Barcelona · Open Data BCN (arbrat viari, zona i parcs)",
        license: "CC BY 4.0",
        url: "https://opendata-ajuntament.barcelona.cat/",
      },
      ...(osmAdded > 0 ? [{ name: "© OpenStreetMap contributors (natural=tree)", license: "ODbL 1.0", url: "https://www.openstreetmap.org/copyright" }] : []),
    ],
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "index.json"), JSON.stringify(index) + "\n", "utf8");
  console.log(`→ ${tiles.size} teselas · ${list.length} árboles · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
