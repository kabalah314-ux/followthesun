import type { SolarPosition } from "../types";
import { DEG } from "./coordinates";

/**
 * Astronomía solar pura (algoritmo tipo SunCalc / NOAA). Sin dependencias de React ni del mapa.
 *
 * Convenciones: azimut en radianes desde el norte hacia el este (brújula),
 * altitud en radianes sobre el horizonte.
 */

const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const E = DEG * 23.4397;
const J0 = 0.0009;

/** Umbral de "sol visible" (coherente con la definición de orto/ocaso: −0,833°). */
export const SUN_UP_RAD = -0.5 * DEG;

const toJulian = (ms: number) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * DAY_MS;
const toDays = (ms: number) => toJulian(ms) - J2000;

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const siderealTime = (d: number, lw: number) => DEG * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => DEG * (357.5291 + 0.98560028 * d);

const eclipticLongitude = (M: number) => {
  const C = DEG * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = DEG * 102.9372;
  return M + C + P + Math.PI;
};

const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

/** Alias histórico: el tipo vive centralizado en `types.ts` como `SolarPosition`. */
export type SunPosition = SolarPosition;

export interface SunTimes {
  sunrise: number;
  sunset: number;
  solarNoon: number;
  goldenMorningEnd: number;
  goldenEveningStart: number;
}

export interface TrajectoryPoint {
  time: number;
  azimuth: number;
  altitude: number;
}

export function getSunPosition(ms: number, lat: number, lng: number): SunPosition {
  const lw = DEG * -lng;
  const phi = DEG * lat;
  const d = toDays(ms);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;

  let az =
    Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  az = ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

  return { azimuth: az, altitude: alt, azimuthDeg: az / DEG, altitudeDeg: alt / DEG };
}

export function getSunTimes(dayStartMs: number, lat: number, lng: number): SunTimes {
  const noon = dayStartMs + 12 * 3_600_000;
  const lw = DEG * -lng;
  const phi = DEG * lat;
  const d = toDays(noon);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const setFor = (h: number) => {
    const w = hourAngle(h, phi, dec);
    const a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
  };

  const Jset = setFor(-0.833 * DEG);
  const Jrise = Jnoon - (Jset - Jnoon);
  const JgoldenEve = setFor(6 * DEG);
  const JgoldenMorn = Jnoon - (JgoldenEve - Jnoon);

  return {
    sunrise: fromJulian(Jrise),
    sunset: fromJulian(Jset),
    solarNoon: fromJulian(Jnoon),
    goldenMorningEnd: fromJulian(JgoldenMorn),
    goldenEveningStart: fromJulian(JgoldenEve),
  };
}

export function getSunTrajectory(
  dayStartMs: number,
  lat: number,
  lng: number,
  stepMinutes = 10
): TrajectoryPoint[] {
  const times = getSunTimes(dayStartMs, lat, lng);
  const out: TrajectoryPoint[] = [];
  const step = stepMinutes * 60_000;
  for (let t = times.sunrise; t <= times.sunset; t += step) {
    const p = getSunPosition(t, lat, lng);
    out.push({ time: t, azimuth: p.azimuth, altitude: p.altitude });
  }
  const last = getSunPosition(times.sunset, lat, lng);
  out.push({ time: times.sunset, azimuth: last.azimuth, altitude: last.altitude });
  return out;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
export const compassLabel = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
