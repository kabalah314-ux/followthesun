import { DEG, lngToMx, latToMy, metersPerMercatorUnit, pointInPolygon } from "../lib/coordinates";
import type { ShadowResult, SolarPosition } from "../types";
import { buildingsCover, type BuildingSet } from "./buildingService";
import { terrainService } from "./terrainService";

/**
 * shadowService — SOLO geometría de sombras (edificios y relieve). No sabe nada de nubes.
 *
 * Modelo: cada edificio es un prisma (huella + altura). Su sombra es el barrido de la huella
 * a lo largo del vector solar inverso: L = h / tan(altitud). El techo de cada edificio queda iluminado.
 *
 *  · `ShadowLayer` (engine/layers) dibuja las sombras sobre el mapa con estos mismos parámetros.
 *  · Aquí vive lo que no depende del dibujo: sombra en un punto concreto.
 *  · La combinación con las nubes ocurre en `sunlightService`, nunca aquí.
 */

/** Altitud mínima con la que se proyecta sombra (evita sombras infinitas al amanecer). */
export const SHADOW_MIN_ALTITUDE = 4.5 * DEG;
/** Longitud máxima de una sombra dibujada (m). */
export const SHADOW_MAX_LENGTH_M = 380;

/** Margen de seguridad (rad) sobre el horizonte natural para considerar el sol visible. */
const HORIZON_MARGIN = 0.003;

/* -------------------------------------------------------------------------- */
/*  Test de sombra urbana en un punto                                          */
/* -------------------------------------------------------------------------- */

interface Candidate {
  xs: Float64Array;
  ys: Float64Array;
  h: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  inside: boolean;
}

export interface ShadeTester {
  /** Altura (m) del edificio en cuya huella cae el punto; 0 si está en la calle o en un parque. */
  ownHeight: number;
  candidates: number;
  isShaded(azimuth: number, altitude: number): boolean;
}

export function createShadeTester(
  set: BuildingSet,
  lng: number,
  lat: number,
  radiusM = 420
): ShadeTester {
  const px = lngToMx(lng);
  const py = latToMy(lat);
  const mpu = metersPerMercatorUnit(lat);
  const r = radiusM / mpu;
  const cands: Candidate[] = [];
  let own = 0;

  for (let i = 0; i < set.count; i++) {
    const bi = 4 * i;
    if (
      set.bbox[bi + 2] < px - r ||
      set.bbox[bi] > px + r ||
      set.bbox[bi + 3] < py - r ||
      set.bbox[bi + 1] > py + r
    )
      continue;
    const o = set.offsets[i];
    const n = set.offsets[i + 1] - o;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      xs[k] = (set.coords[2 * (o + k)] - px) * mpu;
      ys[k] = (set.coords[2 * (o + k) + 1] - py) * mpu;
    }
    const c: Candidate = {
      xs,
      ys,
      h: set.heights[i],
      minX: (set.bbox[bi] - px) * mpu,
      minY: (set.bbox[bi + 1] - py) * mpu,
      maxX: (set.bbox[bi + 2] - px) * mpu,
      maxY: (set.bbox[bi + 3] - py) * mpu,
      inside: false,
    };
    if (c.minX <= 0 && c.maxX >= 0 && c.minY <= 0 && c.maxY >= 0 && pointInPolygon(0, 0, xs, ys)) {
      c.inside = true;
      own = Math.max(own, c.h);
    }
    cands.push(c);
  }

  const others = cands.filter((c) => !c.inside);

  return {
    ownHeight: own,
    candidates: others.length,
    isShaded(azimuth, altitude) {
      const sx = Math.sin(azimuth);
      const sy = -Math.cos(azimuth);
      const tanA = Math.tan(Math.max(altitude, 0.5 * DEG));
      for (let ci = 0; ci < others.length; ci++) {
        const c = others[ci];
        const he = c.h - own;
        if (he <= 0) continue;
        const maxD = Math.min(radiusM, he / tanA);
        const ex = sx * maxD;
        const ey = sy * maxD;
        if (
          Math.max(0, ex) < c.minX ||
          Math.min(0, ex) > c.maxX ||
          Math.max(0, ey) < c.minY ||
          Math.min(0, ey) > c.maxY
        )
          continue;
        const n = c.xs.length;
        for (let k = 0; k < n; k++) {
          const k2 = k + 1 === n ? 0 : k + 1;
          const ax = c.xs[k];
          const ay = c.ys[k];
          const ex2 = c.xs[k2] - ax;
          const ey2 = c.ys[k2] - ay;
          const den = sx * ey2 - sy * ex2;
          if (Math.abs(den) < 1e-9) continue;
          const t = (ax * ey2 - ay * ex2) / den;
          const u = (ax * sy - ay * sx) / den;
          if (t >= 0 && t <= maxD && u >= 0 && u <= 1) return true;
        }
      }
      return false;
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Evaluador de sombra de un punto (edificios + relieve)                      */
/* -------------------------------------------------------------------------- */

export interface ShadowEvaluator {
  /** Había edificios cargados alrededor: la sombra urbana es fiable. */
  buildingsKnown: boolean;
  /** Descripción de la fuente geométrica usada. */
  source: string;
  /** 0-1 · fiabilidad de la geometría. */
  confidence: number;
  /** Altura (m) del edificio en cuya huella cae el punto (0 si está al aire libre). */
  ownHeight: number;
  evaluate(sun: SolarPosition): ShadowResult;
}

export interface ShadowEvaluatorArgs {
  latitude: number;
  longitude: number;
  buildings: BuildingSet | null;
}

/**
 * Evaluador reutilizable para un punto: construye una sola vez la geometría cercana y responde
 * para cualquier posición del sol. Sin edificios cargados NO afirma que no haya sombra urbana:
 * lo comunica con `buildingsKnown: false` y una confianza menor.
 */
export function createShadowEvaluator(args: ShadowEvaluatorArgs): ShadowEvaluator {
  const { latitude, longitude, buildings } = args;
  const known = buildings !== null && buildingsCover(buildings, longitude, latitude, 300);
  const tester = known && buildings ? createShadeTester(buildings, longitude, latitude) : null;

  const source = tester ? "Edificios OSM + modelo de relieve" : "Modelo de relieve (sin edificios)";
  const confidence = tester ? 0.85 : 0.6;

  return {
    buildingsKnown: tester !== null,
    source,
    confidence,
    ownHeight: tester ? tester.ownHeight : 0,
    evaluate(sun) {
      const horizon = terrainService.horizonAngle(longitude, latitude, sun.azimuth);
      return {
        terrainShadow: sun.altitude < horizon + HORIZON_MARGIN,
        urbanShadow: tester ? tester.isShaded(sun.azimuth, sun.altitude) : false,
        buildingsKnown: tester !== null,
        confidence,
        source,
      };
    },
  };
}

export const shadowService = {
  createShadeTester,
  createShadowEvaluator,
};
