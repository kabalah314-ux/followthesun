/**
 * ETL de alturas del Catastro → public/data/heights/ (teselas z14 para las sombras).
 *
 * Fuente: Dirección General del Catastro · INSPIRE Buildings (BU) del municipio de Barcelona
 * (08900), descarga ATOM. Del GML de partes de edificio (`*.buildingpart.gml`, ETRS89 / UTM) se
 * guarda por parte: centroide, plantas sobre rasante y área. En la app sirven para dar altura a
 * las huellas de OpenStreetMap que no la tienen (ver src/services/map/catastroHeights.ts).
 * Si la descarga falla o salen demasiado pocas partes, se conservan los ficheros anteriores.
 *
 * Uso:  npx vite-node scripts/etl/build-heights.ts      (lo lanza .github/workflows/datos.yml)
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PLACES_CONFIG } from "../../src/config";
import {
  CATASTRO,
  HEIGHT_TILE_ZOOM,
  encodeHeightTiles,
  parseBuildingParts,
  zoneFromGml,
  type BuildingPartRecord,
  type HeightIndexFile,
} from "../../src/services/map/catastroHeights";

const OUT_DIR = resolve(process.cwd(), "public/data/heights");
const UA = "IFollowTheSun-ETL/1.0 (+https://github.com/kabalah314-ux/followthesun)";
/** Por debajo, la descarga está incompleta y no sustituye a la anterior. */
const MIN_PARTS = 50_000;
/** Partes más pequeñas (casetas, patinejos) no cambian ninguna sombra. */
const MIN_AREA_M2 = 10;

async function download(url: string, file: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(file, buf);
      return buf.length;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`Descarga fallida (${String(e)}), reintento ${attempt + 1}/3…`);
      await new Promise((res) => setTimeout(res, attempt * 20_000));
    }
  }
}

async function parseGml(file: string): Promise<{ parts: BuildingPartRecord[]; zone: number; read: number }> {
  const b = PLACES_CONFIG.bbox;
  const parts: BuildingPartRecord[] = [];
  let zone: number | null = null;
  let read = 0;
  let buf = "";
  for await (const chunk of createReadStream(file, { encoding: "utf8", highWaterMark: 4 << 20 })) {
    buf += chunk as string;
    zone ??= zoneFromGml(buf);
    const res = parseBuildingParts(buf, zone ?? 31);
    buf = res.rest;
    read += res.parts.length;
    for (const p of res.parts) {
      if (p.areaM2 < MIN_AREA_M2) continue;
      if (p.lat < b.south || p.lat > b.north || p.lng < b.west || p.lng > b.east) continue;
      parts.push(p);
    }
  }
  return { parts, zone: zone ?? 31, read };
}

async function main() {
  const now = new Date();
  const work = mkdtempSync(join(tmpdir(), "catastro-"));
  try {
    const zip = join(work, "bu.zip");
    const bytes = await download(CATASTRO.zipUrl, zip);
    execFileSync("unzip", ["-o", "-q", zip, "*buildingpart.gml", "-d", work]);
    const gml = readdirSync(work).find((f) => /buildingpart\.gml$/i.test(f));
    if (!gml) throw new Error("El ZIP del Catastro no trae el GML de partes de edificio");
    const { parts, zone, read } = await parseGml(join(work, gml));

    const floors = new Map<number, number>();
    for (const p of parts) floors.set(Math.min(p.floors, 12), (floors.get(Math.min(p.floors, 12)) ?? 0) + 1);
    const hist = [...floors.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([f, n]) => `| ${f === 12 ? "12+" : f} | ${n} |`)
      .join("\n");
    const text = `ZIP ${(bytes / 1e6).toFixed(1)} MB · huso ${zone} · ${read} partes con plantas · ${parts.length} útiles`;
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Alturas del Catastro (${now.toISOString()})\n\n${text}\n\n| Plantas | Partes |\n|---|---|\n${hist}\n`
      );
    }
    if (parts.length < MIN_PARTS) {
      console.warn(`Solo ${parts.length} partes (< ${MIN_PARTS}): se conservan los datos anteriores.`);
      process.exitCode = 1;
      return;
    }

    const tiles = encodeHeightTiles(parts, HEIGHT_TILE_ZOOM);
    const zDir = resolve(OUT_DIR, String(HEIGHT_TILE_ZOOM));
    if (existsSync(zDir)) rmSync(zDir, { recursive: true, force: true });
    for (const [key, tile] of tiles) {
      const [x, y] = key.split("/");
      const dir = resolve(zDir, x);
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, `${y}.json`), JSON.stringify(tile), "utf8");
    }
    const index: HeightIndexFile = {
      v: 1,
      kind: "heights",
      generatedAt: now.toISOString(),
      z: HEIGHT_TILE_ZOOM,
      tiles: [...tiles.keys()],
      count: parts.length,
      source: CATASTRO.source,
      floorM: CATASTRO.floorM,
      extraM: CATASTRO.extraM,
    };
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "index.json"), JSON.stringify(index) + "\n", "utf8");
    console.log(`${tiles.size} teselas escritas en ${OUT_DIR}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
