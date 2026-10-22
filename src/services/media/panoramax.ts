import { fetchWithTimeout } from "../../lib/net";
import { bearingDeg, distanceM, isVenueTarget, prettyLicense, scoreStreet, yearOf } from "./scoring";
import type { MediaFetchOptions, MediaItem, MediaTarget } from "./types";

/**
 * Panoramax: fotos de calle libres (federación de instancias; en España, OpenStreetMap España).
 * API STAC pública, sin clave, con CORS. Licencia habitual CC BY-SA 4.0: autor + licencia + enlace.
 * En Barcelona la cobertura es escasa (octubre de 2026), así que es un complemento de Commons.
 */

const API = "https://api.panoramax.xyz/api/search";

interface PxFeature {
  id: string;
  geometry?: { coordinates?: number[] };
  properties?: Record<string, unknown>;
  assets?: Record<string, { href?: string } | undefined>;
  providers?: Array<{ name?: string; roles?: string[] }>;
  links?: Array<{ rel?: string; href?: string }>;
}

const DEG = Math.PI / 180;

export async function panoramaxImages(target: MediaTarget, opts: MediaFetchOptions = {}): Promise<MediaItem[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lat = target.latitude;
  const lon = target.longitude;
  const padM = isVenueTarget(target) ? 60 : Math.max(100, target.radiusM ?? 0);
  const dLat = padM / 111_194;
  const dLon = padM / (111_320 * Math.cos(lat * DEG));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(6)).join(",");

  const res = await fetchWithTimeout(`${API}?bbox=${bbox}&limit=100`, {}, opts.timeoutMs ?? 8000, fetchImpl);
  const features = ((await res.json()) as { features?: PxFeature[] }).features ?? [];

  const out: MediaItem[] = [];
  for (const f of features) {
    const [flon, flat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(flon) || !Number.isFinite(flat) || !f.id) continue;
    const props = f.properties ?? {};
    const orientation = props["pers:interior_orientation"] as { field_of_view?: number } | undefined;
    const is360 = orientation?.field_of_view === 360;
    const az = Number(props["view:azimuth"]);
    const heading = Number.isFinite(az) ? az : undefined;
    const dist = distanceM(flat, flon, lat, lon);
    const capturedAt = typeof props.datetime === "string" ? props.datetime : undefined;
    const score = scoreStreet(
      { distanceM: dist, heading, bearingToPlace: bearingDeg(flat, flon, lat, lon), is360, year: yearOf(capturedAt) },
      target
    );
    if (score === null) continue;
    const sd = f.assets?.sd?.href;
    const hd = f.assets?.hd?.href;
    const thumb = f.assets?.thumb?.href;
    const url = is360 ? (hd ?? sd) : (sd ?? hd);
    if (!url) continue;
    const people = (f.providers ?? []).map((p) => p.name?.trim()).filter((n): n is string => Boolean(n));
    out.push({
      id: `panoramax:${f.id}`,
      kind: is360 ? "pano" : "photo",
      provider: "panoramax",
      url,
      thumbUrl: thumb ?? sd ?? url,
      fullUrl: hd,
      author: people[people.length - 1] ?? "Panoramax",
      license: prettyLicense(typeof props.license === "string" ? props.license : "CC-BY-SA-4.0"),
      licenseUrl: f.links?.find((l) => l.rel === "license")?.href,
      sourceUrl: `https://api.panoramax.xyz/#focus=pic&pic=${encodeURIComponent(f.id)}`,
      capturedAt,
      distanceM: Math.round(dist),
      heading,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
