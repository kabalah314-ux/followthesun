import { DEG } from "./coordinates";
import type { LngLatPair } from "./terraceShape";

/**
 * Ruta por la sombra o por el sol (guía maestra 2, utilidad 19): muestras cada pocos metros a lo
 * largo de una ruta a pie, el resumen por distancia de lo que va a la sombra y los tramos para
 * dibujarla. Sin dependencias de red ni del mapa.
 */

/** Radio medio de la Tierra (el mismo que usa `distanceMeters`). */
const EARTH_R = 6371008.8;

export interface RouteSample {
  lng: number;
  lat: number;
  /** Metros desde el inicio de la ruta. */
  distM: number;
}

export function segLen(a: LngLatPair, b: LngLatPair): number {
  const kx = DEG * EARTH_R * Math.cos(((a[1] + b[1]) / 2) * DEG);
  const ky = DEG * EARTH_R;
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
}

export function lineLength(coords: readonly LngLatPair[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += segLen(coords[i - 1], coords[i]);
  return d;
}

/** Puntos cada `spacingM` metros a lo largo de la línea, con el inicio y el final. */
export function sampleLine(coords: readonly LngLatPair[], spacingM = 15): RouteSample[] {
  if (coords.length === 0) return [];
  const out: RouteSample[] = [{ lng: coords[0][0], lat: coords[0][1], distM: 0 }];
  let walked = 0;
  let next = spacingM;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = segLen(a, b);
    while (len > 0 && next <= walked + len) {
      const t = (next - walked) / len;
      out.push({ lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, distM: next });
      next += spacingM;
    }
    walked += len;
  }
  const last = coords[coords.length - 1];
  if (walked - out[out.length - 1].distM > 0.5) out.push({ lng: last[0], lat: last[1], distM: walked });
  return out;
}

export interface RouteShadeSummary {
  totalM: number;
  shadedM: number;
  /** 0–100, por distancia. */
  shadePct: number;
}

/** El tramo entre una muestra y la siguiente tiene el estado de la primera. */
export function summarizeShade(samples: readonly RouteSample[], shaded: readonly boolean[]): RouteShadeSummary {
  let total = 0;
  let shade = 0;
  for (let i = 0; i + 1 < samples.length; i++) {
    const d = samples[i + 1].distM - samples[i].distM;
    total += d;
    if (shaded[i]) shade += d;
  }
  return { totalM: total, shadedM: shade, shadePct: total > 0 ? Math.round((shade / total) * 100) : 0 };
}

/** Tramos seguidos con el mismo estado, como líneas para dibujar. */
export function shadeSegments(samples: readonly RouteSample[], shaded: readonly boolean[]): Array<{ coords: LngLatPair[]; shaded: boolean }> {
  const out: Array<{ coords: LngLatPair[]; shaded: boolean }> = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a: LngLatPair = [samples[i].lng, samples[i].lat];
    const b: LngLatPair = [samples[i + 1].lng, samples[i + 1].lat];
    const last = out[out.length - 1];
    if (last && last.shaded === shaded[i]) last.coords.push(b);
    else out.push({ coords: [a, b], shaded: shaded[i] });
  }
  return out;
}

/** Hasta `n` puntos intermedios repartidos por la ruta (para que Google Maps la siga). */
export function routeWaypoints(coords: readonly LngLatPair[], n = 2): LngLatPair[] {
  const total = lineLength(coords);
  if (total <= 0 || n <= 0) return [];
  const samples = sampleLine(coords, total / (n + 1));
  return samples.slice(1, n + 1).map((s) => [s.lng, s.lat]);
}
