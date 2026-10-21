/**
 * Rutas de I Follow the Sun. Todas comparten el MISMO mapa: cambiar de ruta solo cambia el panel
 * contextual, nunca desmonta el mapa.
 *
 * Cuatro destinos principales (guía maestra, «Arquitectura de la información»):
 *
 *   /                      Ahora       (respuesta + «Cerca de ti ahora»)
 *   /mapa                  Mapa        (sol y sombra a cualquier hora)
 *   /buscar                Buscar      (pestaña Ahora; ?pestana=mas-tarde | lugares | sorprendeme)
 *   /mis-sitios            Mis sitios
 *   /ajustes · /acerca-de  Ajustes y Acerca de
 *   /lugar/<slug>          ficha de un lugar, sobre el Mapa (ver `deepLinks.ts`)
 *
 * Las rutas antiguas (/find, /plan, /places, /recomendados, /saved, /settings, /about) se siguen
 * entendiendo y se redirigen a la nueva conservando la query (`?hora=…&dia=…&debug=…`).
 *
 * Modo «path» (rutas limpias, History API) por defecto. Modo «hash» (#/buscar) cuando la app se
 * abre como archivo (`file:`), desde una ruta que termina en `.html`, o con `VITE_ROUTER_MODE=hash`
 * (para servidores estáticos sin redirección de rutas desconocidas a index.html).
 */

export type AppView =
  | "now"
  | "explore"
  | "find"
  | "plan"
  | "places"
  | "recommended"
  | "saved"
  | "settings"
  | "about";

export const APP_VIEWS: AppView[] = [
  "now",
  "explore",
  "find",
  "plan",
  "places",
  "recommended",
  "saved",
  "settings",
  "about",
];

/** Los cuatro destinos de la navegación principal. */
export type Destination = "now" | "map" | "search" | "mine";

/** Vistas que son pestañas de Buscar, en su orden. */
export type SearchView = "find" | "plan" | "places" | "recommended";
export const SEARCH_VIEWS: readonly SearchView[] = ["find", "plan", "places", "recommended"];

export const isSearchView = (v: AppView): v is SearchView => (SEARCH_VIEWS as readonly AppView[]).includes(v);

/** Destino al que pertenece una vista (null: Ajustes y Acerca de, fuera de los cuatro). */
export function destinationOf(view: AppView): Destination | null {
  if (view === "now") return "now";
  if (view === "explore") return "map";
  if (view === "saved") return "mine";
  if (isSearchView(view)) return "search";
  return null;
}

/** Valor de `?pestana=` de cada pestaña de Buscar. La primera (Ahora) no se escribe en la URL. */
export const SEARCH_TAB: Record<SearchView, string> = {
  find: "ahora",
  plan: "mas-tarde",
  places: "lugares",
  recommended: "sorprendeme",
};

const SEGMENT: Record<AppView, string> = {
  now: "",
  explore: "mapa",
  find: "buscar",
  plan: "buscar",
  places: "buscar",
  recommended: "buscar",
  saved: "mis-sitios",
  settings: "ajustes",
  about: "acerca-de",
};

/** Rutas antiguas → vista. Se redirigen a la ruta nueva. */
const LEGACY: Record<string, AppView> = {
  find: "find",
  plan: "plan",
  places: "places",
  recomendados: "recommended",
  recommended: "recommended",
  saved: "saved",
  settings: "settings",
  about: "about",
};

/** Segmentos que no forman parte del prefijo de la app (para detectar ese prefijo). */
const APP_SEGMENTS = new Set(["mapa", "buscar", "mis-sitios", "ajustes", "acerca-de", ...Object.keys(LEGACY)]);

export interface RouteMatch {
  view: AppView;
  /** true: ruta antigua; hay que redirigir a la nueva. */
  legacy: boolean;
}

function tabView(tab: string | null): SearchView {
  const hit = SEARCH_VIEWS.find((v) => SEARCH_TAB[v] === tab);
  return hit ?? "find";
}

/**
 * Vista de una ruta relativa al prefijo de la app («», «buscar», «lugar/slug»…) y de su
 * `?pestana=`. Función pura. null: ruta desconocida.
 */
export function matchRoute(rest: string, tab: string | null): RouteMatch | null {
  const seg = rest.replace(/^\/+/, "").split("/")[0] ?? "";
  switch (seg) {
    case "":
      return { view: "now", legacy: false };
    case "mapa":
    case "lugar":
      return { view: "explore", legacy: false };
    case "buscar":
      return { view: tabView(tab), legacy: false };
    case "mis-sitios":
      return { view: "saved", legacy: false };
    case "ajustes":
      return { view: "settings", legacy: false };
    case "acerca-de":
      return { view: "about", legacy: false };
  }
  const old = LEGACY[seg];
  return old ? { view: old, legacy: true } : null;
}

/** La query con el `pestana` que corresponde a la vista (o sin él), sin tocar el resto. Pura. */
export function searchForView(search: string, view: AppView): string {
  const params = new URLSearchParams(search);
  const tab = isSearchView(view) && view !== "find" ? SEARCH_TAB[view] : null;
  if (tab) params.set("pestana", tab);
  else params.delete("pestana");
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
  const tab = new URLSearchParams(window.location.search).get("pestana");
  const hash = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (hash) return matchRoute(hash, tab) ?? { view: "now", legacy: false };
  if (r.mode === "hash") return { view: "now", legacy: false };
  const rest = window.location.pathname.slice(r.base.length);
  return matchRoute(rest, tab) ?? { view: "now", legacy: false };
}

/** Vista que indica la URL actual. */
export function parseLocation(): AppView {
  return parseRoute().view;
}

/** URL de una vista (conserva la query, p. ej. `?debug=weather` o `?hora=…`). */
export function buildUrl(view: AppView): string {
  return urlWith({ view }, window.location.search);
}

/**
 * URL (sin origen) de una vista o de la ficha de un lugar con la query dada. En modo «hash» no hay
 * rutas de lugar: se queda en la vista principal con la query.
 */
export function urlWith(target: { view: AppView } | { slug: string }, search: string): string {
  const r = getRouter();
  if ("slug" in target) {
    const q = searchForView(search, "explore");
    return r.mode === "hash" ? `${r.base}${q}` : `${r.base}lugar/${encodeURIComponent(target.slug)}${q}`;
  }
  const q = searchForView(search, target.view);
  const seg = SEGMENT[target.view];
  if (r.mode === "hash") return `${r.base}${q}${seg ? `#/${seg}` : ""}`;
  return `${r.base}${seg}${q}`;
}
