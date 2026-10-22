/**
 * Porte de los árboles de Barcelona para dibujarlos en 3D y proyectar su sombra.
 *
 *  · De cada árbol, el inventario municipal de arbolado (Open Data BCN: «arbrat viari», «arbrat
 *    zona» y «arbrat parcs», CC BY 4.0 · Ajuntament de Barcelona) da la especie, el tipo de
 *    elemento (árbol o palmera), la categoría («PRIMERA», «SEGONA», «TERCERA», «EXEMPLAR») y, a
 *    veces, la fecha de plantación. No da alturas.
 *  · El porte adulto (altura y diámetro de copa) y si pierde la hoja son valores ORIENTATIVOS de
 *    árbol de alineación en clima mediterráneo, de la bibliografía hortícola habitual (fichas de
 *    especie de viveros y guías de arbolado urbano). No son medidas de cada ejemplar: sirven para
 *    que la copa y su sombra tengan un tamaño plausible. Se pueden afinar aquí sin tocar nada más.
 *  · La categoría se usa como corrección suave del tamaño y un árbol plantado hace menos de 15 años
 *    se dibuja más pequeño.
 */

/** 0 perenne · 1 caducifolio · 2 palmera · 3 conífera · 4 semicaducifolio. */
export type TreeKind = 0 | 1 | 2 | 3 | 4;
export const TREE_KIND = { evergreen: 0, deciduous: 1, palm: 2, conifer: 3, semi: 4 } as const;

interface Porte {
  kind: TreeKind;
  /** Altura adulta típica (m). */
  h: number;
  /** Diámetro de copa típico (m). */
  c: number;
}

const E = TREE_KIND.evergreen;
const D = TREE_KIND.deciduous;
const P = TREE_KIND.palm;
const C = TREE_KIND.conifer;
const S = TREE_KIND.semi;

/** Por género (primera palabra del nombre científico, en minúsculas). */
const GENUS: Record<string, Porte> = {
  platanus: { kind: D, h: 18, c: 13 },
  celtis: { kind: D, h: 14, c: 10 },
  styphnolobium: { kind: D, h: 12, c: 9 },
  sophora: { kind: D, h: 12, c: 9 },
  tipuana: { kind: S, h: 14, c: 12 },
  ulmus: { kind: D, h: 13, c: 9 },
  melia: { kind: D, h: 9, c: 7 },
  jacaranda: { kind: S, h: 10, c: 8 },
  pinus: { kind: C, h: 15, c: 11 },
  citrus: { kind: E, h: 5, c: 4 },
  ligustrum: { kind: E, h: 8, c: 6 },
  populus: { kind: D, h: 20, c: 9 },
  tilia: { kind: D, h: 15, c: 9 },
  acer: { kind: D, h: 10, c: 7 },
  robinia: { kind: D, h: 12, c: 8 },
  brachychiton: { kind: E, h: 10, c: 6 },
  morus: { kind: D, h: 8, c: 7 },
  quercus: { kind: E, h: 11, c: 9 },
  ficus: { kind: E, h: 10, c: 12 },
  cupressus: { kind: C, h: 15, c: 3 },
  cedrus: { kind: C, h: 18, c: 10 },
  magnolia: { kind: E, h: 12, c: 8 },
  olea: { kind: E, h: 6, c: 5 },
  prunus: { kind: D, h: 6, c: 5 },
  koelreuteria: { kind: D, h: 8, c: 6 },
  ginkgo: { kind: D, h: 12, c: 7 },
  fraxinus: { kind: D, h: 13, c: 8 },
  lagerstroemia: { kind: D, h: 6, c: 4 },
  cercis: { kind: D, h: 7, c: 6 },
  catalpa: { kind: D, h: 10, c: 8 },
  gleditsia: { kind: D, h: 13, c: 9 },
  liquidambar: { kind: D, h: 14, c: 8 },
  pyrus: { kind: D, h: 9, c: 5 },
  schinus: { kind: E, h: 8, c: 7 },
  erythrina: { kind: D, h: 9, c: 8 },
  casuarina: { kind: C, h: 15, c: 6 },
  ceratonia: { kind: E, h: 8, c: 8 },
  laurus: { kind: E, h: 7, c: 5 },
  eucalyptus: { kind: E, h: 20, c: 10 },
  ailanthus: { kind: D, h: 12, c: 8 },
  albizia: { kind: D, h: 7, c: 7 },
  grevillea: { kind: E, h: 15, c: 7 },
  acacia: { kind: E, h: 8, c: 6 },
  bauhinia: { kind: S, h: 7, c: 6 },
  callistemon: { kind: E, h: 5, c: 4 },
  pittosporum: { kind: E, h: 5, c: 4 },
  photinia: { kind: E, h: 5, c: 4 },
  nerium: { kind: E, h: 3, c: 3 },
  hibiscus: { kind: D, h: 3, c: 2 },
  salix: { kind: D, h: 10, c: 9 },
  betula: { kind: D, h: 12, c: 6 },
  carpinus: { kind: D, h: 12, c: 8 },
  aesculus: { kind: D, h: 15, c: 10 },
  paulownia: { kind: D, h: 12, c: 9 },
  zelkova: { kind: D, h: 14, c: 10 },
  tamarix: { kind: D, h: 6, c: 5 },
  washingtonia: { kind: P, h: 18, c: 4 },
  phoenix: { kind: P, h: 12, c: 8 },
  trachycarpus: { kind: P, h: 7, c: 2.5 },
  chamaerops: { kind: P, h: 3, c: 3 },
  butia: { kind: P, h: 5, c: 4 },
  syagrus: { kind: P, h: 12, c: 5 },
  archontophoenix: { kind: P, h: 12, c: 4 },
  livistona: { kind: P, h: 12, c: 4 },
};

/** Especies y variedades con un porte muy distinto del de su género. */
const SPECIES: Array<[RegExp, Partial<Porte>]> = [
  [/populus nigra .*italica/, { c: 3 }],
  [/quercus (robur|petraea|rubra|cerris|faginea)/, { kind: D, h: 15, c: 10 }],
  [/pinus halepensis/, { h: 14, c: 8 }],
  [/pinus pinea/, { h: 15, c: 12 }],
  [/phoenix dactylifera/, { h: 15, c: 7 }],
  [/ficus carica/, { kind: D, h: 5, c: 5 }],
  [/acer negundo/, { h: 11, c: 8 }],
  [/prunus (cerasifera|serrulata)/, { h: 6, c: 5 }],
  [/cupressus macrocarpa/, { c: 7 }],
  [/fraxinus angustifolia .*raywood/, { h: 12, c: 7 }],
];

/** Sin especie conocida: tamaño según la categoría del inventario. */
const BY_CATEGORY: Record<string, Porte> = {
  EXEMPLAR: { kind: D, h: 18, c: 13 },
  PRIMERA: { kind: D, h: 15, c: 10 },
  SEGONA: { kind: D, h: 11, c: 8 },
  TERCERA: { kind: D, h: 7, c: 5 },
};

/** Corrección suave por categoría cuando la especie ya se conoce. */
const CATEGORY_SCALE: Record<string, number> = { EXEMPLAR: 1.15, PRIMERA: 1, SEGONA: 0.88, TERCERA: 0.75 };

export interface TreeInput {
  /** Nombre científico («Platanus x hispanica», «Fraxinus angustifolia 'Raywood'»). */
  scientific?: string;
  /** «PRIMERA», «SEGONA», «TERCERA», «EXEMPLAR». */
  category?: string;
  /** Fecha de plantación (AAAA-MM-DD), si se conoce. */
  planted?: string;
  /** El inventario lo da como palmera. */
  palm?: boolean;
  /** Fecha de referencia para la edad (por defecto, hoy). */
  now?: Date;
}

export interface TreeDims {
  kind: TreeKind;
  /** Altura total (m). */
  heightM: number;
  /** Diámetro de copa (m). */
  crownM: number;
}

const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[×]/g, "x")
    .replace(/['"‘’“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Género normalizado de un nombre científico (o "" si no hay). */
export function genusOf(scientific?: string): string {
  const n = normalizeName(scientific ?? "");
  const first = n.split(" ")[0] ?? "";
  return /^[a-z]+$/.test(first) ? first : "";
}

const round05 = (x: number) => Math.round(x * 2) / 2;

export function treeDims(t: TreeInput): TreeDims {
  const name = normalizeName(t.scientific ?? "");
  const cat = (t.category ?? "").trim().toUpperCase();
  const genus = genusOf(t.scientific);
  let base: Porte | undefined = GENUS[genus];
  let known = base !== undefined;
  if (base) {
    base = { ...base };
    for (const [re, patch] of SPECIES) if (re.test(name)) Object.assign(base, patch);
  } else if (t.palm) {
    base = { kind: P, h: 10, c: 5 };
    known = true;
  } else {
    base = BY_CATEGORY[cat] ?? { kind: D, h: 9, c: 6 };
  }
  if (t.palm) base.kind = P;

  let scale = known ? (CATEGORY_SCALE[cat] ?? 1) : 1;
  // Árbol joven: entre el 35 % y el 100 % del porte adulto en sus primeros 15 años.
  const planted = t.planted ? Date.parse(t.planted) : NaN;
  if (Number.isFinite(planted)) {
    const now = (t.now ?? new Date()).getTime();
    const years = (now - planted) / (365.25 * 24 * 3600 * 1000);
    if (years >= 0 && years < 15) scale *= 0.35 + 0.65 * (years / 15);
  }
  const heightM = Math.max(2.5, round05(base.h * scale));
  const crownM = Math.max(1.5, round05(base.c * scale));
  return { kind: base.kind, heightM, crownM };
}
