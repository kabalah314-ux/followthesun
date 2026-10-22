import { fetchWithTimeout } from "../../lib/net";
import { bearingDeg, distanceM, isVenueTarget, scoreStreet } from "./scoring";
import type { MediaFetchOptions, MediaItem, MediaTarget } from "./types";

/**
 * Mapillary (opcional): fotos de calle y 360° con licencia CC BY-SA 4.0. Necesita el token de una
 * app registrada (`VITE_MAPILLARY_TOKEN`); sin él no se llama nunca. Sus condiciones piden mostrar
 * el logo de Mapillary y enlazar a la imagen, y limitan el uso comercial (sección 12): no activarlo
 * sin confirmar que el uso encaja (ver «Riesgos» en la guía maestra 2).
 */

const API = "https://graph.mapillary.com/images";
const FIELDS = [
  "id",
  "captured_at",
  "compass_angle",
  "computed_compass_angle",
  "geometry",
  "computed_geometry",
  "is_pano",
  "thumb_256_url",
  "thumb_1024_url",
  "thumb_2048_url",
  "creator",
].join(",");

interface MlyImage {
  id: string;
  captured_at?: number;
  compass_angle?: number;
  computed_compass_angle?: number;
  geometry?: { coordinates?: number[] };
  computed_geometry?: { coordinates?: number[] };
  is_pano?: boolean;
  thumb_256_url?: string;
  thumb_1024_url?: string;
  thumb_2048_url?: string;
  creator?: { username?: string };
}

const DEG = Math.PI / 180;

export async function mapillaryImages(target: MediaTarget, token: string, opts: MediaFetchOptions = {}): Promise<MediaItem[]> {
  if (!token) return [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lat = target.latitude;
  const lon = target.longitude;
  // La API exige cajas de menos de 0,01° de lado.
  const padM = isVenueTarget(target) ? 50 : 90;
  const dLat = padM / 111_194;
  const dLon = padM / (111_320 * Math.cos(lat * DEG));
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(6)).join(",");
  const url = `${API}?access_token=${encodeURIComponent(token)}&fields=${FIELDS}&bbox=${bbox}&limit=100`;

  const res = await fetchWithTimeout(url, {}, opts.timeoutMs ?? 8000, fetchImpl);
  const data = ((await res.json()) as { data?: MlyImage[] }).data ?? [];

  const out: MediaItem[] = [];
  for (const img of data) {
    const [ilon, ilat] = img.computed_geometry?.coordinates ?? img.geometry?.coordinates ?? [];
    if (!Number.isFinite(ilon) || !Number.isFinite(ilat) || !img.id) continue;
    const is360 = img.is_pano === true;
    const heading = img.computed_compass_angle ?? img.compass_angle;
    const dist = distanceM(ilat, ilon, lat, lon);
    const date = typeof img.captured_at === "number" ? new Date(img.captured_at).toISOString() : undefined;
    const score = scoreStreet(
      {
        distanceM: dist,
        heading,
        bearingToPlace: bearingDeg(ilat, ilon, lat, lon),
        is360,
        year: date ? Number(date.slice(0, 4)) : undefined,
      },
      target
    );
    if (score === null) continue;
    const display = is360 ? (img.thumb_2048_url ?? img.thumb_1024_url) : (img.thumb_1024_url ?? img.thumb_2048_url);
    if (!display) continue;
    out.push({
      id: `mapillary:${img.id}`,
      kind: is360 ? "pano" : "photo",
      provider: "mapillary",
      url: display,
      thumbUrl: img.thumb_256_url ?? display,
      fullUrl: img.thumb_2048_url,
      author: img.creator?.username ?? "Mapillary",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      sourceUrl: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(img.id)}`,
      capturedAt: date,
      distanceM: Math.round(dist),
      heading,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
