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
 * Uso:  npx vite-node scripts/etl/build-trees.ts      (lo lanza .github/workflows/datos.yml)
 */
import { existsSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES_CONFIG } from "../../src/config";
import { fetchWithTimeout, isRetryable } from "../../src/lib/net";
import { configureCkan, fetchText, packageResources, type CkanResource } from "../../src/services/openData/ckan";
import { parseCsv, toNumber } from "../../src/services/openData/csv";
import { treeDims } from "../../src/graphics/trees/species";
import { TREE_TILE_ZOOM, encodeTreeTiles, type TreeIndexFile, type TreeRecord } from "../../src/graphics/trees/treeTiles";

const OUT_DIR = resolve(process.cwd(), "public/data/trees");
const UA = "IFollowTheSun-ETL/1.0 (+https://github.com/kabalah314-ux/followthesun)";
const DATASETS = ["arbrat-viari", "arbrat-zona", "arbrat-parcs"] as const;
/** Por debajo, el inventario está incompleto y no sustituye al anterior. */
const MIN_TREES = 100_000;

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

async function loadDataset(slug: string, now: Date): Promise<{ trees: Map<string, TreeRecord>; rows: number }> {
  const res = pickCsv(await packageResources(slug));
  if (!res) throw new Error(`«${slug}» sin CSV`);
  const text = await fetchText(res.url);
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const iCode = col("codi");
  const iLat = col("latitud");
  const iLng = col("longitud");
  const iSci = col("cat_nom_cientific");
  const iCat = col("categoria_arbrat");
  const iPlanted = col("data_plantacio");
  const iType = col("tipus_element");
  if (iLat < 0 || iLng < 0) throw new Error(`«${slug}»: faltan latitud/longitud en la cabecera`);
  const b = PLACES_CONFIG.bbox;
  const trees = new Map<string, TreeRecord>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lat = toNumber(row[iLat]);
    const lng = toNumber(row[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < b.south - 0.02 || lat > b.north + 0.02 || lng < b.west - 0.02 || lng > b.east + 0.02) continue;
    const type = iType >= 0 ? row[iType] ?? "" : "";
    const d = treeDims({
      scientific: iSci >= 0 ? row[iSci] : undefined,
      category: iCat >= 0 ? row[iCat] : undefined,
      planted: iPlanted >= 0 ? row[iPlanted] : undefined,
      palm: /palmera/i.test(type),
      now,
    });
    const code = (iCode >= 0 ? row[iCode] : "") || `${lat.toFixed(6)},${lng.toFixed(6)}`;
    trees.set(code, { lng, lat, kind: d.kind, heightM: d.heightM, crownM: d.crownM });
  }
  return { trees, rows: rows.length - 1 };
}

async function main() {
  // Si el portal no responde, se conservan las teselas anteriores sin gastar media hora en reintentos.
  try {
    const res = await fetchWithTimeout(
      `https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_show?id=${DATASETS[0]}`,
      { headers: { "User-Agent": UA } },
      30_000
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

  const list = [...all.values()];
  const table = ["| Conjunto | Estado | Árboles | Tiempo |", "| --- | --- | --- | --- |", ...summary].join("\n");
  console.log(`\n${table}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Arbolado (${now.toISOString()})\n\n${table}\n\nTotal: ${list.length} árboles\n`);
  }

  if (failed > 0 || list.length < MIN_TREES) {
    console.log(`::warning::Arbolado incompleto (${list.length} árboles, ${failed} conjunto(s) con fallo): se conservan los ficheros anteriores`);
    return;
  }

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
    sources: [
      {
        name: "Ajuntament de Barcelona · Open Data BCN (arbrat viari, zona i parcs)",
        license: "CC BY 4.0",
        url: "https://opendata-ajuntament.barcelona.cat/",
      },
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
