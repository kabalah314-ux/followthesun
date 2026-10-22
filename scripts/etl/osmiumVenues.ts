import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { GeoBounds } from "../../src/types";
import type { OvNode } from "../../src/services/venueService";

/**
 * Negocios de OpenStreetMap desde un extracto de Geofabrik filtrado con osmium (sin depender de
 * los servidores públicos de Overpass, que desde GitHub Actions cortan las consultas largas).
 *
 * El flujo .github/workflows/datos.yml deja en VENUES_GEOJSONSEQ un fichero GeoJSON por líneas
 * (`osmium export -f geojsonseq -a type,id`) con los cafés, bares, restaurantes, pubs, heladerías
 * y cervecerías de Cataluña. Aquí se recortan a la caja de la ciudad y se convierten al mismo
 * formato que devuelve Overpass, así el resto del ETL no cambia.
 */

interface SeqFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

/** Punto representativo: el propio punto o la media de los vértices del anillo exterior. */
function pointOf(g: SeqFeature["geometry"]): [number, number] | null {
  if (!g || !g.coordinates) return null;
  const c = g.coordinates as number[] | number[][] | number[][][] | number[][][][];
  const avg = (pts: number[][]): [number, number] | null => {
    const ok = pts.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (ok.length === 0) return null;
    // Anillo cerrado: el último punto repite el primero.
    const ring = ok.length > 2 && ok[0][0] === ok[ok.length - 1][0] && ok[0][1] === ok[ok.length - 1][1] ? ok.slice(0, -1) : ok;
    return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  };
  switch (g.type) {
    case "Point":
      return Number.isFinite((c as number[])[0]) ? [(c as number[])[0], (c as number[])[1]] : null;
    case "LineString":
      return avg(c as number[][]);
    case "Polygon":
      return avg((c as number[][][])[0] ?? []);
    case "MultiPolygon":
      return avg(((c as number[][][][])[0] ?? [])[0] ?? []);
    default:
      return null;
  }
}

/** Lee el GeoJSON por líneas y devuelve los elementos dentro de la caja, como los de Overpass. */
export async function venuesFromGeojsonSeq(path: string, bounds: GeoBounds): Promise<OvNode[]> {
  if (!existsSync(path)) throw new Error(`no existe ${path}`);
  const out: OvNode[] = [];
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const raw of rl) {
    // geojsonseq puede llevar el separador RS (U+001E) delante de cada objeto.
    const line = raw.replace(/^\u001e/, "").trim();
    if (!line) continue;
    let f: SeqFeature;
    try {
      f = JSON.parse(line) as SeqFeature;
    } catch {
      continue;
    }
    const props = f.properties ?? {};
    const type = props["@type"];
    const id = Number(props["@id"]);
    if ((type !== "node" && type !== "way" && type !== "relation") || !Number.isFinite(id)) continue;
    const p = pointOf(f.geometry);
    if (!p) continue;
    const [lon, lat] = p;
    if (lat < bounds.south || lat > bounds.north || lon < bounds.west || lon > bounds.east) continue;
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) if (!k.startsWith("@") && typeof v === "string") tags[k] = v;
    out.push({ type, id, lat, lon, tags });
  }
  return out;
}
