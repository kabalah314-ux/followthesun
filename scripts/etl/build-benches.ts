/**
 * ETL de los bancos de la calle → public/data/benches.json (utilidad 12 de la guía maestra 2).
 *
 * Fuente: OpenStreetMap `amenity=bench` (© OpenStreetMap contributors, ODbL) del mismo extracto de
 * Geofabrik que los negocios: .github/workflows/datos.yml lo filtra con osmium y deja la ruta en
 * BENCHES_GEOJSONSEQ. Si falta el extracto o salen muy pocos bancos, se conserva el fichero anterior.
 *
 * Uso:  npx vite-node scripts/etl/build-benches.ts
 */
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLACES_CONFIG } from "../../src/config";
import { packBenches, type BenchFile } from "../../src/lib/benches";
import { venuesFromGeojsonSeq } from "./osmiumVenues";

const OUT = resolve(process.cwd(), "public/data/benches.json");
const MIN_BENCHES = 1000;

function summary(line: string) {
  console.log(line);
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) appendFileSync(f, `${line}\n`);
}

async function main() {
  const path = process.env.BENCHES_GEOJSONSEQ;
  if (!path || !existsSync(path)) {
    summary("Bancos: sin extracto de OpenStreetMap; se conserva el fichero anterior.");
    return;
  }
  const nodes = await venuesFromGeojsonSeq(path, PLACES_CONFIG.bbox);
  const items = packBenches(
    nodes
      .filter((n) => n.type === "node" && n.lat !== undefined && n.lon !== undefined)
      .map((n) => ({ id: n.id, lat: n.lat as number, lng: n.lon as number, backrest: n.tags?.backrest === "yes" }))
  );
  if (items.length < MIN_BENCHES) {
    summary(`Bancos: solo ${items.length}; se conserva el fichero anterior.`);
    return;
  }
  const file: BenchFile = {
    v: 1,
    generatedAt: new Date().toISOString(),
    source: "© OpenStreetMap contributors (ODbL)",
    items,
  };
  const json = JSON.stringify(file);
  writeFileSync(OUT, json);
  summary(`✓ Bancos: ${items.length} → benches.json ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error("✗ Bancos:", e);
  process.exitCode = 1;
});
