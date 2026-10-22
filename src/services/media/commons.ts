import { fetchWithTimeout } from "../../lib/net";
import { isVenueTarget, prettyLicense, scoreCommons, yearOf } from "./scoring";
import type { MediaFetchOptions, MediaItem, MediaTarget } from "./types";

/**
 * Wikimedia Commons: fotos geolocalizadas cerca del lugar (API pública, sin clave, CORS con
 * `origin=*`). Dos peticiones: `geosearch` (ficheros en un radio) e `imageinfo` (URL, tamaño,
 * autor y licencia). Cada foto lleva su propia licencia; se atribuye autor + licencia + enlace.
 */

const API = "https://commons.wikimedia.org/w/api.php";

interface GeoHit {
  title: string;
  dist: number;
}

interface ImageInfo {
  url: string;
  descriptionurl: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width: number;
  height: number;
  mime: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

const stripHtml = (s?: string) =>
  (s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** URL de miniatura de Commons a otro ancho («…/1280px-Nombre.jpg» → «…/400px-Nombre.jpg»). */
export const commonsThumb = (url: string, width: number) => url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);

function isoDate(raw?: string): string | undefined {
  const m = /(\d{4})[-:](\d{2})[-:](\d{2})/.exec(stripHtml(raw));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

export async function commonsPhotos(target: MediaTarget, opts: MediaFetchOptions = {}): Promise<MediaItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 8000;
  const venue = isVenueTarget(target);
  const radius = Math.round(Math.min(1000, Math.max(venue ? 60 : 200, target.radiusM ?? 0)));

  const q1 = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "geosearch",
    gscoord: `${target.latitude}|${target.longitude}`,
    gsradius: String(radius),
    gslimit: "40",
    gsnamespace: "6",
  });
  const r1 = await fetchWithTimeout(`${API}?${q1}`, {}, timeout, fetchImpl);
  const hits = ((await r1.json()) as { query?: { geosearch?: GeoHit[] } }).query?.geosearch ?? [];
  if (hits.length === 0) return [];

  const q2 = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
    iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|Categories|ObjectName",
    titles: hits.slice(0, 40).map((h) => h.title).join("|"),
  });
  const r2 = await fetchWithTimeout(`${API}?${q2}`, {}, timeout, fetchImpl);
  const pages = Object.values(
    ((await r2.json()) as { query?: { pages?: Record<string, { title: string; imageinfo?: ImageInfo[] }> } }).query?.pages ?? {}
  );

  const distBy = new Map(hits.map((h) => [h.title, h.dist]));
  const out: MediaItem[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) continue;
    const meta = ii.extmetadata ?? {};
    const categories = stripHtml(meta.Categories?.value).replace(/\|/g, " ");
    const date = isoDate(meta.DateTimeOriginal?.value);
    // El año de la toma; si no consta, el que lleve el título («Plaça Reial 1910»).
    const year = yearOf(stripHtml(meta.DateTimeOriginal?.value)) ?? yearOf(p.title);
    const dist = distBy.get(p.title) ?? radius;
    const score = scoreCommons(
      { title: p.title, categories, distanceM: dist, width: ii.width, height: ii.height, year },
      target
    );
    if (score === null) continue;
    const display = ii.thumburl ?? ii.url;
    const name = p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
    out.push({
      id: `commons:${p.title}`,
      kind: "photo",
      provider: "commons",
      url: display,
      thumbUrl: commonsThumb(display, 400),
      fullUrl: ii.url,
      width: ii.thumbwidth ?? ii.width,
      height: ii.thumbheight ?? ii.height,
      title: stripHtml(meta.ObjectName?.value) || name,
      author: stripHtml(meta.Artist?.value) || "Wikimedia Commons",
      license: prettyLicense(stripHtml(meta.LicenseShortName?.value)),
      licenseUrl: meta.LicenseUrl?.value || undefined,
      sourceUrl: ii.descriptionurl,
      capturedAt: date,
      distanceM: Math.round(dist),
      // Commons es la fuente preferida para fotos de un lugar con nombre.
      score: score + 1,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
