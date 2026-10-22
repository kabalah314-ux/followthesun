import { TREE_KIND, treeDims } from "./species";
import type { TreeRecord } from "./treeTiles";

/**
 * Árboles de OpenStreetMap (`natural=tree`) como respaldo del inventario municipal: si Open Data
 * BCN no deja descargar un conjunto (el arbolado de calle llega a dar 403 a los servidores de
 * GitHub), se completa con los árboles de OSM que no estén ya en los conjuntos que sí llegaron.
 */

const PALM_GENERA = /^(phoenix|washingtonia|trachycarpus|chamaerops|butia|syagrus|archontophoenix|livistona)\b/i;

function num(v: string | undefined): number | null {
  if (!v) return null;
  const x = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

const round05 = (x: number) => Math.round(x * 2) / 2;

/** Un árbol de OSM → registro del mapa: porte de su especie o género; si no, según el tipo de hoja. */
export function osmTreeRecord(lng: number, lat: number, tags: Readonly<Record<string, string>>, now = new Date()): TreeRecord {
  const scientific = tags.species || tags.taxon || tags.genus || undefined;
  const palm = PALM_GENERA.test(scientific ?? "") || tags.leaf_type === "palm";
  const d = treeDims({ scientific, planted: tags.start_date, palm, now });
  let kind = d.kind;
  if (!scientific && !palm) {
    if (tags.leaf_type === "needleleaved") kind = TREE_KIND.conifer;
    else if (tags.leaf_cycle === "evergreen") kind = TREE_KIND.evergreen;
    else if (tags.leaf_cycle === "semi_deciduous" || tags.leaf_cycle === "semi_evergreen") kind = TREE_KIND.semi;
  }
  const h = num(tags.height);
  const c = num(tags.diameter_crown);
  return {
    lng,
    lat,
    kind,
    heightM: h !== null && h >= 1.5 && h <= 45 ? round05(h) : d.heightM,
    crownM: c !== null && c >= 0.5 && c <= 30 ? round05(c) : d.crownM,
  };
}

const M_PER_DEG_LAT = 110_574;

/**
 * Une `extra` a `base` sin repetir: se descarta todo árbol de `extra` a menos de `minM` metros de
 * uno de `base` (el mismo árbol en las dos fuentes). Rejilla de celdas de `minM` metros.
 */
export function mergeTrees(base: readonly TreeRecord[], extra: readonly TreeRecord[], minM = 3): { trees: TreeRecord[]; added: number } {
  const ref = base[0] ?? extra[0];
  if (!ref) return { trees: [], added: 0 };
  const kx = 111_320 * Math.cos((ref.lat * Math.PI) / 180);
  const cell = (t: TreeRecord) => [Math.floor((t.lng * kx) / minM), Math.floor((t.lat * M_PER_DEG_LAT) / minM)] as const;
  const grid = new Map<string, TreeRecord[]>();
  for (const t of base) {
    const [cx, cy] = cell(t);
    const k = `${cx},${cy}`;
    const list = grid.get(k);
    if (list) list.push(t);
    else grid.set(k, [t]);
  }
  const out = [...base];
  let added = 0;
  for (const t of extra) {
    const [cx, cy] = cell(t);
    let dup = false;
    for (let dx = -1; dx <= 1 && !dup; dx++) {
      for (let dy = -1; dy <= 1 && !dup; dy++) {
        for (const o of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.hypot((o.lng - t.lng) * kx, (o.lat - t.lat) * M_PER_DEG_LAT) < minM) {
            dup = true;
            break;
          }
        }
      }
    }
    if (dup) continue;
    out.push(t);
    added++;
  }
  return { trees: out, added };
}
