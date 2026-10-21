import { tr } from "../i18n";
import { getZoneParts, startOfZoneDay } from "../services/timeService";
import type { SunPlace } from "../types";
import { dayStartFor, hhmm, minutesOfDay, parseHHMM, zonedMs } from "./planningTime";

/**
 * Enlaces profundos: el estado que se comparte vive en la URL.
 *
 *   /mapa?hora=17:30&dia=2026-10-24&c=41.38720,2.16990&z=16   el mapa a una hora (y en un sitio)
 *   /lugar/placa-del-sol--w123456?hora=17:30&dia=2026-10-24     la ficha de un lugar
 *
 * El slug es legible (el nombre sin acentos) y termina en un identificador corto y estable:
 * n/w/r + id de OpenStreetMap, o p + coordenadas para un punto del mapa. Solo cuenta el
 * identificador: si el nombre cambia, el enlace sigue funcionando. Hora y día son de Barcelona.
 */

const DAY = 86_400_000;
/** La línea de tiempo llega hasta 6 días después de hoy. */
export const MAX_DAY_OFFSET = 6;

export interface PlaceLinkRef {
  /** Id del lugar en la app (`osm:way/123`, `point:41.38720,2.16990`). */
  id: string;
  /** Nombre legible que trae el slug (para un punto que no está en ningún inventario). */
  name: string;
  /** Solo para puntos del mapa. */
  point?: { lat: number; lng: number };
}

export interface MapViewLink {
  lat: number;
  lng: number;
  zoom?: number;
}

export interface DeepLink {
  place: PlaceLinkRef | null;
  time: number | null;
  view: MapViewLink | null;
}

/** «Plaça del Sol, Gràcia!» → «placa-del-sol-gracia». */
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "lugar";
}

const OSM_SHORT: Record<string, string> = { node: "n", way: "w", relation: "r" };
const SHORT_OSM: Record<string, string> = { n: "node", w: "way", r: "relation" };
const NUM = "-?\\d+(?:\\.\\d+)?";

/** Identificador corto y estable de un lugar, o null si no se puede enlazar. */
export function shortPlaceId(id: string): string | null {
  const osm = /^osm:(node|way|relation)\/(\d+)$/.exec(id);
  if (osm) return `${OSM_SHORT[osm[1]]}${osm[2]}`;
  const pt = new RegExp(`^point:(${NUM}),(${NUM})$`).exec(id);
  if (pt) return `p${pt[1]}_${pt[2]}`;
  return null;
}

/** Slug de la ficha de un lugar, o null si el lugar no se puede enlazar. */
export function placeSlug(place: Pick<SunPlace, "id" | "name">): string | null {
  const short = shortPlaceId(place.id);
  return short ? `${slugify(place.name)}--${short}` : null;
}

/** Lugar al que apunta un slug (`nombre--w123`), o null si no trae un identificador válido. */
export function parsePlaceSlug(slug: string): PlaceLinkRef | null {
  const i = slug.lastIndexOf("--");
  if (i < 0) return null;
  const short = slug.slice(i + 2);
  const words = slug.slice(0, i).replace(/-+/g, " ").trim();
  const name = words ? words[0].toUpperCase() + words.slice(1) : tr("nearbyCard.lugar");

  const osm = /^([nwr])(\d+)$/.exec(short);
  if (osm) return { id: `osm:${SHORT_OSM[osm[1]]}/${osm[2]}`, name };
  const pt = new RegExp(`^p(${NUM})_(${NUM})$`).exec(short);
  if (pt) {
    const lat = Number(pt[1]);
    const lng = Number(pt[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { id: `point:${lat.toFixed(5)},${lng.toFixed(5)}`, name, point: { lat, lng } };
  }
  return null;
}

/** «2026-10-24»: el día de Barcelona que contiene `ms`. */
export function dayParam(ms: number): string {
  const p = getZoneParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export const timeParams = (ms: number) => ({ hora: hhmm(minutesOfDay(ms)), dia: dayParam(ms) });

/** Instante de `hora` y `dia` (hora de Barcelona) si cae entre hoy y dentro de 6 días; si no, null. */
export function parseTimeParams(hora: string | null, dia: string | null, now: number): number | null {
  if (!hora) return null;
  const minutes = parseHHMM(hora);
  if (minutes == null) return null;
  let offset = 0;
  if (dia) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia.trim());
    if (!m) return null;
    const target = startOfZoneDay(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    offset = Math.round((target - startOfZoneDay(now)) / DAY);
  }
  if (offset < 0 || offset > MAX_DAY_OFFSET) return null;
  return zonedMs(dayStartFor(now, offset), minutes);
}

/** `c=41.38720,2.16990` y `z=16` → centro y zoom del mapa. */
export function parseMapView(c: string | null, z: string | null): MapViewLink | null {
  if (!c) return null;
  const m = new RegExp(`^(${NUM}),(${NUM})$`).exec(c.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const zn = z != null && z.trim() !== "" ? Number(z) : NaN;
  return Number.isFinite(zn) ? { lat, lng, zoom: Math.min(19, Math.max(10, zn)) } : { lat, lng };
}

/** Lo que trae la URL al abrir la app. */
export function readDeepLink(pathname: string, search: string, now: number): DeepLink {
  const q = new URLSearchParams(search);
  const m = /\/lugar\/([^/?#]+)\/?$/.exec(pathname);
  let slug: string | null = null;
  if (m) {
    try {
      slug = decodeURIComponent(m[1]);
    } catch {
      slug = m[1];
    }
  }
  return {
    place: slug ? parsePlaceSlug(slug) : null,
    time: parseTimeParams(q.get("hora"), q.get("dia"), now),
    view: parseMapView(q.get("c"), q.get("z")),
  };
}

/**
 * Query con la hora elegida (`null` = «ahora», sin hora) conservando el resto de parámetros que ya
 * hubiera, p. ej. `?debug=weather`. Se dejan legibles `:` y `,`.
 */
export function withTimeQuery(search: string, time: number | null): string {
  const q = new URLSearchParams(search);
  q.delete("hora");
  q.delete("dia");
  if (time != null) {
    const t = timeParams(time);
    q.set("hora", t.hora);
    q.set("dia", t.dia);
  }
  const s = q.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return s ? `?${s}` : "";
}
