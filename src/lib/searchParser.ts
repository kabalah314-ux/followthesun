import type { Area } from "./areas";
import { escapeRegExp, nameKey, normalizeText } from "./text";

/**
 * Intérprete del buscador universal (guía maestra 2): convierte lo que se escribe en castellano,
 * catalán o inglés en una búsqueda del motor, con reglas y sin IA ni coste.
 *
 *   «terraza con sol mañana a las 11»   → terraza · sol · mañana 11:00
 *   «sombra para niños en Gràcia»       → área de juego · sombra · Gràcia
 *   «on fer un vermut al sol a l'Eixample» → terraza · sol · mediodía · Eixample
 *   «sunset viewpoint tomorrow»         → atardecer · mirador · mañana
 *
 * Lo que no se reconoce queda en `rest` para buscar por nombre en el inventario.
 */

export type DayPart = "morning" | "noon" | "afternoon" | "evening";

/** Temas que entiende el buscador (además de «sol» y «sombra»). */
export type QueryTopic =
  | "terrace"
  | "park"
  | "beach"
  | "kids"
  | "sunset"
  | "viewpoint"
  | "square"
  | "read"
  | "walk"
  | "work"
  | "dog"
  | "shelter"
  | "fountain"
  | "toilet";

export type QueryFilter = "open" | "wifi" | "accessible" | "licensed";

export interface ParsedTime {
  /** Días desde hoy (0 = hoy). */
  dayOffset: number;
  /** Minutos desde las 00:00 si se dijo una hora; null si no. */
  minutes: number | null;
  /** Parte del día («por la tarde») si se dijo. */
  part: DayPart | null;
  /** «En 30 min», «en una hora»: minutos desde ahora. */
  inMinutes: number | null;
  /** «Ahora» explícito. */
  now: boolean;
}

export interface ParsedQuery {
  raw: string;
  mode: "sun" | "shade" | null;
  topics: QueryTopic[];
  filters: QueryFilter[];
  time: ParsedTime | null;
  area: Area | null;
  /** Palabras que no se han reconocido (para buscar por nombre). */
  rest: string;
  /** Se reconoció algo (modo, tema, filtro, hora o barrio). */
  understood: boolean;
}

export interface ParseContext {
  areas: readonly Area[];
  /** Día de la semana de hoy en Barcelona (0 = lunes). */
  weekday: number;
  /** Idioma de la interfaz: resuelve palabras ambiguas («places» = plazas solo en catalán). */
  lang?: "es" | "ca" | "en";
}

type Effect =
  | { mode: "sun" | "shade" }
  | { topic: QueryTopic; part?: DayPart; mode?: "sun" | "shade" }
  | { filter: QueryFilter };

/** Frases (ya normalizadas) → efecto. Se prueban de la más larga a la más corta. */
const LEXICON: Array<[string[], Effect]> = [
  [["a la sombra", "con sombra", "sombra", "sombras", "sombreado", "sombreada", "fresquito", "fresco", "fresca", "a l ombra", "amb ombra", "ombra", "fresc", "fresca", "in the shade", "shade", "shady", "cool"], { mode: "shade" }],
  [["al sol", "con sol", "sol", "soleado", "soleada", "solecito", "assolellat", "assolellada", "amb sol", "in the sun", "sunny", "sun", "sunshine"], { mode: "sun" }],
  [["terraza", "terrazas", "terrassa", "terrasses", "terrace", "terraces", "patio", "cafe", "cafes", "cafeteria", "cafeterias", "bar", "bares", "bars", "cerveza", "cervecita", "cervesa", "beer", "drink", "drinks", "coffee", "tomar algo", "prendre alguna cosa", "fer un cafe"], { topic: "terrace" }],
  [["desayuno", "desayunar", "esmorzar", "esmorzars", "breakfast", "brunch"], { topic: "terrace", part: "morning" }],
  [["vermut", "vermout", "vermouth", "fer el vermut", "fer un vermut", "aperitivo", "aperitiu"], { topic: "terrace", part: "noon" }],
  [["comer", "almorzar", "dinar", "lunch"], { topic: "terrace", part: "noon" }],
  [["parque", "parques", "parc", "parcs", "park", "parks", "jardin", "jardines", "jardi", "jardins", "garden", "gardens"], { topic: "park" }],
  [["playa", "playas", "platja", "platges", "beach", "beaches", "banarse", "banyarse", "banyar se", "swim", "swimming"], { topic: "beach" }],
  [["ninos", "ninas", "nino", "nina", "nenes", "nens", "nen", "nena", "crios", "infantil", "infantiles", "parque infantil", "parc infantil", "zona infantil", "columpios", "gronxadors", "tobogan", "kids", "children", "child", "playground", "playgrounds"], { topic: "kids" }],
  [["atardecer", "atardeceres", "puesta de sol", "puesta del sol", "ocaso", "posta de sol", "capvespre", "sunset", "sunsets", "golden hour", "hora dorada"], { topic: "sunset" }],
  [["mirador", "miradores", "miradors", "vistas", "vistes", "viewpoint", "viewpoints", "views", "view", "rooftop", "rooftops", "azotea", "terrat"], { topic: "viewpoint" }],
  [["plaza", "plazas", "placa", "square", "squares"], { topic: "square" }],
  [["leer", "lectura", "libro", "llegir", "llibre", "read", "reading", "book"], { topic: "read" }],
  [["pasear", "caminar", "passejar", "walk", "walking", "stroll"], { topic: "walk" }],
  [["trabajar", "teletrabajo", "teletrabajar", "portatil", "ordenador", "treballar", "teletreball", "work", "working", "remote work", "laptop", "coworking"], { topic: "work" }],
  [["perro", "perros", "perrito", "gos", "gossos", "dog", "dogs", "puppy"], { topic: "dog" }],
  [["refugio", "refugios", "refugio climatico", "refugios climaticos", "refugi", "refugis", "refugi climatic", "refugis climatics", "cooling centre", "cooling center", "shelter", "shelters"], { topic: "shelter", mode: "shade" }],
  [["fuente", "fuentes", "agua", "beber agua", "font", "fonts", "aigua", "fountain", "fountains", "water", "drinking water"], { topic: "fountain" }],
  [["lavabo", "lavabos", "bano", "banos", "aseo", "aseos", "wc", "bany", "banys", "toilet", "toilets", "restroom", "restrooms", "bathroom"], { topic: "toilet" }],
  [["abierto", "abiertos", "abierta", "abierto ahora", "obert", "oberts", "oberta", "open", "open now"], { filter: "open" }],
  [["wifi", "wi fi", "internet"], { filter: "wifi" }],
  [["accesible", "accesibles", "silla de ruedas", "adaptado", "accessible", "cadira de rodes", "adaptat", "wheelchair"], { filter: "accessible" }],
  [["con licencia", "autorizada", "autorizadas", "amb llicencia", "autoritzada", "licensed"], { filter: "licensed" }],
];

const PART_MINUTES: Record<DayPart, number> = { morning: 10 * 60, noon: 13 * 60 + 30, afternoon: 16 * 60 + 30, evening: 19 * 60 };
export const partMinutes = (p: DayPart) => PART_MINUTES[p];

const WEEKDAYS: string[][] = [
  ["lunes", "dilluns", "monday"],
  ["martes", "dimarts", "tuesday"],
  ["miercoles", "dimecres", "wednesday"],
  ["jueves", "dijous", "thursday"],
  ["viernes", "divendres", "friday"],
  ["sabado", "dissabte", "saturday"],
  ["domingo", "diumenge", "sunday"],
];

const STOPWORDS = new Set(
  (
    "de del la las el los un una unos unas y o e en con para por a al que me mi quiero busco buscar donde hay algo algun alguna " +
    "sitio sitios lugar lugares cerca mas muy poco rato ir tomar estar hacer dame hoy " +
    "d les els l i amb per on hi ha vull lloc llocs prop fer anar " +
    "the an of in on at to for with and or some somewhere place spot spots near me want find where is are there get go have"
  ).split(" ")
);

/** Hora del reloj → minutos, con «de la tarde», «pm»… Sin indicación, de 1 a 7 se entiende por la tarde. */
function resolveClock(h: number, m: number, suffix: string | undefined, qualifier: string | undefined): number | null {
  if (h > 24 || m > 59) return null;
  let hour = h === 24 ? 0 : h;
  const q = qualifier ?? "";
  if (suffix === "pm" || /tarde|tarda|noche|nit|vespre|afternoon|evening/.test(q)) {
    if (hour < 12) hour += 12;
  } else if (suffix === "am" || /manana|mati|morning/.test(q)) {
    if (hour === 12) hour = 0;
  } else if (/mediodia|migdia|noon/.test(q)) {
    if (hour < 6) hour += 12;
  } else if (hour >= 1 && hour <= 7) {
    hour += 12;
  }
  return hour * 60 + m;
}

const CLOCK_PREFIX = "a las|a la|sobre las|hacia las|para las|a eso de las|a les|cap a les|sobre les|at|around|by";
const CLOCK_QUALIFIER =
  "de la tarde|de la manana|de la noche|del mediodia|de la tarda|del mati|del vespre|del migdia|de la nit|in the afternoon|in the morning|in the evening";

export function parseQuery(input: string, ctx: ParseContext): ParsedQuery {
  let s = ` ${normalizeText(input)} `;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(s);
    if (m) s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)} `.replace(/\s+/g, " ");
    if (m && !s.startsWith(" ")) s = ` ${s}`;
    return m;
  };

  let mode: ParsedQuery["mode"] = null;
  const topics: QueryTopic[] = [];
  const filters: QueryFilter[] = [];
  let dayOffset: number | null = null;
  let minutes: number | null = null;
  let part: DayPart | null = null;
  let inMinutes: number | null = null;
  let now = false;

  /* 1 · «En 30 min», «en una hora», «in half an hour». */
  const rel = take(
    /\s(?:en|dentro de|d aqui a|d aqui|in)\s+(una|un|1|media|mitja|half an|an|a|\d{1,3})\s*(horas|hora|hores|hours|hour|h|minutos|minuts|minutes|mins|min)(?=\s)/
  );
  if (rel) {
    const n = /^(una|un|1|an|a)$/.test(rel[1]) ? 1 : /^(media|mitja|half an)$/.test(rel[1]) ? 0.5 : Number(rel[1]);
    inMinutes = Math.round(/^h|^ho/.test(rel[2]) ? n * 60 : /^(media|mitja|half an)$/.test(rel[1]) ? 30 : n);
  }

  /* 2 · Hora del reloj: «a las 11», «a les 5 de la tarda», «at 5pm», «17:30», «11 h». */
  const withPrefix = take(
    new RegExp(`\\s(?:${CLOCK_PREFIX})\\s+(\\d{1,2})(?::(\\d{2}))?(?:\\s*(am|pm|h))?(?:\\s+(${CLOCK_QUALIFIER}))?(?=\\s)`)
  );
  const bare = withPrefix ? null : take(new RegExp(`\\s(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|h)?(?:\\s+(${CLOCK_QUALIFIER}))?(?=\\s)`));
  const clock = withPrefix ?? (bare && (bare[2] || bare[3] || bare[4]) ? bare : null);
  if (bare && !clock) s = ` ${bare[0]} ${s}`; // un número suelto no es una hora: se devuelve
  if (clock) minutes = resolveClock(Number(clock[1]), Number(clock[2] ?? 0), clock[3], clock[4]);

  /* 3 · Días y partes del día. */
  const dayRules: Array<[RegExp, number | null, DayPart | null]> = [
    [/\s(pasado manana|dema passat|day after tomorrow)(?=\s)/, 2, null],
    [/\s(manana por la manana|manana a primera hora|dema al mati|dema pel mati|dema a primera hora|tomorrow morning)(?=\s)/, 1, "morning"],
    [/\s(manana por la tarde|manana a la tarde|dema a la tarda|dema per la tarda|tomorrow afternoon)(?=\s)/, 1, "afternoon"],
    [/\s(manana al mediodia|dema al migdia|tomorrow at noon|tomorrow lunchtime)(?=\s)/, 1, "noon"],
    [/\s(esta manana|aquest mati|this morning)(?=\s)/, 0, "morning"],
    [/\s(esta tarde|aquesta tarda|this afternoon)(?=\s)/, 0, "afternoon"],
    [/\s(esta noche|aquest vespre|aquesta nit|this evening|tonight)(?=\s)/, 0, "evening"],
    [/\s(por la manana|de la manana|a primera hora|al mati|pel mati|in the morning)(?=\s)/, null, "morning"],
    [/\s(por la tarde|a la tarde|per la tarda|a la tarda|in the afternoon)(?=\s)/, null, "afternoon"],
    [/\s(al mediodia|a mediodia|mediodia|al migdia|migdia|at noon|noon|midday|lunchtime)(?=\s)/, null, "noon"],
    [/\s(tarde|tarda|afternoon)(?=\s)/, null, "afternoon"],
    [/\s(morning|mati)(?=\s)/, null, "morning"],
    [/\s(evening|vespre|noche|nit)(?=\s)/, null, "evening"],
    [/\s(manana|dema|tomorrow)(?=\s)/, 1, null],
    [/\s(hoy|avui|today)(?=\s)/, 0, null],
  ];
  for (const [re, day, p] of dayRules) {
    if (take(re)) {
      if (day !== null && dayOffset === null) dayOffset = day;
      if (p && !part) part = p;
    }
  }
  if (take(/\s(ahora mismo|ahora|ara mateix|ara|right now|now)(?=\s)/)) now = true;
  if (dayOffset === null) {
    if (take(/\s(fin de semana|finde|cap de setmana|weekend)(?=\s)/)) {
      dayOffset = ctx.weekday >= 5 ? 0 : 5 - ctx.weekday;
    } else {
      for (let d = 0; d < 7 && dayOffset === null; d++) {
        const re = new RegExp(`\\s(?:el\\s|this\\s|on\\s)?(${WEEKDAYS[d].join("|")})(?=\\s)`);
        if (take(re)) dayOffset = (d - ctx.weekday + 7) % 7;
      }
    }
  }

  /* 4 · Modo, temas y filtros (frase más larga primero). */
  const phrases: Array<[string, Effect]> = [];
  for (const [list, effect] of LEXICON) for (const p of list) phrases.push([p, effect]);
  if (ctx.lang === "ca") phrases.push(["places", { topic: "square" }]);
  phrases.sort((a, b) => b[0].length - a[0].length);
  for (const [p, effect] of phrases) {
    const re = new RegExp(`\\s${escapeRegExp(p)}(?=\\s)`);
    while (take(re)) {
      if ("mode" in effect && effect.mode && !mode) mode = effect.mode;
      if ("topic" in effect) {
        if (!topics.includes(effect.topic)) topics.push(effect.topic);
        if (effect.part && !part && minutes === null) part = effect.part;
      }
      if ("filter" in effect && !filters.includes(effect.filter)) filters.push(effect.filter);
    }
  }

  /* 5 · Barrio o distrito (el nombre más largo primero). */
  let area: Area | null = null;
  const keys: Array<[string, Area]> = [];
  for (const a of ctx.areas) {
    for (const k of new Set([nameKey(a.name), ...a.aliases])) if (k.length >= 3) keys.push([k, a]);
  }
  keys.sort((a, b) => b[0].length - a[0].length);
  for (const [k, a] of keys) {
    if (take(new RegExp(`\\s(?:l |el |la |les |els )?${escapeRegExp(k)}(?=\\s)`))) {
      area = a;
      break;
    }
  }

  const rest = s
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ");

  const time: ParsedTime | null =
    dayOffset !== null || minutes !== null || part !== null || inMinutes !== null || now
      ? { dayOffset: dayOffset ?? 0, minutes, part, inMinutes, now }
      : null;

  return {
    raw: input,
    mode,
    topics,
    filters,
    time,
    area,
    rest,
    understood: mode !== null || topics.length > 0 || filters.length > 0 || time !== null || area !== null,
  };
}

/**
 * Minutos del día que pide la consulta (hora exacta, parte del día o ninguno = ahora/franja libre).
 * El atardecer lo resuelve quien conoce la hora de la puesta.
 */
export function queryMinutes(t: ParsedTime): number | null {
  if (t.minutes !== null) return t.minutes;
  if (t.part) return PART_MINUTES[t.part];
  return null;
}
