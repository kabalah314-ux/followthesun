/**
 * Rutas de I Follow the Sun (guía maestra 2, «Nueva navegación y menú»). Todas comparten el MISMO
 * mapa: cambiar de ruta solo cambia la hoja (o el panel), nunca desmonta el mapa.
 *
 * Tres destinos:
 *
 *   /                      Explorar    (mapa, buscador universal, chips, «Para ti» y ficha)
 *   /planes                Planes      (?vista=ruta | semana | mas-tarde | grupo | alertas)
 *   /mis-sitios            Mis sitios  (?vista=listas | mi-casa | historial)
 *   /ajustes · /acerca-de  desde el icono de perfil del buscador
 *   /lugar/<slug>          ficha de un lugar, sobre Explorar (ver `deepLinks.ts`)
 *
 * Las rutas antiguas se siguen entendiendo y se sustituyen por la nueva conservando la query
 * (`?hora=…&dia=…&c=…&z=…&debug=…`):
 *
 *   /mapa · /buscar · /find · /places · /recomendados   →  /
 *   /buscar?pestana=mas-tarde · /plan                   →  /planes?vista=mas-tarde
 *   /saved → /mis-sitios · /settings → /ajustes · /about → /acerca-de
 *
 * Modo «path» (rutas limpias, History API) por defecto. Modo «hash» (#/planes) cuando la app se
 * abre como archivo (`file:`), desde una ruta que termina en `.html`, o con `VITE_ROUTER_MODE=hash`
 * (para servidores estáticos sin redirección de rutas desconocidas a index.html).
 */

export type AppView = "explore" | "plans" | "mine" | "settings" | "about";

export const APP_VIEWS: readonly AppView[] = ["explore", "plans", "mine", "settings", "about"];

/** Los tres destinos de la navegación principal. */
export type Destination = "explore" | "plans" | "mine";
export const DESTINATIONS: readonly Destination[] = ["explore", "plans", "mine"];

/** Secciones de Planes, en el orden en que se ofrecen. */
export type PlansTab = "route" | "week" | "later" | "group" | "alerts";
export const PLANS_TABS: readonly PlansTab[] = ["route", "week", "later", "group", "alerts"];

/** Secciones de Mis sitios. */
export type MineTab = "lists" | "home" | "history";
export const MINE_TABS: readonly MineTab[] = ["lists", "home", "history"];

export type ViewTab = PlansTab | MineTab;

export const isDestination = (v: AppView): v is Destination => (DESTINATIONS as readonly AppView[]).includes(v);

/** Destino al que pertenece una vista (null: Ajustes y Acerca de, fuera de los tres). */
export function destinationOf(view: AppView): Destination | null {
  return isDestination(view) ? view : null;
}

/** Valor de `?vista=` de cada sección. */
export const TAB_PARAM: Record<ViewTab, string> = {
  route: "ruta",
  week: "semana",
  later: "mas-tarde",
  group: "grupo",
  alerts: "alertas",
  lists: "listas",
  home: "mi-casa",
  history: "historial",
};

/** Sección por defecto de cada destino con secciones (no se escribe en la URL). */
export const DEFAULT_TAB: { plans: PlansTab; mine: MineTab } = { plans: "route", mine: "lists" };

/** Sección de una vista a partir de `?vista=` (la de por defecto si falta o no se reconoce). */
export function tabFromParam(view: AppView, param: string | null): ViewTab | null {
  if (view === "plans") return PLANS_TABS.find((t) => TAB_PARAM[t] === param) ?? DEFAULT_TAB.plans;
  if (view === "mine") return MINE_TABS.find((t) => TAB_PARAM[t] === param) ?? DEFAULT_TAB.mine;
  return null;
}

/** La sección tiene sentido en esa vista (las de Planes en Planes, las de Mis sitios en Mis sitios). */
export function tabBelongs(view: AppView, tab: ViewTab | null | undefined): boolean {
  if (!tab) return false;
  if (view === "plans") return (PLANS_TABS as readonly ViewTab[]).includes(tab);
  if (view === "mine") return (MINE_TABS as readonly ViewTab[]).includes(tab);
  return false;
}

const SEGMENT: Record<AppView, string> = {
  explore: "",
  plans: "planes",
  mine: "mis-sitios",
  settings: "ajustes",
  about: "acerca-de",
};

/** Rutas antiguas → vista y sección. Se redirigen a la ruta nueva. */
const LEGACY: Record<string, { view: AppView; tab: ViewTab | null }> = {
  mapa: { view: "explore", tab: null },
  find: { view: "explore", tab: null },
  places: { view: "explore", tab: null },
  recomendados: { view: "explore", tab: null },
  recommended: { view: "explore", tab: null },
  plan: { view: "plans", tab: "later" },
  saved: { view: "mine", tab: "lists" },
  settings: { view: "settings", tab: null },
  about: { view: "about", tab: null },
};

/** Segmentos que no forman parte del prefijo de la app (para detectar ese prefijo). */
const APP_SEGMENTS = new Set(["buscar", "planes", "mis-sitios", "ajustes", "acerca-de", ...Object.keys(LEGACY)]);

export interface RouteMatch {
  view: AppView;
  tab: ViewTab | null;
  /** true: ruta antigua; hay que redirigir a la nueva. */
  legacy: boolean;
}

/**
 * Vista de una ruta relativa al prefijo de la app («», «planes», «lugar/slug»…) y de su query.
 * Función pura. null: ruta desconocida.
 */
export function matchRoute(rest: string, search = ""): RouteMatch | null {
  const q = new URLSearchParams(search);
  const seg = rest.replace(/^\/+/, "").split("/")[0] ?? "";
  switch (seg) {
    case "":
    case "lugar":
      return { view: "explore", tab: null, legacy: false };
    case "planes":
      return { view: "plans", tab: tabFromParam("plans", q.get("vista")), legacy: false };
    case "mis-sitios":
      return { view: "mine", tab: tabFromParam("mine", q.get("vista")), legacy: false };
    case "ajustes":
      return { view: "settings", tab: null, legacy: false };
    case "acerca-de":
      return { view: "about", tab: null, legacy: false };
    case "buscar":
      // Buscar tenía cuatro pestañas: «Más tarde» vive ahora en Planes; el resto, en Explorar.
      return q.get("pestana") === "mas-tarde"
        ? { view: "plans", tab: "later", legacy: true }
        : { view: "explore", tab: null, legacy: true };
  }
  const old = LEGACY[seg];
  return old ? { ...old, legacy: true } : null;
}

/**
 * La query que corresponde a una vista sin tocar el resto de parámetros: escribe `vista` para una
 * sección que no es la de por defecto, quita la `pestana` de la versión anterior y solo conserva
 * el plan en grupo (`g`) en su sección. Pura.
 */
export function searchFor(search: string, view: AppView, tab: ViewTab | null = null): string {
  const params = new URLSearchParams(search);
  params.delete("pestana");
  const t = tabBelongs(view, tab) ? tab : null;
  const isDefault = t !== null && ((view === "plans" && t === DEFAULT_TAB.plans) || (view === "mine" && t === DEFAULT_TAB.mine));
  if (t && !isDefault) params.set("vista", TAB_PARAM[t]);
  else params.delete("vista");
  if (!(view === "plans" && t === "group")) params.delete("g");
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Ruta (sin prefijo ni query) de una vista. Pura. */
export function pathOf(view: AppView): string {
  return SEGMENT[view];
}

type Mode = "path" | "hash";

interface RouterBase {
  mode: Mode;
  /** Prefijo de la app (termina en "/"), p. ej. "/" o "/follow-the-sun/". */
  base: string;
}

function detect(): RouterBase {
  const forced = (import.meta.env.VITE_ROUTER_MODE as string | undefined)?.trim();
  const { protocol } = window.location;
  if (forced === "hash" || protocol === "file:" || window.location.pathname.endsWith(".html")) {
    return { mode: "hash", base: window.location.pathname };
  }
  // El prefijo se calcula sin la ficha de lugar (si no, `/lugar/x/` sería la base).
  const pathname = window.location.pathname.replace(/lugar\/[^/]+\/?$/, "");
  const parts = pathname.split("/");
  const last = parts[parts.length - 1] || parts[parts.length - 2] || "";
  const base = APP_SEGMENTS.has(last)
    ? pathname.slice(0, pathname.lastIndexOf(last))
    : pathname.endsWith("/")
      ? pathname
      : `${pathname}/`;
  return { mode: "path", base };
}

let router: RouterBase | null = null;
const getRouter = () => (router ??= detect());

/** Vista que indica la URL actual y si es una ruta antigua. */
export function parseRoute(): RouteMatch {
  const r = getRouter();
  const search = window.location.search;
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const fallback: RouteMatch = { view: "explore", tab: null, legacy: false };
  if (hash) return matchRoute(hash, search) ?? fallback;
  if (r.mode === "hash") return fallback;
  const rest = window.location.pathname.slice(r.base.length);
  return matchRoute(rest, search) ?? fallback;
}

/** URL de una vista (conserva la query, p. ej. `?debug=weather` o `?hora=…`). */
export function buildUrl(view: AppView, tab: ViewTab | null = null): string {
  return urlWith({ view, tab }, window.location.search);
}

/**
 * URL (sin origen) de una vista o de la ficha de un lugar con la query dada. En modo «hash» no hay
 * rutas de lugar: se queda en Explorar con la query.
 */
export function urlWith(target: { view: AppView; tab?: ViewTab | null } | { slug: string }, search: string): string {
  const r = getRouter();
  if ("slug" in target) {
    const q = searchFor(search, "explore");
    return r.mode === "hash" ? `${r.base}${q}` : `${r.base}lugar/${encodeURIComponent(target.slug)}${q}`;
  }
  const q = searchFor(search, target.view, target.tab ?? null);
  const seg = SEGMENT[target.view];
  if (r.mode === "hash") return `${r.base}${q}${seg ? `#/${seg}` : ""}`;
  return `${r.base}${seg}${q}`;
}

/** Dirección absoluta de la app con una vista y una query (enlaces para compartir). */
export function absoluteUrl(target: { view: AppView; tab?: ViewTab | null }, search: string): string {
  return `${window.location.origin}${urlWith(target, search)}`;
}
