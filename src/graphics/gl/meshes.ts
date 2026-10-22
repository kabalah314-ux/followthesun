/**
 * Mallas pequeñas para los árboles 3D (instanciadas: una sola copia en la GPU para todos).
 */

export interface Mesh {
  /** x, y, z, nx, ny, nz por vértice. */
  vertices: Float32Array;
  indices: Uint16Array;
}

/** Icosfera unidad (icosaedro subdividido `subdiv` veces): copa de árbol low-poly. */
export function icosphere(subdiv = 1): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const pts: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((p) => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  });
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2, (pts[a][2] + pts[b][2]) / 2];
      const l = Math.hypot(p[0], p[1], p[2]);
      pts.push([p[0] / l, p[1] / l, p[2] / l]);
      cache.set(key, pts.length - 1);
      return pts.length - 1;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const vertices = new Float32Array(pts.length * 6);
  pts.forEach((p, i) => vertices.set([p[0], p[1], p[2], p[0], p[1], p[2]], i * 6));
  return { vertices, indices: Uint16Array.from(faces.flat()) };
}

/** Prisma hexagonal unidad (radio 1, de z = 0 a z = 1) sin tapas: el tronco. */
export function trunkPrism(sides = 6): Mesh {
  const vertices = new Float32Array(sides * 2 * 6);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a);
    const y = Math.sin(a);
    vertices.set([x, y, 0, x, y, 0], i * 6);
    vertices.set([x, y, 1, x, y, 0], (sides + i) * 6);
  }
  const idx: number[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    idx.push(i, j, sides + j, i, sides + j, sides + i);
  }
  return { vertices, indices: Uint16Array.from(idx) };
}
