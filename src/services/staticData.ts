import { fetchWithTimeout } from "../lib/net";
import type { GeoBounds, SunPlace } from "../types";
import type { PackedPlace, PackedTerrace } from "./openData/datasets";

/**
 * Datos precalculados servidos desde el propio origen (`public/data/*.json`).
 *
 * Los genera cada semana `scripts/etl/build-inventory.ts` en GitHub Actions (allí no hay prisa:
 * timeouts largos, reintentos y varios servidores). La app los pide primero porque llegan en
 * milisegundos desde la CDN; solo si faltan o tienen más de `STATIC_MAX_AGE_MS` recurre a Overpass
 * y a Open Data BCN en vivo. Atribuciones: © OpenStreetMap contributors (ODbL) y Ajuntament de
 * Barcelona · Open Data BCN (CC BY 4.0).
 */

export const STATIC_DATA_VERSION = 1;
/** Pasado este tiempo, mejor intentar datos en vivo (y el fichero queda como respaldo). */
export const STATIC_MAX_AGE_MS = 21 * 24 * 3_600_000;

export interface StaticSource {
  name: string;
  license: string;
  url: string;
}

interface Envelope<K extends string> {
  v: number;
  kind: K;
  /** ISO 8601, momento de la generación. */
  generatedAt: string;
  sources: StaticSource[];
}

export interface StaticPlacesFile extends Envelope<"places"> {
  bbox: GeoBounds;
  places: SunPlace[];
}

/** Elemento de OSM reducido a lo que usa `ovToVenue`: [«tipo/id», lat, lon, etiquetas]. */
export type PackedVenue = [string, number, number, Record<string, string>];

export interface StaticVenuesFile extends Envelope<"venues"> {
  bbox: GeoBounds;
  venues: PackedVenue[];
}

export interface StaticSection<T> {
  fetchedAt: string;
  items: T[];
}

export type OpenDataSectionKey = "terraces" | "fountains" | "shelters" | "toilets" | "viewpoints" | "playgrounds";

export interface StaticOpenDataFile extends Envelope<"opendata"> {
  sections: Partial<Record<"terraces", StaticSection<PackedTerrace>>> &
    Partial<Record<Exclude<OpenDataSectionKey, "terraces">, StaticSection<PackedPlace>>>;
}

export type StaticKind = "places" | "venues" | "opendata";
type FileOf<K extends StaticKind> = K extends "places"
  ? StaticPlacesFile
  : K extends "venues"
    ? StaticVenuesFile
    : StaticOpenDataFile;

/** Momento de generación en ms, o NaN si el fichero no lo trae bien. */
export function generatedAtMs(file: { generatedAt?: string } | null | undefined): number {
  return file?.generatedAt ? Date.parse(file.generatedAt) : NaN;
}

/** Valida un fichero precalculado. `null` si no sirve (versión, tipo o forma distintos). */
export function acceptStatic<K extends StaticKind>(json: unknown, kind: K): FileOf<K> | null {
  if (!json || typeof json !== "object") return null;
  const f = json as Partial<Envelope<string>> & Record<string, unknown>;
  if (f.v !== STATIC_DATA_VERSION || f.kind !== kind || !Number.isFinite(generatedAtMs(f as { generatedAt?: string }))) return null;
  if (kind === "places" && !Array.isArray(f.places)) return null;
  if (kind === "venues" && !Array.isArray(f.venues)) return null;
  if (kind === "opendata" && (!f.sections || typeof f.sections !== "object")) return null;
  return json as FileOf<K>;
}

/** ¿Es lo bastante reciente como para usarlo sin consultar las fuentes en vivo? */
export function isFreshStatic(file: { generatedAt?: string } | null | undefined, now = Date.now(), maxAgeMs = STATIC_MAX_AGE_MS): boolean {
  const t = generatedAtMs(file);
  return Number.isFinite(t) && now - t >= -3_600_000 && now - t <= maxAgeMs;
}

const inflight = new Map<StaticKind, Promise<unknown>>();

function baseUrl(): string {
  try {
    return import.meta.env?.BASE_URL ?? "/";
  } catch {
    return "/";
  }
}

/**
 * El fichero precalculado (validado, sin mirar su edad), o `null` si no existe o no se puede leer.
 * Una sola petición por sesión y fichero.
 */
export function loadStatic<K extends StaticKind>(kind: K): Promise<FileOf<K> | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  let p = inflight.get(kind) as Promise<FileOf<K> | null> | undefined;
  if (!p) {
    p = fetchWithTimeout(`${baseUrl()}data/${kind}.json`, {}, 8000)
      .then((res) => res.json() as Promise<unknown>)
      .then((json) => acceptStatic(json, kind))
      .catch(() => null);
    inflight.set(kind, p);
  }
  return p;
}
