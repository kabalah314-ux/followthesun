import { DEG, EARTH_CIRC, invert3, latToMy, lngToMx, solveHomography } from "../lib/coordinates";
import type { MapLike } from "../services/map/types";
import type { View } from "../types";

/**
 * Convierte la cámara del mapa (centro, zoom, rotación, inclinación) en una `View`:
 *  · la homografía exacta que lleva el suelo plano a píxeles de pantalla, y
 *  · la posición 3D de la cámara, para proyectar puntos elevados (tejados) como hace el mapa.
 *
 * La homografía se obtiene de 4 correspondencias pantalla ↔ suelo que da el propio mapa, de modo que
 * funciona igual con Mapbox GL JS y MapLibre GL JS y con cualquier rotación e inclinación.
 */

const SAMPLES: Array<[number, number]> = [
  [0.12, 0.12],
  [0.88, 0.12],
  [0.88, 0.88],
  [0.12, 0.88],
];

interface CameraApis {
  getFreeCameraOptions?: () => { position?: { x: number; y: number; z: number } | null };
  transform?: { cameraToCenterDistance?: number };
}

/**
 * Cámara en coordenadas (u, v, z) en píxeles del mundo al zoom actual.
 *  · Mapbox: `getFreeCameraOptions()` da la posición exacta (Mercator, con altura).
 *  · MapLibre: distancia cámara→centro de su transformación + inclinación + rotación.
 *  · Si ninguna está disponible: campo de visión por defecto de ambas librerías (≈ 36,9°).
 */
function computeCamera(map: MapLike, cx: number, cy: number, ws: number, h: number) {
  const apis = map as unknown as CameraApis;
  try {
    const pos = apis.getFreeCameraOptions?.().position;
    if (pos && Number.isFinite(pos.z) && pos.z > 0) {
      return { x: (pos.x - cx) * ws, y: (pos.y - cy) * ws, z: pos.z * ws };
    }
  } catch {
    /* sin cámara libre */
  }
  const dist = apis.transform?.cameraToCenterDistance;
  const d = typeof dist === "number" && Number.isFinite(dist) && dist > 0 ? dist : 1.5 * h;
  const pitch = map.getPitch() * DEG;
  const bearing = map.getBearing() * DEG;
  // La cámara está detrás del centro (hacia abajo de la pantalla) y elevada.
  const back = d * Math.sin(pitch);
  return { x: -Math.sin(bearing) * back, y: Math.cos(bearing) * back, z: d * Math.cos(pitch) };
}

export function computeView(map: MapLike): View {
  const el = map.getContainer();
  const w = el.clientWidth;
  const h = el.clientHeight;
  const c = map.getCenter();
  const zoom = map.getZoom();
  const ws = 512 * Math.pow(2, zoom);
  const cx = lngToMx(c.lng);
  const cy = latToMy(c.lat);
  const ppm = ws / (EARTH_CIRC * Math.cos(c.lat * DEG));

  const src: number[][] = [];
  const dst: number[][] = [];
  for (const [fx, fy] of SAMPLES) {
    const sx = fx * w;
    const sy = fy * h;
    const g = map.unproject([sx, sy]);
    src.push([(lngToMx(g.lng) - cx) * ws, (latToMy(g.lat) - cy) * ws]);
    dst.push([sx, sy]);
  }

  const H = solveHomography(src, dst) ?? Float64Array.of(1, 0, w / 2, 0, 1, h / 2, 0, 0, 1);
  const Hi = invert3(H) ?? Float64Array.of(1, 0, -w / 2, 0, 1, -h / 2, 0, 0, 1);

  // Caja Mercator del terreno visible.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]) {
    const g = map.unproject([sx, sy]);
    const mx = lngToMx(g.lng);
    const my = latToMy(g.lat);
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }
  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;

  return {
    cx,
    cy,
    ws,
    w,
    h,
    ppm,
    zoom,
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    H,
    Hi,
    bounds: { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY },
    camera: computeCamera(map, cx, cy, ws, h),
  };
}

/** Suelo (lng, lat) → píxeles de pantalla. Devuelve null si el punto queda detrás de la cámara. */
export function projectLngLat(v: View, lng: number, lat: number): [number, number] | null {
  const u = (lngToMx(lng) - v.cx) * v.ws;
  const vv = (latToMy(lat) - v.cy) * v.ws;
  const d = v.H[6] * u + v.H[7] * vv + 1;
  if (d < 0.05) return null;
  return [(v.H[0] * u + v.H[1] * vv + v.H[2]) / d, (v.H[3] * u + v.H[4] * vv + v.H[5]) / d];
}
