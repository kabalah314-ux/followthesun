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

function detect(): RouterBase {
  const forced = (import.meta.env.VITE_ROUTER_MODE as string | undefined)?.trim();
  const { protocol, pathname } = window.location;
  if (forced === "hash" || protocol === "file:" || pathname.endsWith(".html")) {
    return { mode: "hash", base: pathname };
  }
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
  const r = getRouter();
  const search = window.location.search;
  if (r.mode === "hash") return `${r.base}${search}${SEGMENT[view] ? `#/${SEGMENT[view]}` : ""}`;
  return `${r.base}${SEGMENT[view]}${search}`;
}
