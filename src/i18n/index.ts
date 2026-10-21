/**
 * Idiomas de I Follow the Sun: castellano (fuente), catalán e inglés.
 *
 * Sin dependencias: diccionarios tipados (una clave que falte en `ca` o `en` es un error de tipos),
 * interpolación `{nombre}`, plurales sencillos (`trPlural`) y formato con `Intl` según el idioma,
 * siempre en hora de Barcelona.
 * Cambiar de idioma guarda la preferencia y recarga la app: los textos se leen al pintar y las
 * preferencias, los guardados y la hora elegida en la URL se conservan.
 */
import { ca } from "./ca";
import { en } from "./en";
import { es, type MessageKey } from "./es";

export type { MessageKey } from "./es";
export type Lang = "es" | "ca" | "en";

export const LANGS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: "es", label: "Castellano" },
  { id: "ca", label: "Català" },
  { id: "en", label: "English" },
];

/** Preferencia guardada (se conserva al borrar los datos de la app). */
export const LANG_STORAGE_KEY = "fts:lang";
const STORAGE_KEY = LANG_STORAGE_KEY;
const DICTS: Record<Lang, Record<MessageKey, string>> = { es, ca, en };

const isLang = (v: unknown): v is Lang => v === "es" || v === "ca" || v === "en";

/** Primera visita: idioma del navegador (ca → catalán, es/gl/eu → castellano, el resto → inglés). */
export function detectLang(saved: string | null, languages: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const l of languages) {
    const c = (l || "").toLowerCase();
    if (c.startsWith("ca")) return "ca";
    if (c.startsWith("es") || c.startsWith("gl") || c.startsWith("eu")) return "es";
    if (c.startsWith("en")) return "en";
  }
  return languages.length ? "en" : "es";
}

function initialLang(): Lang {
  // Fuera del navegador (tests, ETL) siempre castellano: es el idioma de referencia.
  if (typeof window === "undefined") return "es";
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* sin almacenamiento */
  }
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const languages = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : [];
  return detectLang(saved, languages);
}

let current: Lang = initialLang();
if (typeof document !== "undefined") document.documentElement.lang = current;

export const getLang = (): Lang => current;

/** Cambia el idioma: lo guarda y recarga la app (la URL conserva la hora y la vista). */
export function setLang(next: Lang): void {
  if (next === current) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* sin almacenamiento: solo esta sesión */
  }
  current = next;
  window.location.reload();
}

/** Locale de `Intl` para fechas, horas y números del idioma activo. */
export function intlLocale(lang: Lang = current): string {
  return lang === "ca" ? "ca-ES" : lang === "en" ? "en-GB" : "es-ES";
}

/** Sustituye `{nombre}` por su valor; deja la marca si falta la variable. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Texto traducido. Si una traducción faltara en tiempo de ejecución, se usa el castellano. */
export function tr(key: MessageKey, vars?: Record<string, string | number>): string {
  return interpolate(DICTS[current][key] ?? es[key] ?? key, vars);
}

let pluralRules: Intl.PluralRules | null = null;

/**
 * Plural sencillo: elige la forma `one` u `other` con las reglas del idioma activo y pasa el número
 * como `{n}` (se puede sustituir por el número ya formateado: `{ n: "1,5" }`).
 */
export function trPlural(count: number, forms: { one: MessageKey; other: MessageKey }, vars?: Record<string, string | number>): string {
  pluralRules ??= new Intl.PluralRules(intlLocale());
  return tr(pluralRules.select(count) === "one" ? forms.one : forms.other, { n: count, ...vars });
}

/** Texto de una clave en un idioma concreto (tests, compartir en otro idioma). */
export function trIn(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  return interpolate(DICTS[lang][key] ?? es[key] ?? key, vars);
}

/** Idioma activo y selector, para Ajustes y Acerca de. */
export function useLang() {
  return { lang: current, setLang, langs: LANGS };
}
