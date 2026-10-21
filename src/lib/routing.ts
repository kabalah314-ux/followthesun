/**
 * Rutas de Follow the Sun. Todas comparten el MISMO mapa: cambiar de ruta solo cambia el panel
 * contextual, nunca desmonta el mapa.
 *
 *   /          Explorar
 *   /find      Find the Sun
 *   /plan      Planificar
 *   /places    Lugares
 *   /saved     Guardados
 *   /settings  Ajustes
 *   /about     Acerca de
 *
 * Enlaces profundos (ver `deepLinks.ts`), que no son vistas: `/mapa` (alias de Explorar) y
 * `/lugar/<slug>` (la ficha de un lugar, sobre Explorar).
 *
 * Modo «path» (rutas limpias, History API) por defecto. Modo «hash» (#/find) cuando la app se
 * abre como archivo (`file:`), desde una ruta que termina en `.html`, o con `VITE_ROUTER_MODE=hash`
 * (para servidores estáticos sin redirección de rutas desconocidas a index.html).
 */

export type AppView = "explore" | "find" | "plan" | "places" | "recommended" | "saved" | "settings" | "about";

export const APP_VIEWS: AppView[] = [
  "explore",
  "find",
  "plan",
  "places",
  "recommended",
  "saved",
  "settings",
  "about",
];

const SEGMENT: Record<AppView, string> = {
  explore: "",
  find: "find",
  plan: "plan",
  places: "places",
  recommended: "recomendados",
  saved: "saved",
  settings: "settings",
  about: "about",
};

const fromSegment = (s: string): AppView | null =>
  (APP_VIEWS.find((v) => SEGMENT[v] === s && s !== "") as AppView | undefined) ?? null;

type Mode = "path" | "hash";

interface RouterBase {
  mode: Mode;
  /** Prefijo de la app (termina en "/"), p. ej. "/" o "/follow-the-sun/". */
  base: string;
}

/** Final de ruta de un enlace profundo: `/lugar/<slug>` o `/mapa`. */
const DEEP_TAIL = /(?:lugar\/[^/]+|mapa)\/?$/;

function detect(): RouterBase {
  const forced = (import.meta.env.VITE_ROUTER_MODE as string | undefined)?.trim();
  const { protocol } = window.location;
  if (forced === "hash" || protocol === "file:" || window.location.pathname.endsWith(".html")) {
    return { mode: "hash", base: window.location.pathname };
  }
  // El prefijo de la app se calcula sin el enlace profundo (si no, `/lugar/x/` sería la base).
  const pathname = window.location.pathname.replace(DEEP_TAIL, "");
  const parts = pathname.split("/");
  const last = parts[parts.length - 1] || parts[parts.length - 2] || "";
  const base = fromSegment(last)
    ? pathname.slice(0, pathname.lastIndexOf(last))
    : pathname.endsWith("/")
      ? pathname
      : `${pathname}/`;
  return { mode: "path", base };
}

let router: RouterBase | null = null;
const getRouter = () => (router ??= detect());

/** Vista que indica la URL actual. */
export function parseLocation(): AppView {
  const r = getRouter();
  const hash = window.location.hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  if (hash) return fromSegment(hash) ?? "explore";
  if (r.mode === "hash") return "explore";
  const rest = window.location.pathname.slice(r.base.length).replace(/\/+$/, "");
  return fromSegment(rest) ?? "explore";
}

/** URL de una vista (conserva la query, p. ej. `?debug=weather`). */
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
    return r.mode === "hash" ? `${r.base}${search}` : `${r.base}lugar/${encodeURIComponent(target.slug)}${search}`;
  }
  const seg = SEGMENT[target.view];
  if (r.mode === "hash") return `${r.base}${search}${seg ? `#/${seg}` : ""}`;
  return `${r.base}${seg}${search}`;
}
