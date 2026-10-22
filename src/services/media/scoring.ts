import type { MediaItem, MediaTarget } from "./types";

/**
 * Reglas puras para elegir la mejor imagen de un lugar: cerca, mirando al sitio, reciente, de día y
 * sin personas en primer plano ni interiores. Ver «Ficha de lugar inmersiva» en la guía maestra 2.
 */

const DEG = Math.PI / 180;
const R = 6_371_000;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de A a B en grados (0 = norte, 90 = este). */
export function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const φ1 = fromLat * DEG;
  const φ2 = toLat * DEG;
  const Δλ = (toLon - fromLon) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Diferencia angular mínima entre dos rumbos (0–180°). */
export function angleDiffDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/** Tipos de lugar que son un local: la foto tiene que ser de ese local, no de la calle. */
const VENUE_TYPES = new Set(["terrace", "venue", "cafe", "bar", "restaurant", "pub", "ice_cream", "biergarten"]);
export const isVenueTarget = (t: MediaTarget) => VENUE_TYPES.has(String(t.type ?? ""));

const STOP = new Set([
  "del", "dels", "les", "los", "las", "els", "the", "and", "per", "por", "con", "amb",
  "bar", "cafe", "cafeteria", "restaurant", "restaurante", "pub", "terrassa", "terraza",
  "placa", "plaza", "parc", "parque", "jardi", "jardin", "jardins", "jardines", "platja", "playa",
  "carrer", "calle", "avinguda", "avenida", "passeig", "paseo", "barcelona", "mirador",
]);

export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras con significado del nombre de un lugar (sin artículos ni «plaza», «parque», «bar»…). */
export function nameTokens(name?: string): string[] {
  if (!name) return [];
  const words = normalizeText(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return [...new Set(words)];
}

/** Fracción de las palabras del nombre que aparecen en el texto (0–1). */
export function nameMatch(text: string, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  const t = normalizeText(text);
  let hit = 0;
  for (const w of tokens) if (t.includes(w)) hit++;
  return hit / tokens.length;
}

/** Interiores, retratos, actos, documentos y archivos históricos: no enseñan cómo es el sitio hoy. */
const UNWANTED =
  /\b(interior|inside|indoors?|dins|dentro|afcec|retrat|retrato|portrait|selfie|wedding|boda|casament|concert|concierto|manifestaci|protest|photo ?shoot|museu|museo|exposici|exhibition|escut|escudo|logo|mapa|plano|document)/;
export const looksUnwanted = (text: string) => UNWANTED.test(normalizeText(text));

/** Primer año plausible (1850–2099) de un texto, como número suelto (no dentro de otro número). */
export function yearOf(text?: string): number | undefined {
  // Sin «lookbehind»: Safari anterior a 16.4 no lo entiende y rompería el módulo entero.
  const m = /(^|\D)(18[5-9]\d|19\d{2}|20\d{2})(?!\d)/.exec(text ?? "");
  return m ? Number(m[2]) : undefined;
}

export interface CommonsCandidate {
  title: string;
  /** Categorías de Commons, separadas por espacios. */
  categories: string;
  distanceM: number;
  width?: number;
  height?: number;
  year?: number;
}

/** `null` = se descarta. */
export function scoreCommons(c: CommonsCandidate, target: MediaTarget): number | null {
  const text = `${c.title} ${c.categories}`;
  if (looksUnwanted(text)) return null;
  if (c.year !== undefined && c.year < 1990) return null;
  const match = nameMatch(text, nameTokens(target.name));
  const venue = isVenueTarget(target);
  if (venue && match < 0.5) return null;
  const near = Math.max(100, target.radiusM ?? 0);
  if (!venue && match === 0 && c.distanceM > near) return null;
  let s = 1 + match * 4 - c.distanceM / 60;
  if (c.width && c.height) s += c.width >= c.height ? 1 : -1.5;
  if (c.width !== undefined && c.width < 800) s -= 2;
  if (c.year !== undefined && c.year >= 2015) s += 1;
  return s;
}

export interface StreetCandidate {
  distanceM: number;
  /** Rumbo de la cámara (si no es 360°). */
  heading?: number;
  /** Rumbo de la cámara al lugar. */
  bearingToPlace: number;
  is360: boolean;
  year?: number;
}

/** Fotos de calle (Panoramax, Mapillary): cerca y mirando al sitio. `null` = se descarta. */
export function scoreStreet(c: StreetCandidate, target: MediaTarget): number | null {
  const venue = isVenueTarget(target);
  const maxDist = c.is360 ? 40 : venue ? 45 : Math.max(90, target.radiusM ?? 0);
  if (c.distanceM > maxDist) return null;
  let s = -c.distanceM / 20;
  if (!c.is360) {
    if (c.heading === undefined) return null;
    const off = angleDiffDeg(c.heading, c.bearingToPlace);
    // Dentro del propio lugar (a pocos metros) cualquier dirección vale.
    if (c.distanceM > 8 && off > 35) return null;
    s -= off / 30;
  }
  if (c.year !== undefined) s += c.year >= 2022 ? 1 : c.year < 2016 ? -1 : 0;
  return s;
}

/** «CC-BY-SA-4.0», «cc by-sa 4.0»… → «CC BY-SA 4.0». Lo que no es Creative Commons se deja igual. */
export function prettyLicense(raw?: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^cc0/i.test(s)) return "CC0";
  const m = /^cc[\s_-]*(by(?:[\s_-]*(?:sa|nd|nc))*)[\s_-]*(\d\.\d)?/i.exec(s);
  if (m) {
    const kind = m[1].toUpperCase().replace(/[\s_-]+/g, "-");
    return `CC ${kind}${m[2] ? ` ${m[2]}` : ""}`;
  }
  if (/^etalab/i.test(s)) return "Licence Ouverte 2.0";
  return s;
}

const SOURCE_LABEL: Record<MediaItem["provider"], string> = {
  commons: "Wikimedia Commons",
  panoramax: "Panoramax",
  mapillary: "Mapillary",
};

/** Línea de atribución para poner sobre la imagen: «© autor · licencia · fuente». */
export function attributionLabel(item: Pick<MediaItem, "author" | "license" | "provider">): string {
  return [item.author ? `© ${item.author}` : null, item.license || null, SOURCE_LABEL[item.provider]]
    .filter(Boolean)
    .join(" · ");
}

/** Quita imágenes repetidas (mismo id o misma URL) conservando la primera. */
export function dedupeMedia(list: readonly MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const m of list) {
    if (seen.has(m.id) || seen.has(m.url)) continue;
    seen.add(m.id);
    seen.add(m.url);
    out.push(m);
  }
  return out;
}
