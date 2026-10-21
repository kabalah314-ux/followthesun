import { PLACES_CONFIG } from "../../config";
import { distanceMeters } from "../../lib/coordinates";
import type { SunPlace } from "../../types";
import { OPEN_DATA_CONFIG as C } from "./config";
import { toNumber, type CsvRow } from "./csv";
import { tr } from "../../i18n";

/**
 * Conversión de los conjuntos de Open Data BCN al modelo de la app. Nada se inventa: un registro
 * sin coordenadas válidas dentro de Barcelona se descarta, y los textos se limpian, no se reescriben.
 */

export const OPEN_DATA_SOURCE = "Open Data BCN";

const BOX = PLACES_CONFIG.bbox;
const MARGIN = 0.01;

export function inBarcelona(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat > BOX.south - MARGIN &&
    lat < BOX.north + MARGIN &&
    lng > BOX.west - MARGIN &&
    lng < BOX.east + MARGIN
  );
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const numOrNull = (v: string | undefined) => {
  const n = toNumber(v);
  return Number.isFinite(n) ? n : null;
};

/* -------------------------------------------------------------------------- */
/*  Textos                                                                     */
/* -------------------------------------------------------------------------- */

const LOWER_WORDS = new Set(["de", "del", "dels", "la", "les", "el", "els", "i", "y", "a", "en", "lo"]);
/** Números romanos de varias letras (Isabel II, Pius XII); «i» sola es la conjunción catalana. */
const ROMAN_RE = /^(ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii)([,.]?)$/;

/**
 * «C. PROVENÇA, 419-425» → «C. Provença, 419-425». Las direcciones del padrón vienen en mayúsculas
 * (a veces sin acentos: no se pueden recuperar).
 */
export function titleCaseAddress(raw: string): string {
  const s = clean(raw);
  if (!s || s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (!w) return w;
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      const roman = ROMAN_RE.exec(w);
      if (i > 0 && roman) return roman[1].toUpperCase() + roman[2];
      const m = /^([dl]')(.+)$/.exec(w);
      if (m) return (i === 0 ? m[1].toUpperCase() : m[1]) + m[2].charAt(0).toUpperCase() + m[2].slice(1);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const PREFIX_RE =
  /^(pl\.?|plaça|placeta|parc\.?( de| del| dels)?|park|jardins?( de| del| dels)?|jardí( de| del)?|pg\.?|passeig( de)?|av\.?|ptge\.?|passatge|rbla\.?|rambla( de)?|via)$/i;

/** «Ram de l'Aigüa, Pl.» → «Pl. Ram de l'Aigüa» (los espacios verdes vienen con el tipo al final). */
export function reorderSpaceName(raw: string): string {
  const s = clean(raw);
  const m = /^(.+?),\s*([^,]+?)\s*$/.exec(s);
  if (!m) return s;
  let prefix = m[2].replace(/\.$/, "").trim();
  if (!PREFIX_RE.test(prefix) && !PREFIX_RE.test(`${prefix}.`)) return s;
  if (/^park$/i.test(prefix) || /^parc$/i.test(prefix)) prefix = "Parc";
  if (/^pl$/i.test(prefix)) prefix = "Pl.";
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${m[1]}`;
}

/* -------------------------------------------------------------------------- */
/*  Terrazas con licencia                                                      */
/* -------------------------------------------------------------------------- */

/** Una terraza autorizada por el Ajuntament (sin nombre del local: no viene en el conjunto). */
export interface LicensedTerrace {
  id: string;
  address: string;
  neighborhood: string;
  district: string;
  latitude: number;
  longitude: number;
  /** m² autorizados. */
  areaM2: number | null;
  tables: number | null;
  chairs: number | null;
  /** «Temporada» (no todo el año). */
  seasonal: boolean;
  /** En espacio privado de uso público (no en la acera). */
  privateSpace: boolean;
  /** Alguna mesa en la calzada (plazas de aparcamiento), no solo en la acera. */
  onRoadway: boolean;
}

/**
 * Filas del CSV `terrasses-comercos-vigents` (cabecera real del 2026_1S):
 * DATA_EXPLO;OCUPACIO;CODI_DISTRICTE;NOM_DISTRICTE;CODI_BARRI;NOM_BARRI;EMPLACAMENT;
 * SUPERFICIE_OCUPADA;TAULES;CADIRES;TAULES_VORERA;CADIRES_VORERA;TAULES_CALCADA;CADIRES_CALCADA;
 * ORDENACIO;VIGENCIA;X_ETRS89;Y_ETRS89;LATITUD;LONGITUD
 *
 * Varias licencias en el mismo punto (acera y calzada, o dos locales del mismo portal) se suman.
 */
export function parseTerraces(rows: CsvRow[]): LicensedTerrace[] {
  const byPoint = new Map<string, LicensedTerrace>();
  for (const r of rows) {
    const lat = toNumber(r.LATITUD);
    const lng = toNumber(r.LONGITUD);
    if (!inBarcelona(lat, lng)) continue;
    const address = titleCaseAddress(r.EMPLACAMENT ?? "");
    if (!address) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const t: LicensedTerrace = {
      id: `bcn-terrassa:${key}`,
      address,
      neighborhood: clean(r.NOM_BARRI),
      district: clean(r.NOM_DISTRICTE),
      latitude: r5(lat),
      longitude: r5(lng),
      areaM2: numOrNull(r.SUPERFICIE_OCUPADA),
      tables: numOrNull(r.TAULES),
      chairs: numOrNull(r.CADIRES),
      seasonal: /temporada/i.test(r.VIGENCIA ?? ""),
      privateSpace: /privat/i.test(r.OCUPACIO ?? ""),
      onRoadway: (numOrNull(r.TAULES_CALCADA) ?? 0) > 0,
    };
    const prev = byPoint.get(key);
    if (!prev) {
      byPoint.set(key, t);
      continue;
    }
    const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
    prev.areaM2 = sum(prev.areaM2, t.areaM2);
    prev.tables = sum(prev.tables, t.tables);
    prev.chairs = sum(prev.chairs, t.chairs);
    prev.seasonal = prev.seasonal && t.seasonal;
    prev.onRoadway = prev.onRoadway || t.onRoadway;
  }
  return [...byPoint.values()];
}

/** Forma compacta para guardar ~7.000 terrazas en localStorage sin repetir nombres de campo. */
export type PackedTerrace = [number, number, string, string, string, number | null, number | null, number | null, number];

export function packTerraces(list: LicensedTerrace[]): PackedTerrace[] {
  return list.map((t) => [
    t.latitude,
    t.longitude,
    t.address,
    t.neighborhood,
    t.district,
    t.areaM2,
    t.tables,
    t.chairs,
    (t.seasonal ? 1 : 0) | (t.privateSpace ? 2 : 0) | (t.onRoadway ? 4 : 0),
  ]);
}

export function unpackTerraces(packed: PackedTerrace[]): LicensedTerrace[] {
  return packed.map(([lat, lng, address, neighborhood, district, areaM2, tables, chairs, flags]) => ({
    id: `bcn-terrassa:${lat.toFixed(5)},${lng.toFixed(5)}`,
    address,
    neighborhood,
    district,
    latitude: lat,
    longitude: lng,
    areaM2,
    tables,
    chairs,
    seasonal: (flags & 1) !== 0,
    privateSpace: (flags & 2) !== 0,
    onRoadway: (flags & 4) !== 0,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Fuentes de agua de boca                                                    */
/* -------------------------------------------------------------------------- */

/** CSV `fonts` (2026_Fonts_beure.csv): CODI,NOM,CARRER,NUMERO_CARRER,…,NOM_BARRI,…,LATITUD,LONGITUD */
export function parseFountains(rows: CsvRow[]): SunPlace[] {
  const out: SunPlace[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const lat = toNumber(r.LATITUD);
    const lng = toNumber(r.LONGITUD);
    if (!inBarcelona(lat, lng)) continue;
    const code = clean(r.CODI) || `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(code)) continue;
    seen.add(code);
    const address = titleCaseAddress([clean(r.CARRER), clean(r.NUMERO_CARRER)].filter(Boolean).join(" "));
    const name = clean(r.NOM) || (address ? tr("datasets.fuente", { p0: address }) : tr("placeTypes.fuente"));
    out.push({
      id: `bcn:font:${code}`,
      name,
      type: "fountain",
      latitude: r5(lat),
      longitude: r5(lng),
      source: OPEN_DATA_SOURCE,
      metadata: { openData: "fonts", address, neighborhood: clean(r.NOM_BARRI) },
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Registros NP-NASIA (refugios, lavabos, miradores)                          */
/* -------------------------------------------------------------------------- */

/** Campos que se piden al datastore. Las coordenadas se llaman distinto según el conjunto. */
export const NASIA_FIELDS = [
  "register_id",
  "name",
  "institution_name",
  "addresses_road_name",
  "addresses_start_street_number",
  "addresses_neighborhood_name",
  "addresses_district_name",
] as const;

export interface NasiaRecord {
  register_id?: string;
  name?: string;
  institution_name?: string;
  addresses_road_name?: string;
  addresses_start_street_number?: string | number | null;
  addresses_neighborhood_name?: string;
  addresses_district_name?: string;
  geo_epgs_4326_lat?: string | number;
  geo_epgs_4326_lon?: string | number;
  geo_epgs_4326_x?: string | number;
  geo_epgs_4326_y?: string | number;
}

/** Latitud y longitud de un registro (`lat/lon` o `x/y`); null si no hay o caen fuera. */
export function nasiaPoint(r: NasiaRecord): { lat: number; lng: number } | null {
  let lat = toNumber(r.geo_epgs_4326_lat as string);
  let lng = toNumber(r.geo_epgs_4326_lon as string);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    lng = toNumber(r.geo_epgs_4326_x as string);
    lat = toNumber(r.geo_epgs_4326_y as string);
  }
  if (inBarcelona(lat, lng)) return { lat, lng };
  if (inBarcelona(lng, lat)) return { lat: lng, lng: lat };
  return null;
}

const nasiaId = (r: NasiaRecord) => clean(r.register_id).replace(/^﻿/, "");

function nasiaAddress(r: NasiaRecord): string {
  const n = r.addresses_start_street_number;
  return [clean(r.addresses_road_name), n === null || n === undefined ? "" : String(n).trim()]
    .filter(Boolean)
    .join(" ");
}

type NasiaKind = "climate_shelter" | "toilet" | "viewpoint";

function nasiaToPlace(r: NasiaRecord, type: NasiaKind, dataset: string, name: string): SunPlace | null {
  const p = nasiaPoint(r);
  const id = nasiaId(r);
  if (!p || !id) return null;
  return {
    id: `bcn:${dataset}:${id}`,
    name,
    type,
    latitude: r5(p.lat),
    longitude: r5(p.lng),
    source: OPEN_DATA_SOURCE,
    metadata: {
      openData: dataset,
      address: nasiaAddress(r),
      neighborhood: clean(r.addresses_neighborhood_name),
      district: clean(r.addresses_district_name),
    },
  };
}

/**
 * Refugios climáticos. El campo `name` a menudo es el tipo («Refugi climàtic», «Piscina Coberta»)
 * y el nombre propio está en `institution_name` («Seu del Districte de les Corts»).
 */
export function parseShelters(records: NasiaRecord[]): SunPlace[] {
  const out: SunPlace[] = [];
  for (const r of records) {
    const name = clean(r.name);
    const inst = clean(r.institution_name);
    const display = inst && inst !== name ? inst : name;
    if (!display) continue;
    const place = nasiaToPlace(r, "climate_shelter", "refugi", display);
    if (!place) continue;
    if (inst && name && inst !== name) place.metadata = { ...place.metadata, kind: name };
    out.push(place);
  }
  return out;
}

/** Lavabos públicos: «WC Públic *Mercat del Bon Pastor» → «WC Públic Mercat del Bon Pastor». */
export function parseToilets(records: NasiaRecord[]): SunPlace[] {
  const out: SunPlace[] = [];
  for (const r of records) {
    let name = clean((r.name ?? "").replace(/\*/g, ""));
    if (!name) continue;
    const address = nasiaAddress(r);
    if (/^wc p[úu]blic$/i.test(name) && address) name = `${name} · ${address}`;
    const place = nasiaToPlace(r, "toilet", "wc", name);
    if (place) out.push(place);
  }
  return out;
}

/** Miradores del Ajuntament («Mirador» a secas usa la institución: «Torre de Collserola»). */
export function parseViewpoints(records: NasiaRecord[]): SunPlace[] {
  const out: SunPlace[] = [];
  for (const r of records) {
    const name = clean(r.name);
    const inst = clean(r.institution_name);
    const display = /^mirador$/i.test(name) && inst ? tr("datasets.mirador", { p0: inst }) : name || inst;
    if (!display) continue;
    const place = nasiaToPlace(r, "viewpoint", "mirador", display);
    if (place) out.push(place);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Áreas de juego infantil                                                    */
/* -------------------------------------------------------------------------- */

/** Un grupo de elementos de juego (o un elemento suelto) antes de fusionarlos en áreas. */
export interface PlayGroup {
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Elementos de juego que contiene. */
  count: number;
  areaM2: number | null;
  ages: string[];
}

const AGE_ES: Record<string, string> = {
  "FINS A 5 ANYS": tr("datasets.0_5_anos"),
  "DE 6 A 12 ANYS": tr("datasets.6_12_anos"),
  "MAJORS DE 12 ANYS": tr("datasets.mas_de_12_anos"),
  MIXTA: tr("datasets.todas_las_edades"),
};

export function ageLabel(raw: string): string | null {
  const k = clean(raw).toUpperCase();
  return k ? (AGE_ES[k] ?? null) : null;
}

/** Une los grupos del mismo espacio a menos de `mergeM` (centro ponderado por nº de elementos). */
export function mergePlayGroups(groups: PlayGroup[], mergeM: number = C.playgroundMergeM): PlayGroup[] {
  const out: PlayGroup[] = [];
  const sorted = [...groups].sort((a, b) => b.count - a.count);
  for (const g of sorted) {
    const into = out.find(
      (o) => o.name === g.name && distanceMeters(o.lng, o.lat, g.lng, g.lat) <= mergeM
    );
    if (!into) {
      out.push({ ...g, ages: [...g.ages] });
      continue;
    }
    const n = into.count + g.count;
    into.lat = (into.lat * into.count + g.lat * g.count) / n;
    into.lng = (into.lng * into.count + g.lng * g.count) / n;
    into.count = n;
    into.areaM2 = into.areaM2 === null && g.areaM2 === null ? null : Math.max(into.areaM2 ?? 0, g.areaM2 ?? 0);
    for (const a of g.ages) if (!into.ages.includes(a)) into.ages.push(a);
  }
  return out;
}

export function playGroupsToPlaces(groups: PlayGroup[]): SunPlace[] {
  const out: SunPlace[] = [];
  for (const g of mergePlayGroups(groups)) {
    if (!inBarcelona(g.lat, g.lng)) continue;
    const name = g.name ? reorderSpaceName(g.name) : tr("placeTypes.area_de_juego");
    out.push({
      id: `bcn:joc:${g.lat.toFixed(4)},${g.lng.toFixed(4)}`,
      name,
      type: "playground",
      latitude: r5(g.lat),
      longitude: r5(g.lng),
      source: OPEN_DATA_SOURCE,
      metadata: {
        openData: "jocs",
        elements: g.count,
        ages: g.ages,
        neighborhood: g.neighborhood,
        ...(g.areaM2 !== null ? { playAreaM2: Math.round(g.areaM2) } : {}),
      },
    });
  }
  return out;
}

/** Filas agregadas por SQL (ver `PLAYGROUND_SQL`) → grupos. */
export interface PlaySqlRow {
  n?: string;
  b?: string;
  k?: string | number;
  lat?: string | number;
  lon?: string | number;
  m2?: string | number | null;
  e?: string | null;
}

export function playGroupsFromSql(rows: PlaySqlRow[]): PlayGroup[] {
  const out: PlayGroup[] = [];
  for (const r of rows) {
    const lat = toNumber(r.lat as string);
    const lng = toNumber(r.lon as string);
    if (!inBarcelona(lat, lng)) continue;
    const m2 = toNumber(r.m2 as string);
    out.push({
      name: clean(r.n),
      neighborhood: clean(r.b),
      lat,
      lng,
      count: Math.max(1, Math.round(toNumber(r.k as string)) || 1),
      areaM2: Number.isFinite(m2) ? m2 : null,
      ages: (r.e ?? "")
        .split("|")
        .map(ageLabel)
        .filter((a): a is string => a !== null),
    });
  }
  return out;
}

/** Registros sueltos del datastore (respaldo si la consulta SQL no está disponible). */
export interface PlayRecord {
  espai_verd_nom?: string;
  nom_barri?: string;
  latitud?: string | number;
  longitud?: string | number;
  area_joc_superficie_m2?: string | number;
  area_joc_tipus_edat_nom?: string;
}

export const PLAY_FIELDS = [
  "espai_verd_nom",
  "nom_barri",
  "latitud",
  "longitud",
  "area_joc_superficie_m2",
  "area_joc_tipus_edat_nom",
] as const;

export function playGroupsFromRecords(records: PlayRecord[]): PlayGroup[] {
  return playGroupsFromSql(
    records.map((r) => ({
      n: r.espai_verd_nom,
      b: r.nom_barri,
      k: 1,
      lat: r.latitud,
      lon: r.longitud,
      m2: r.area_joc_superficie_m2,
      e: r.area_joc_tipus_edat_nom ?? "",
    }))
  );
}

/**
 * Agrupa en el servidor por espacio verde y celda de ~110 m: ~870 filas (134 KB) en vez de ~4.000
 * elementos (1,3 MB). Las columnas numéricas del datastore no admiten comparar con '' (error 500):
 * por eso no hay WHERE ni NULLIF.
 */
export function playgroundSql(resourceId: string): string {
  const id = resourceId.replace(/[^a-z0-9-]/gi, "");
  return [
    "SELECT espai_verd_nom AS n, MAX(nom_barri) AS b, COUNT(*) AS k,",
    "AVG(CAST(latitud AS float)) AS lat, AVG(CAST(longitud AS float)) AS lon,",
    "MAX(CAST(area_joc_superficie_m2 AS float)) AS m2,",
    "STRING_AGG(DISTINCT area_joc_tipus_edat_nom, '|') AS e",
    `FROM "${id}"`,
    "GROUP BY espai_verd_codi, espai_verd_nom,",
    "ROUND(CAST(latitud AS numeric), 3), ROUND(CAST(longitud AS numeric), 3)",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Guardado compacto de lugares                                               */
/* -------------------------------------------------------------------------- */

export type PackedPlace = [string, string, string, number, number, Record<string, unknown> | null];

export function packPlaces(places: SunPlace[]): PackedPlace[] {
  return places.map((p) => [p.id, p.name, p.type, p.latitude, p.longitude, p.metadata ?? null]);
}

export function unpackPlaces(packed: PackedPlace[]): SunPlace[] {
  return packed.map(([id, name, type, latitude, longitude, metadata]) => ({
    id,
    name,
    type: type as SunPlace["type"],
    latitude,
    longitude,
    source: OPEN_DATA_SOURCE,
    ...(metadata ? { metadata } : {}),
  }));
}
