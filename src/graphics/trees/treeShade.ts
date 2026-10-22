import { latToMy, lngToMx } from "../../lib/coordinates";
import { TREE_INSTANCE_STRIDE, type TreeBatch } from "./treeStore";
import { crownShape } from "./treeTiles";

/**
 * Sombra de los árboles en un punto (CPU): qué fracción del sol directo tapan las copas cercanas.
 *
 * Mismo modelo que la GPU: cada copa es un elipsoide con la densidad de hoja de la estación. Un rayo
 * hacia el sol que atraviesa una copa conserva (1 − densidad) de la luz y varias copas se
 * multiplican. Los troncos no cuentan (tapan poco y un instante).
 */
export interface TreeShadeTester {
  /** Copas cercanas que pueden tapar el sol en este punto. */
  candidates: number;
  /** Fracción del sol directo tapada por copas: 0 (nada) – 1 (todo). */
  shadeAt(azimuth: number, altitude: number, densities: readonly number[]): number;
}

/** Altura de los ojos o de la mesa de una terraza (m). */
const EYE_M = 1.2;

interface Crown {
  x: number;
  y: number;
  z: number;
  rh: number;
  rv: number;
  kind: number;
}

/**
 * Rejilla de los árboles de un lote (celdas de `cellM` metros): para preparar muchos puntos
 * seguidos (una ruta) sin recorrer el lote entero en cada uno.
 */
export interface TreeGrid {
  batch: TreeBatch;
  cellM: number;
  cells: Map<number, number[]>;
}

const cellKey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

export function buildTreeGrid(batch: TreeBatch, cellM = 40): TreeGrid {
  const cells = new Map<number, number[]>();
  const inst = batch.instances;
  for (let i = 0; i < batch.count; i++) {
    const o = i * TREE_INSTANCE_STRIDE;
    const k = cellKey(Math.floor(inst[o] / cellM), Math.floor(inst[o + 1] / cellM));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  return { batch, cellM, cells };
}

/** Copa más ancha que se espera (m): margen al buscar en la rejilla. */
const MAX_CROWN_RADIUS_M = 15;

export function createTreeShadeTester(batch: TreeBatch, lng: number, lat: number, radiusM = 60, grid?: TreeGrid): TreeShadeTester {
  const px = (lngToMx(lng) - batch.ox) * batch.mpu;
  const py = (latToMy(lat) - batch.oy) * batch.mpu;
  const crowns: Crown[] = [];
  const inst = batch.instances;
  const visit = (i: number) => {
    const o = i * TREE_INSTANCE_STRIDE;
    const dx = inst[o] - px;
    const dy = inst[o + 1] - py;
    const h = inst[o + 2];
    const rh = inst[o + 3];
    const kind = Math.round(inst[o + 4]);
    if (Math.hypot(dx, dy) - rh > radiusM) return;
    const s = crownShape(kind, h, 2 * rh);
    // Copa entera por debajo de los ojos: no tapa el sol.
    if (s.hc + s.rv <= EYE_M) return;
    crowns.push({ x: dx, y: dy, z: s.hc - EYE_M, rh: s.rh, rv: s.rv, kind });
  };
  if (grid && grid.batch === batch) {
    const reach = radiusM + MAX_CROWN_RADIUS_M;
    const x0 = Math.floor((px - reach) / grid.cellM);
    const x1 = Math.floor((px + reach) / grid.cellM);
    const y0 = Math.floor((py - reach) / grid.cellM);
    const y1 = Math.floor((py + reach) / grid.cellM);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = grid.cells.get(cellKey(cx, cy));
        if (cell) for (const i of cell) visit(i);
      }
    }
  } else {
    for (let i = 0; i < batch.count; i++) visit(i);
  }

  return {
    candidates: crowns.length,
    shadeAt(azimuth, altitude, densities) {
      if (altitude <= 0 || crowns.length === 0) return 0;
      // Hacia el sol en el marco local (x = este, y = sur, z = arriba).
      const ca = Math.cos(altitude);
      const dx = Math.sin(azimuth) * ca;
      const dy = -Math.cos(azimuth) * ca;
      const dz = Math.sin(altitude);
      let light = 1;
      for (const c of crowns) {
        // En el espacio donde la copa es una esfera unidad: |o + t·d|² = 1.
        const ox = -c.x / c.rh;
        const oy = -c.y / c.rh;
        const oz = -c.z / c.rv;
        const ex = dx / c.rh;
        const ey = dy / c.rh;
        const ez = dz / c.rv;
        const a = ex * ex + ey * ey + ez * ez;
        const b = ox * ex + oy * ey + oz * ez;
        const k = ox * ox + oy * oy + oz * oz - 1;
        const disc = b * b - a * k;
        if (disc <= 0) continue;
        // La copa tiene que estar del lado del sol (t > 0).
        if ((-b + Math.sqrt(disc)) / a <= 0) continue;
        light *= 1 - Math.min(1, Math.max(0, densities[c.kind] ?? 0.8));
        if (light < 0.005) break;
      }
      return 1 - light;
    },
  };
}
