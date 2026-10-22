import type { SunPlace } from "../types";
import { tr } from "../i18n";

/**
 * Bancos de la calle (guía maestra 2, utilidad 12 «Banco al sol o a la sombra»): OpenStreetMap
 * `amenity=bench`, precalculados por el ETL en public/data/benches.json con lo mínimo.
 */

/** [lat, lng, id del nodo de OSM, banderas (1 = con respaldo)]. */
export type PackedBench = [number, number, number, number];

export interface BenchFile {
  v: 1;
  generatedAt: string;
  source: string;
  items: PackedBench[];
}

export interface BenchRecord {
  id: number;
  lat: number;
  lng: number;
  backrest: boolean;
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

export function packBenches(list: readonly BenchRecord[]): PackedBench[] {
  const seen = new Set<string>();
  const out: PackedBench[] = [];
  for (const b of list) {
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng) || !Number.isFinite(b.id)) continue;
    const key = `${r5(b.lat)},${r5(b.lng)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([r5(b.lat), r5(b.lng), b.id, b.backrest ? 1 : 0]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function unpackBenches(items: readonly PackedBench[]): SunPlace[] {
  const plain = tr("benches.banco");
  const backed = tr("benches.con_respaldo");
  return items.map(([lat, lng, id, flags]) => ({
    id: `osm:node/${id}`,
    name: flags & 1 ? backed : plain,
    type: "bench" as const,
    latitude: lat,
    longitude: lng,
    source: "OpenStreetMap",
    metadata: { backrest: (flags & 1) === 1 },
  }));
}
