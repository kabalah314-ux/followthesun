/**
 * Texto normalizado para buscar: sin acentos ni mayúsculas, con apóstrofos, guiones y signos como
 * espacios («L'Antiga Esquerra», «Poble-sec» → «l antiga esquerra», «poble sec»). Conserva las
 * horas («17.30» y «17h30» → «17:30»). Puro.
 */
export function normalizeText(s: string): string {
  return ` ${s} `
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/·/g, "")
    .replace(/(\d)[.h](\d{2})(?!\d)/g, "$1:$2")
    .replace(/(\d)h(?=\s)/g, "$1 h")
    .replace(/[^a-z0-9:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Artículos al principio de un nombre de barrio o lugar («el Raval», «la Barceloneta», «l'Eixample»). */
const LEADING_ARTICLE = /^(?:el|la|les|els|los|las|l|the)\s+/;

/** Clave de comparación de un nombre: normalizado y sin artículo inicial. */
export function nameKey(s: string): string {
  return normalizeText(s).replace(LEADING_ARTICLE, "");
}

/** Escapa un texto para usarlo dentro de una expresión regular. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
