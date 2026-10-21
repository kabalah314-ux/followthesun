import { distanceMeters } from "../../lib/coordinates";
import type { TerraceCertainty, Venue } from "../../types";
import { OPEN_DATA_CONFIG as C } from "./config";
import type { LicensedTerrace } from "./datasets";
import { intlLocale, tr, trPlural, type MessageKey } from "../../i18n";

/**
 * Cruce de las terrazas con licencia municipal (Open Data BCN) con los locales de OpenStreetMap.
 *
 *  · Licencia + local de OSM a ≤ 15 m → el negocio de OSM, con su nombre, situado en la licencia
 *    (que marca dónde están las mesas) y con el sello `licensed` (mesas, sillas, temporada).
 *  · Licencia sin local cercano       → «Terraza autorizada · <dirección>» (el conjunto no trae el
 *    nombre del negocio; nunca se inventa).
 *  · Local de OSM sin licencia        → solo se conserva si OSM confirma la terraza
 *    (`outdoor_seating=yes`): sin licencia, un «probable» por estar en planta baja casi seguro no
 *    tiene mesas en la calle.
 *
 * Si no se pudo cargar el conjunto de licencias (`terraces === null`) se devuelve OSM tal cual.
 */

export const LICENSED_TERRACE_SOURCE = tr("terraceMatching.licencia_municipal_de_terraza_open");

export interface TerraceLicenseInfo {
  /** Licencias sumadas en ese punto (acera, calzada…). */
  licenses: number;
  tables: number | null;
  chairs: number | null;
  areaM2: number | null;
  seasonal: boolean;
  privateSpace: boolean;
  onRoadway: boolean;
  address: string;
  neighborhood: string;
}

const CELL = 0.0003; // ≈ 33 m de latitud: con 3×3 celdas se cubre de sobra el radio de cruce

const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;

function licenseInfo(list: LicensedTerrace[]): TerraceLicenseInfo {
  const sum = (pick: (t: LicensedTerrace) => number | null) => {
    let any = false;
    let total = 0;
    for (const t of list) {
      const v = pick(t);
      if (v !== null) {
        any = true;
        total += v;
      }
    }
    return any ? Math.round(total * 10) / 10 : null;
  };
  return {
    licenses: list.length,
    tables: sum((t) => t.tables),
    chairs: sum((t) => t.chairs),
    areaM2: sum((t) => t.areaM2),
    seasonal: list.every((t) => t.seasonal),
    privateSpace: list.every((t) => t.privateSpace),
    onRoadway: list.some((t) => t.onRoadway),
    address: list[0].address,
    neighborhood: list[0].neighborhood,
  };
}

/** Rango de certeza para ordenar: licencia > confirmada en OSM > probable > desconocida > no. */
export function terraceRank(terrace: TerraceCertainty, licensed: boolean): number {
  if (licensed) return 4;
  return terrace === "confirmed" ? 3 : terrace === "likely" ? 2 : terrace === "unknown" ? 1 : 0;
}

const fmtCount = (n: number) =>
  Number.isInteger(n) ? String(n) : new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

type Forms = { one: MessageKey; other: MessageKey };
const TABLES: Forms = { one: "terraceMatching.mesa_one", other: "terraceMatching.mesa_other" };
const CHAIRS: Forms = { one: "terraceMatching.silla_one", other: "terraceMatching.silla_other" };

/** «Terraza con licencia municipal: 6 mesas y 24 sillas autorizadas, todo el año.» */
export function licenseSummary(info: TerraceLicenseInfo): string {
  const items: Array<[number, Forms]> = [];
  if (info.tables !== null && info.tables > 0) items.push([info.tables, TABLES]);
  if (info.chairs !== null && info.chairs > 0) items.push([info.chairs, CHAIRS]);
  const parts = items.map(([n, forms]) => trPlural(n, forms, { n: fmtCount(n) }));
  const single = items.length === 1 && items[0][0] === 1;
  const what = parts.length
    ? tr(single ? "terraceMatching.autorizada" : "terraceMatching.autorizadas", { p0: parts.join(tr("terraceMatching.y")) })
    : "";
  const when = info.seasonal ? tr("terraceMatching.de_temporada") : tr("terraceMatching.todo_el_ano");
  let text = tr("terraceMatching.terraza_con_licencia_municipal", { p0: what, p1: when });
  if (info.privateSpace) text += tr("terraceMatching.en_espacio_privado_de_uso");
  else if (info.onRoadway) text += tr("terraceMatching.parte_de_las_mesas_estan");
  return text;
}

export function unnamedTerraceName(address: string): string {
  return tr("terraceMatching.terraza_autorizada", { p0: address });
}

export function mergeLicensedTerraces(
  osm: Venue[],
  terraces: LicensedTerrace[] | null,
  radiusM: number = C.terraceMatchRadiusM
): Venue[] {
  if (!terraces) return osm;

  const grid = new Map<string, Venue[]>();
  for (const v of osm) {
    const k = cellKey(v.latitude, v.longitude);
    const list = grid.get(k);
    if (list) list.push(v);
    else grid.set(k, [v]);
  }
  const nearest = (lat: number, lng: number): Venue | null => {
    const i = Math.floor(lat / CELL);
    const j = Math.floor(lng / CELL);
    let best: Venue | null = null;
    let bestD = radiusM;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const v of grid.get(`${i + di},${j + dj}`) ?? []) {
          const d = distanceMeters(lng, lat, v.longitude, v.latitude);
          if (d <= bestD) {
            best = v;
            bestD = d;
          }
        }
      }
    }
    return best;
  };

  const matched = new Map<string, { venue: Venue; terraces: LicensedTerrace[] }>();
  const unmatched: LicensedTerrace[] = [];
  for (const t of terraces) {
    const v = nearest(t.latitude, t.longitude);
    if (!v) {
      unmatched.push(t);
      continue;
    }
    const m = matched.get(v.id);
    if (m) m.terraces.push(t);
    else matched.set(v.id, { venue: v, terraces: [t] });
  }

  const named: Venue[] = [];
  for (const { venue, terraces: list } of matched.values()) {
    const info = licenseInfo(list);
    named.push({
      ...venue,
      // La licencia marca dónde están las mesas; el punto de OSM, dónde está el local.
      latitude: list[0].latitude,
      longitude: list[0].longitude,
      terrace: "confirmed",
      terraceSource: LICENSED_TERRACE_SOURCE,
      metadata: {
        ...venue.metadata,
        licensed: info,
        named: true,
        address: info.address,
        osmPoint: [venue.longitude, venue.latitude],
        terraceRank: terraceRank("confirmed", true),
      },
    });
  }

  const unnamed: Venue[] = unmatched.map((t) => {
    const info = licenseInfo([t]);
    return {
      id: t.id,
      name: unnamedTerraceName(t.address),
      category: "terrace",
      latitude: t.latitude,
      longitude: t.longitude,
      terrace: "confirmed",
      terraceSource: LICENSED_TERRACE_SOURCE,
      metadata: {
        licensed: info,
        named: false,
        address: t.address,
        terraceRank: terraceRank("confirmed", true),
      },
    };
  });

  const osmOnly: Venue[] = osm
    .filter((v) => !matched.has(v.id) && v.terrace === "confirmed")
    .map((v) => ({ ...v, metadata: { ...v.metadata, named: true, terraceRank: terraceRank(v.terrace, false) } }));

  // Primero lo más fiable y con nombre: el motor toma los candidatos en este orden si no hay
  // ubicación con la que ordenarlos por cercanía.
  return [...named, ...unnamed, ...osmOnly];
}
