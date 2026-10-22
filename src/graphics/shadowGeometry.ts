import earcut from "earcut";
import { metersPerMercatorUnit, myToLat } from "../lib/coordinates";

/**
 * Geometría de sombras para la GPU (se calcula en un Web Worker, ver `shadowGeometryClient`).
 *
 * Cada edificio es un prisma (huella × altura). Su sombra sobre el suelo es la suma de Minkowski de
 * la huella con el segmento [0, L·d] (d = dirección opuesta al sol, L = h / tan(altitud)):
 *
 *     sombra = huella proyectada ∪ barridos de todas las aristas      (− la propia huella)
 *
 * Aquí NO se proyecta nada: cada vértice se guarda dos veces, en la base (k = 0) y en el extremo
 * (k = 1), con la altura del edificio. El shader desplaza los extremos con la posición del sol
 * (un uniform), así que mover la hora no recalcula geometría: solo cambia un vector.
 *
 * El orden reproduce el «pintor» del motor de canvas: por clases de altura, de menor a mayor,
 * primero las sombras (valor 1) y luego las huellas (valor 0, tejados iluminados). La sombra de
 * un edificio alto sí cae sobre los tejados bajos que tiene alrededor.
 *
 * Coordenadas locales en metros (x = este, y = sur) desde un origen cercano: en float32 no se
 * pierde precisión ni a zoom 20 (en Mercator absoluto habría saltos de decenas de píxeles).
 */

/** Subconjunto transferible de `BuildingSet` que necesita la GPU. */
export interface ShadowSource {
  count: number;
  /** Pares x,y Mercator normalizados de los anillos exteriores. */
  coords: Float64Array;
  /** Vértice inicial de cada edificio (count + 1). */
  offsets: Uint32Array;
  /** Altura para sombras (m). */
  heights: Float32Array;
  /** Altura con la que el mapa dibuja el edificio en 3D (m). */
  renderHeights: Float32Array;
  /** Índices de edificios por clase de altura (de menor a mayor). */
  buckets: Uint32Array[];
  /** 1 = contorno que el mapa no levanta en 3D (tiene partes): sin arista de tejado. */
  hide3d?: Uint8Array;
}

export interface ShadowGeometry {
  /** Origen local (Mercator normalizado). */
  ox: number;
  oy: number;
  /** Metros por unidad Mercator en el origen. */
  mpu: number;
  /** Por vértice: x, y (m), altura (m), k (0 base · 1 extremo de la sombra). */
  vertices: Float32Array;
  indices: Uint32Array;
  /** Por clase de altura: inicio y número de índices de sombra; inicio y número de recorte. */
  ranges: Int32Array;
  /** Por arista de tejado: ax, ay, bx, by (m) y altura (m). */
  edges: Float32Array;
  edgeCount: number;
  /** Altura máxima (m): acota la búsqueda de la penumbra. */
  maxHeight: number;
  buildings: number;
}

export const SHADOW_VERTEX_STRIDE = 4;
export const ROOF_EDGE_STRIDE = 5;

/** Clave barata para reconocer el mismo conjunto de edificios (caché). */
export function shadowSourceKey(src: ShadowSource): string {
  const { coords, heights, count } = src;
  let h = 0;
  const step = Math.max(1, Math.floor(coords.length / 997));
  for (let i = 0; i < coords.length; i += step) h = (h * 31 + Math.round(coords[i] * 1e9)) % 2147483647;
  const hs = Math.max(1, Math.floor(heights.length / 211));
  for (let i = 0; i < heights.length; i += hs) h = (h * 31 + Math.round(heights[i] * 10)) % 2147483647;
  return `${count}|${coords.length}|${h}`;
}

/** Construye los búferes de la GPU. Pura: sirve igual en el worker que en el hilo principal. */
export function buildShadowGeometry(src: ShadowSource, origin?: { ox: number; oy: number }): ShadowGeometry {
  const { count, coords, offsets, heights, renderHeights, buckets, hide3d } = src;

  // Origen: centro de la caja de todos los vértices.
  let ox = origin?.ox ?? 0;
  let oy = origin?.oy ?? 0;
  if (!origin) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i];
      const y = coords[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    ox = Number.isFinite(minX) ? (minX + maxX) / 2 : 0.5;
    oy = Number.isFinite(minY) ? (minY + maxY) / 2 : 0.5;
  }
  const mpu = metersPerMercatorUnit(myToLat(oy));

  // 1.ª pasada: triangulación de cada huella (en metros locales) y recuento.
  const tris: Array<number[] | null> = new Array(count).fill(null);
  let vertexCount = 0;
  let edgeCount = 0;
  let maxHeight = 0;
  const flat: number[] = [];
  for (let i = 0; i < count; i++) {
    const o = offsets[i];
    const n = offsets[i + 1] - o;
    if (n < 3) continue;
    flat.length = 0;
    for (let p = 0; p < n; p++) {
      flat.push((coords[2 * (o + p)] - ox) * mpu, (coords[2 * (o + p) + 1] - oy) * mpu);
    }
    tris[i] = earcut(flat);
    vertexCount += 2 * n;
    if (!hide3d || !hide3d[i]) edgeCount += n;
    if (heights[i] > maxHeight) maxHeight = heights[i];
  }

  const vertices = new Float32Array(vertexCount * SHADOW_VERTEX_STRIDE);
  const edges = new Float32Array(edgeCount * ROOF_EDGE_STRIDE);
  const base = new Int32Array(count).fill(-1);

  // 2.ª pasada: vértices (base y extremo) y aristas de tejado.
  let v = 0;
  let e = 0;
  for (let i = 0; i < count; i++) {
    if (!tris[i]) continue;
    const o = offsets[i];
    const n = offsets[i + 1] - o;
    const h = heights[i];
    base[i] = v / SHADOW_VERTEX_STRIDE;
    for (let k = 0; k < 2; k++) {
      for (let p = 0; p < n; p++) {
        vertices[v++] = (coords[2 * (o + p)] - ox) * mpu;
        vertices[v++] = (coords[2 * (o + p) + 1] - oy) * mpu;
        vertices[v++] = h;
        vertices[v++] = k;
      }
    }
    if (hide3d && hide3d[i]) continue;
    const rh = renderHeights[i] > 0 ? renderHeights[i] : h;
    for (let p = 0; p < n; p++) {
      const p2 = p + 1 === n ? 0 : p + 1;
      edges[e++] = (coords[2 * (o + p)] - ox) * mpu;
      edges[e++] = (coords[2 * (o + p) + 1] - oy) * mpu;
      edges[e++] = (coords[2 * (o + p2)] - ox) * mpu;
      edges[e++] = (coords[2 * (o + p2) + 1] - oy) * mpu;
      edges[e++] = rh;
    }
  }

  // 3.ª pasada: índices por clase de altura (sombras y luego huellas).
  let indexCount = 0;
  for (let i = 0; i < count; i++) {
    const t = tris[i];
    if (!t) continue;
    const n = offsets[i + 1] - offsets[i];
    indexCount += 2 * t.length + 6 * n;
  }
  const indices = new Uint32Array(indexCount);
  const ranges = new Int32Array(buckets.length * 4);
  let w = 0;
  for (let b = 0; b < buckets.length; b++) {
    const list = buckets[b];
    ranges[4 * b] = w;
    for (let li = 0; li < list.length; li++) {
      const i = list[li];
      const t = tris[i];
      if (!t) continue;
      const n = offsets[i + 1] - offsets[i];
      const b0 = base[i];
      const b1 = b0 + n;
      // Huella proyectada (la sombra del tejado).
      for (let q = 0; q < t.length; q++) indices[w++] = b1 + t[q];
      // Barrido de cada arista: base p, base p2, extremo p2 · base p, extremo p2, extremo p.
      for (let p = 0; p < n; p++) {
        const p2 = p + 1 === n ? 0 : p + 1;
        indices[w++] = b0 + p;
        indices[w++] = b0 + p2;
        indices[w++] = b1 + p2;
        indices[w++] = b0 + p;
        indices[w++] = b1 + p2;
        indices[w++] = b1 + p;
      }
    }
    ranges[4 * b + 1] = w - ranges[4 * b];
    ranges[4 * b + 2] = w;
    for (let li = 0; li < list.length; li++) {
      const i = list[li];
      const t = tris[i];
      if (!t) continue;
      const b0 = base[i];
      for (let q = 0; q < t.length; q++) indices[w++] = b0 + t[q];
    }
    ranges[4 * b + 3] = w - ranges[4 * b + 2];
  }

  return {
    ox,
    oy,
    mpu,
    vertices,
    indices: w === indices.length ? indices : indices.slice(0, w),
    ranges,
    edges,
    edgeCount,
    maxHeight,
    buildings: count,
  };
}

/** Búferes que se pueden transferir (sin copia) entre el worker y la página. */
export function shadowGeometryTransferables(g: ShadowGeometry): ArrayBuffer[] {
  return [g.vertices.buffer, g.indices.buffer, g.ranges.buffer, g.edges.buffer] as ArrayBuffer[];
}
