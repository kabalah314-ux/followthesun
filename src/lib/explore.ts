import { tr, trPlural } from "../i18n";
import type { TerraceLicenseInfo } from "../services/openData/terraceMatching";
import { startOfZoneDay } from "../services/timeService";
import type { LngLat, SunIntent, SunPlace, SunPlaceType, SunSearchRequest, SunSearchResult } from "../types";
import type { SunShadeMode } from "./answer";
import type { Area } from "./areas";
import { distanceMeters } from "./coordinates";
import { isOpenNow, openStateAt } from "./openingHours";
import { nearbyLine } from "./placeAnswer";
import { SUN_INTENTS } from "./placeTypes";
import { dayStartFor, hhmm, zonedMs } from "./planningTime";
import { queryMinutes, type ParsedQuery, type QueryFilter } from "./searchParser";

/**
 * Explorar (guía maestra 2): chips de intención, filtros, búsquedas escritas y colecciones del
 * momento se convierten aquí en UNA forma común (`ExploreSpec`) y de ahí en la petición del motor.
 * También el «porqué» de cada tarjeta y la selección final de «Para ti». Lógica pura.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/*  Chips y filtros                                                            */
/* -------------------------------------------------------------------------- */

export type ChipId = "sun" | "shade" | "terraces" | "parks" | "beach" | "kids" | "benches" | "sunset" | "work" | "dog";
export const CHIPS: readonly ChipId[] = ["sun", "shade", "terraces", "parks", "beach", "kids", "benches", "sunset", "work", "dog"];

export interface ExploreFilters {
  /** Abierto a la hora elegida (los que no tienen horario conocido se quedan). */
  open: boolean;
  /** Solo terrazas con licencia municipal. */
  licensed: boolean;
  wifi: boolean;
  dog: boolean;
  accessible: boolean;
  /** Minutos a pie como máximo (null = sin límite). */
  maxWalk: number | null;
}

export const NO_FILTERS: ExploreFilters = { open: false, licensed: false, wifi: false, dog: false, accessible: false, maxWalk: null };
export const WALK_OPTIONS: readonly number[] = [5, 10, 15, 20];

export function activeFilterCount(f: ExploreFilters): number {
  return (f.open ? 1 : 0) + (f.licensed ? 1 : 0) + (f.wifi ? 1 : 0) + (f.dog ? 1 : 0) + (f.accessible ? 1 : 0) + (f.maxWalk !== null ? 1 : 0);
}

/** Filtros guardados (localStorage) → filtros válidos. */
export function sanitizeFilters(v: unknown): ExploreFilters {
  if (!v || typeof v !== "object") return NO_FILTERS;
  const o = v as Record<string, unknown>;
  const walk = typeof o.maxWalk === "number" && WALK_OPTIONS.includes(o.maxWalk) ? o.maxWalk : null;
  return { open: o.open === true, licensed: o.licensed === true, wifi: o.wifi === true, dog: o.dog === true, accessible: o.accessible === true, maxWalk: walk };
}

/* -------------------------------------------------------------------------- */
/*  Datos de un lugar                                                          */
/* -------------------------------------------------------------------------- */

export interface PlaceFlags {
  /** null = no se sabe. */
  wifi: boolean | null;
  dog: boolean | null;
  accessible: boolean | null;
  licensed: TerraceLicenseInfo | null;
  hours: string | null;
}

const YES = new Set(["yes", "wlan", "free", "customers", "limited", "leashed", "designated", "outside", "true"]);
const flag = (v: unknown): boolean | null => (v === true ? true : v === false ? false : typeof v === "string" ? YES.has(v.toLowerCase()) : null);

/** Lo que se sabe de un lugar (OpenStreetMap y licencias): wifi, perros, accesibilidad, licencia y horario. */
export function placeFlags(p: Pick<SunPlace, "metadata">): PlaceFlags {
  const m = p.metadata ?? {};
  return {
    wifi: flag(m.wifi),
    dog: flag(m.dog),
    accessible: flag(m.wheelchair),
    licensed: m.licensed && typeof m.licensed === "object" ? (m.licensed as TerraceLicenseInfo) : null,
    hours: typeof m.openingHours === "string" ? m.openingHours : null,
  };
}

/**
 * Filtros de la hoja sobre los candidatos. «Abierto» quita lo que se sabe cerrado a esa hora y deja
 * lo que no tiene horario conocido (nunca se afirma lo que no se sabe); wifi, perros, accesible y
 * licencia exigen el dato.
 */
export function applyFilters(places: readonly SunPlace[], f: ExploreFilters, t: number): SunPlace[] {
  if (!f.open && !f.licensed && !f.wifi && !f.dog && !f.accessible) return [...places];
  return places.filter((p) => {
    const fl = placeFlags(p);
    if (f.licensed && !fl.licensed) return false;
    if (f.wifi && fl.wifi !== true) return false;
    if (f.dog && fl.dog !== true) return false;
    if (f.accessible && fl.accessible !== true) return false;
    if (f.open && isOpenNow(fl.hours, t) === false) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/*  La búsqueda de Explorar                                                    */
/* -------------------------------------------------------------------------- */

export type ExploreWhen =
  /** La hora elegida en la línea de tiempo (o ahora). */
  | { kind: "now" }
  /** Una hora de un día («mañana a las 11», «esta tarde»). */
  | { kind: "at"; dayOffset: number; minutes: number }
  /** Un día entero («el sábado»): el mejor rato entre el amanecer y la puesta. */
  | { kind: "day"; dayOffset: number }
  /** Dentro de un rato («en 30 min»). */
  | { kind: "in"; minutes: number }
  /** La puesta de sol (de hoy o, si ya pasó, de mañana). */
  | { kind: "sunset"; dayOffset: number | null };

export interface ExploreSpec {
  /** Identifica la búsqueda (para no repetirla). */
  key: string;
  source: "home" | "chip" | "query" | "collection";
  chip: ChipId | null;
  collection: string | null;
  /** Sol o sombra; null = el modo de la app (sombra cuando hace calor). */
  mode: SunShadeMode | null;
  /** Tipos de lugar; null = los de la intención. */
  types: SunPlaceType[] | null;
  /** Usa el inventario de locales (bares y cafés con terraza). */
  venues: boolean;
  /** Usa los bancos de la calle (se descargan aparte). */
  benches: boolean;
  when: ExploreWhen;
  durationMinutes: number;
  /** Filtros que trae la propia búsqueda («café abierto con wifi»). */
  filters: Partial<ExploreFilters>;
  /** Preferir sitios con wifi sin excluir los demás (Trabajar). */
  preferWifi: boolean;
  /** Barrio elegido: la búsqueda se centra en él. */
  area: Area | null;
  /** Texto escrito, si viene del buscador. */
  query: string | null;
}

const base = (key: string, patch: Partial<ExploreSpec>): ExploreSpec => ({
  key,
  source: "chip",
  chip: null,
  collection: null,
  mode: null,
  types: null,
  venues: false,
  benches: false,
  when: { kind: "now" },
  durationMinutes: 60,
  filters: {},
  preferWifi: false,
  area: null,
  query: null,
  ...patch,
});

/** «Para ti ahora»: lo mejor cerca para la próxima hora, con el modo de la app. */
export function homeSpec(area: Area | null = null): ExploreSpec {
  return base(`home|${area?.id ?? ""}`, { source: "home", area });
}

const SUNSET_TYPES: SunPlaceType[] = ["viewpoint", "beach", "open_space", "park"];

/** Lo que busca cada chip. */
export function chipSpec(chip: ChipId, area: Area | null = null): ExploreSpec {
  const k = `chip|${chip}|${area?.id ?? ""}`;
  switch (chip) {
    case "sun":
      return base(k, { chip, mode: "sun", area });
    case "shade":
      return base(k, { chip, mode: "shade", area });
    case "terraces":
      return base(k, { chip, types: ["terrace"], venues: true, area });
    case "parks":
      return base(k, { chip, types: ["park"], area });
    case "beach":
      return base(k, { chip, types: ["beach"], area });
    case "kids":
      return base(k, { chip, types: ["playground"], area });
    case "sunset":
      return base(k, { chip, mode: "sun", types: SUNSET_TYPES, when: { kind: "sunset", dayOffset: null }, durationMinutes: 30, area });
    case "work":
      return base(k, { chip, types: ["terrace"], venues: true, durationMinutes: 120, preferWifi: true, area });
    case "dog":
      return base(k, { chip, types: ["park", "open_space"], area });
    case "benches":
      // Un banco al sol (o a la sombra) para la próxima media hora.
      return base(k, { chip, types: ["bench"], benches: true, durationMinutes: 30, area });
  }
}

const FILTER_OF: Record<QueryFilter, keyof ExploreFilters> = { open: "open", wifi: "wifi", accessible: "accessible", licensed: "licensed" };

/** Una búsqueda escrita y entendida → la misma forma que un chip. null si no se entendió nada. */
export function querySpec(q: ParsedQuery): ExploreSpec | null {
  if (!q.understood) return null;
  const types = new Set<SunPlaceType>();
  let venues = false;
  let benches = false;
  let duration = 60;
  let preferWifi = false;
  let mode = q.mode;
  let sunset = false;
  for (const topic of q.topics) {
    switch (topic) {
      case "terrace":
        types.add("terrace");
        venues = true;
        break;
      case "park":
        types.add("park");
        break;
      case "beach":
        types.add("beach");
        break;
      case "kids":
        types.add("playground");
        break;
      case "viewpoint":
        types.add("viewpoint");
        break;
      case "square":
        types.add("square");
        break;
      case "read":
        types.add("park");
        types.add("square");
        duration = 120;
        break;
      case "walk":
        types.add("park");
        types.add("open_space");
        types.add("beach");
        break;
      case "work":
        types.add("terrace");
        venues = true;
        duration = 120;
        preferWifi = true;
        break;
      case "dog":
        types.add("park");
        types.add("open_space");
        break;
      case "shelter":
        types.add("climate_shelter");
        mode = "shade";
        break;
      case "fountain":
        types.add("fountain");
        break;
      case "toilet":
        types.add("toilet");
        break;
      case "bench":
        types.add("bench");
        benches = true;
        duration = 30;
        break;
      case "sunset":
        sunset = true;
        break;
    }
  }
  let when: ExploreWhen = { kind: "now" };
  const t = q.time;
  if (sunset && (!t || t.minutes === null)) {
    when = { kind: "sunset", dayOffset: t ? t.dayOffset : null };
    mode = "sun";
    duration = 30;
    if (types.size === 0) SUNSET_TYPES.forEach((x) => types.add(x));
  } else if (t) {
    const minutes = queryMinutes(t);
    if (t.inMinutes !== null) when = { kind: "in", minutes: t.inMinutes };
    else if (minutes !== null) when = { kind: "at", dayOffset: t.dayOffset, minutes };
    else if (t.dayOffset > 0) when = { kind: "day", dayOffset: t.dayOffset };
  }
  const filters: Partial<ExploreFilters> = {};
  for (const f of q.filters) (filters as Record<string, boolean>)[FILTER_OF[f]] = true;
  return base(`query|${q.raw.trim().toLowerCase()}`, {
    source: "query",
    mode,
    types: types.size ? [...types] : null,
    venues,
    benches,
    when,
    durationMinutes: duration,
    filters,
    preferWifi,
    area: q.area,
    query: q.raw.trim(),
  });
}

/** Modo efectivo de una búsqueda. */
export const specMode = (spec: ExploreSpec, appMode: SunShadeMode): SunShadeMode => spec.mode ?? appMode;

/** Intención del motor para la búsqueda («sombra» invierte la puntuación). */
export function specIntent(spec: ExploreSpec, appMode: SunShadeMode): SunIntent {
  if (specMode(spec, appMode) === "shade") return "shade";
  if (spec.when.kind === "sunset") return "sunset";
  if (spec.venues) return "coffee";
  return "sun";
}

/** Filtros efectivos: los de la hoja más los que trae la búsqueda. */
export function mergeFilters(sheet: ExploreFilters, spec: ExploreSpec): ExploreFilters {
  return { ...sheet, ...spec.filters, maxWalk: spec.filters.maxWalk ?? sheet.maxWalk };
}

export interface SunDayTimes {
  sunrise: number;
  sunset: number;
}

export interface WindowContext {
  now: number;
  /** Hora elegida en la línea de tiempo (null = siguiendo al reloj). */
  selected: number | null;
  /** Orto y ocaso del día `dayOffset` días después de hoy. */
  sunDay(dayOffset: number): SunDayTimes;
}

export interface ExploreWindow {
  start: number;
  end: number;
  minutes: number;
  /** Ya no quedaba sol hoy: la búsqueda es de mañana. */
  movedToTomorrow: boolean;
}

const dayOffsetOf = (t: number, now: number) => Math.round((startOfZoneDay(t) - startOfZoneDay(now)) / DAY);
const floorMin = (t: number) => Math.floor(t / MIN) * MIN;

/**
 * Franja que se analiza: dos horas desde el momento pedido (hasta la puesta si se busca sol). Si el
 * sol ya no da tiempo, primeras horas de mañana. La puesta: los 75 minutos anteriores.
 */
export function exploreWindow(spec: ExploreSpec, mode: SunShadeMode, ctx: WindowContext): ExploreWindow {
  const D = spec.durationMinutes;
  const now = floorMin(ctx.now);

  if (spec.when.kind === "sunset") {
    let off = spec.when.dayOffset ?? 0;
    let sun = ctx.sunDay(off);
    if (spec.when.dayOffset === null && now > sun.sunset - 20 * MIN) {
      off = 1;
      sun = ctx.sunDay(1);
    }
    const start = Math.max(off === 0 ? now : 0, sun.sunset - 75 * MIN);
    const end = sun.sunset;
    return { start, end, minutes: Math.max(10, Math.min(D, Math.round((end - start) / MIN))), movedToTomorrow: off === 1 && spec.when.dayOffset === null };
  }

  if (spec.when.kind === "day") {
    const sun = ctx.sunDay(spec.when.dayOffset);
    const start = sun.sunrise + 30 * MIN;
    const end = mode === "sun" ? sun.sunset : sun.sunset + HOUR;
    return { start, end, minutes: D, movedToTomorrow: false };
  }

  let at: number;
  if (spec.when.kind === "at") {
    at = zonedMs(dayStartFor(ctx.now, spec.when.dayOffset), spec.when.minutes);
    // «Por la mañana» a las 15:00 de hoy: la próxima mañana.
    if (at + D * MIN < ctx.now) at += DAY;
  } else if (spec.when.kind === "in") {
    at = now + spec.when.minutes * MIN;
  } else {
    at = ctx.selected !== null ? floorMin(ctx.selected) : now;
  }
  at = Math.max(at, now);

  const off = dayOffsetOf(at, ctx.now);
  const sun = ctx.sunDay(off);
  if (mode === "sun") {
    if (at < sun.sunrise) at = sun.sunrise + 30 * MIN;
    if (sun.sunset - at < 30 * MIN) {
      // Ya no queda sol ese día: primeras horas del siguiente.
      const next = ctx.sunDay(off + 1);
      const start = next.sunrise + 90 * MIN;
      return { start, end: start + 2 * HOUR, minutes: D, movedToTomorrow: true };
    }
    const end = Math.min(at + Math.max(2 * HOUR, D * MIN), sun.sunset);
    return { start: at, end, minutes: Math.max(10, Math.min(D, Math.round((end - at) / MIN))), movedToTomorrow: false };
  }
  const end = at + Math.max(2 * HOUR, D * MIN);
  return { start: at, end, minutes: D, movedToTomorrow: false };
}

export interface RequestContext {
  mode: SunShadeMode;
  window: ExploreWindow;
  origin: LngLat;
  /** Hay una ubicación real (la persona o el barrio elegido) y no solo el centro de la ciudad. */
  originIsReal: boolean;
  maxWalk: number | null;
  limit?: number;
}

/** La petición del motor para una búsqueda de Explorar. */
export function exploreRequest(spec: ExploreSpec, ctx: RequestContext): SunSearchRequest {
  const intent = specIntent(spec, ctx.mode);
  return {
    startTime: ctx.window.start,
    endTime: ctx.window.end,
    minimumSunlightMinutes: ctx.window.minutes,
    maximumWalkingMinutes: ctx.maxWalk ?? (ctx.originIsReal ? 20 : 30),
    origin: ctx.origin,
    locationType: "any",
    locationTypes: spec.types ?? undefined,
    intent,
    preference: SUN_INTENTS[intent].preference,
    limit: ctx.limit ?? 8,
  };
}

/* -------------------------------------------------------------------------- */
/*  «Para ti»: selección final y porqué                                        */
/* -------------------------------------------------------------------------- */

export interface CurateOptions {
  max?: number;
  /** Dos sitios a menos de esta distancia no salen juntos (variedad). */
  minDistanceM?: number;
  /** Ajuste del gusto aprendido (0,9–1,1) por resultado. */
  taste?: (r: SunSearchResult) => number;
  preferWifi?: boolean;
}

/**
 * De los resultados del motor, los que se enseñan: orden del motor ajustado (como mucho ±10 %) por
 * el gusto aprendido y el wifi si se trabaja; nunca dos a menos de 300 m; como mucho cinco.
 * Ningún pago ni afiliación interviene aquí.
 */
export function curate(results: readonly SunSearchResult[], o: CurateOptions = {}): SunSearchResult[] {
  const max = o.max ?? 5;
  const minD = o.minDistanceM ?? 300;
  const scored = results.map((r, i) => {
    let f = o.taste ? Math.min(1.1, Math.max(0.9, o.taste(r))) : 1;
    if (o.preferWifi && placeFlags(r.place).wifi === true) f *= 1.08;
    return { r, i, v: r.rankingValue * f };
  });
  scored.sort((a, b) => b.v - a.v || a.i - b.i);
  const out: SunSearchResult[] = [];
  for (const { r } of scored) {
    const near = out.some((x) => distanceMeters(x.spot.longitude, x.spot.latitude, r.spot.longitude, r.spot.latitude) < minD);
    if (near) continue;
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

/** Un dato propio del sitio para el porqué: mesas autorizadas, hasta cuándo abre, wifi o accesible. */
export function placeExtra(p: Pick<SunPlace, "metadata">, t: number): string | null {
  const fl = placeFlags(p);
  if (fl.licensed?.tables && fl.licensed.tables > 0) {
    const n = Math.round(fl.licensed.tables);
    return trPlural(n, { one: "why.terraza_con_mesa_one", other: "why.terraza_con_mesas_other" });
  }
  const open = openStateAt(fl.hours, t);
  if (open?.open && open.closesAt !== null) return tr("why.abierto_hasta", { p0: hhmm(open.closesAt) });
  if (fl.wifi) return tr("why.con_wifi");
  if (fl.accessible) return tr("why.accesible");
  return null;
}

export interface WhyContext {
  now: number;
  mode: SunShadeMode;
  sunset?: number;
  /** Mostrar los minutos a pie (solo si se conoce un origen real). */
  showWalk: boolean;
  /** «21 °C al sol» (confort de la zona), si se conoce. */
  comfort?: string | null;
}

/**
 * El porqué de una tarjeta, en piezas cortas: «Sol hasta las 17:40 · 6 min a pie · 21 °C al sol ·
 * terraza con 8 mesas».
 */
export function whyParts(r: SunSearchResult, ctx: WhyContext): string[] {
  const parts = [nearbyLine(r, ctx.now, ctx.mode, { sunset: ctx.sunset }).text];
  if (ctx.showWalk && r.walking) parts.push(tr("why.min_a_pie", { p0: r.walking.durationMinutes }));
  if (ctx.comfort) parts.push(ctx.comfort);
  const extra = placeExtra(r.place, Math.max(ctx.now, r.searchWindow.start));
  if (extra) parts.push(extra);
  return parts;
}

/** El lugar más cercano de un tipo (refugio climático, lavabo…) a menos de `maxM` metros. */
export function nearestOfType(
  places: readonly SunPlace[],
  type: SunPlaceType,
  lat: number,
  lng: number,
  maxM = Infinity
): { place: SunPlace; meters: number } | null {
  let best: { place: SunPlace; meters: number } | null = null;
  for (const p of places) {
    if (p.type !== type) continue;
    const d = distanceMeters(lng, lat, p.longitude, p.latitude);
    if (d <= maxM && (!best || d < best.meters)) best = { place: p, meters: d };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  Colecciones del momento                                                    */
/* -------------------------------------------------------------------------- */

export interface CollectionDef {
  id: string;
  mode: SunShadeMode;
  types: SunPlaceType[];
  venues: boolean;
  when: ExploreWhen;
  durationMinutes: number;
  /** Meses en los que tiene sentido (1–12). */
  months: readonly number[];
  /** Horas locales en las que se ofrece [desde, hasta). */
  hours: readonly [number, number];
  /** Solo con calor / solo sin calor. */
  needs?: "hot" | "mild";
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const COLD = [1, 2, 3, 4, 10, 11, 12];
const WARM = [5, 6, 7, 8, 9];

/** Catálogo editorial: se elige solo por estación, hora y calor (arranque en frío sin datos). */
export const COLLECTIONS: readonly CollectionDef[] = [
  { id: "breakfast", mode: "sun", types: ["terrace"], venues: true, when: { kind: "at", dayOffset: 0, minutes: 9 * 60 + 30 }, durationMinutes: 60, months: COLD, hours: [6, 11] },
  { id: "terraces-late", mode: "sun", types: ["terrace"], venues: true, when: { kind: "at", dayOffset: 0, minutes: 17 * 60 }, durationMinutes: 60, months: ALL_MONTHS, hours: [10, 18], needs: "mild" },
  { id: "kids-shade", mode: "shade", types: ["playground"], venues: false, when: { kind: "now" }, durationMinutes: 60, months: WARM, hours: [9, 20] },
  { id: "kids-sun", mode: "sun", types: ["playground"], venues: false, when: { kind: "now" }, durationMinutes: 60, months: COLD, hours: [9, 17] },
  { id: "sunsets", mode: "sun", types: SUNSET_TYPES, venues: false, when: { kind: "sunset", dayOffset: null }, durationMinutes: 30, months: ALL_MONTHS, hours: [0, 24] },
  { id: "lunch", mode: "sun", types: ["terrace"], venues: true, when: { kind: "at", dayOffset: 0, minutes: 13 * 60 + 30 }, durationMinutes: 60, months: COLD, hours: [10, 14] },
  { id: "cool-refuges", mode: "shade", types: ["climate_shelter", "fountain"], venues: false, when: { kind: "now" }, durationMinutes: 60, months: WARM, hours: [11, 20], needs: "hot" },
  { id: "shade-walks", mode: "shade", types: ["park", "open_space"], venues: false, when: { kind: "now" }, durationMinutes: 60, months: WARM, hours: [9, 20] },
  { id: "beach-early", mode: "sun", types: ["beach"], venues: false, when: { kind: "at", dayOffset: 0, minutes: 8 * 60 + 30 }, durationMinutes: 90, months: [6, 7, 8, 9], hours: [6, 23] },
  { id: "beach-winter", mode: "sun", types: ["beach"], venues: false, when: { kind: "now" }, durationMinutes: 60, months: [11, 12, 1, 2, 3], hours: [9, 16] },
  { id: "read-square", mode: "sun", types: ["square", "park"], venues: false, when: { kind: "now" }, durationMinutes: 90, months: COLD, hours: [10, 17] },
  { id: "views-afternoon", mode: "sun", types: ["viewpoint"], venues: false, when: { kind: "at", dayOffset: 0, minutes: 16 * 60 + 30 }, durationMinutes: 60, months: ALL_MONTHS, hours: [9, 17] },
];

/** Las colecciones de este momento (como mucho `max`), en el orden del catálogo. */
export function collectionsFor(ctx: { month: number; hour: number; hot: boolean }, max = 4): CollectionDef[] {
  return COLLECTIONS.filter(
    (c) =>
      c.months.includes(ctx.month) &&
      ctx.hour >= c.hours[0] &&
      ctx.hour < c.hours[1] &&
      (c.needs !== "hot" || ctx.hot) &&
      (c.needs !== "mild" || !ctx.hot)
  ).slice(0, max);
}

/** La búsqueda de una colección. */
export function collectionSpec(c: CollectionDef, area: Area | null = null): ExploreSpec {
  return base(`collection|${c.id}|${area?.id ?? ""}`, {
    source: "collection",
    collection: c.id,
    mode: c.mode,
    types: c.types,
    venues: c.venues,
    when: c.when,
    durationMinutes: c.durationMinutes,
    area,
  });
}
