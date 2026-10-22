import { useCallback, useEffect, useState } from "react";
import { buildUrl, parseRoute, tabBelongs, type AppView, type ViewTab } from "../lib/routing";

export type { AppView, ViewTab } from "../lib/routing";

export interface AppNavigation {
  view: AppView;
  /** Sección de Planes o de Mis sitios (null en las demás vistas). */
  tab: ViewTab | null;
  /** Ir a una vista (y sección). Sin sección: la última de esa vista o la de por defecto. */
  navigate(view: AppView, tab?: ViewTab | null): void;
}

interface NavState {
  view: AppView;
  tab: ViewTab | null;
}

/**
 * Estado de navegación ÚNICO de la app, sincronizado con la URL (atrás/adelante del navegador
 * funcionan). Navegar nunca desmonta el mapa: solo cambia la hoja. Las rutas antiguas se
 * sustituyen por la nueva al cargar, conservando la query.
 */
export function useAppNavigation(): AppNavigation {
  const [state, setState] = useState<NavState>(() => {
    const r = parseRoute();
    return { view: r.view, tab: r.tab };
  });
  // Última sección visitada de cada destino (volver a Planes devuelve a donde se estaba).
  const [lastTab] = useState(() => new Map<AppView, ViewTab>());

  useEffect(() => {
    const route = parseRoute();
    if (route.legacy) {
      try {
        window.history.replaceState(window.history.state, "", buildUrl(route.view, route.tab));
      } catch {
        /* sin History API: la vista ya es la correcta */
      }
    }
    const onPop = () => {
      const r = parseRoute();
      setState({ view: r.view, tab: r.tab });
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  useEffect(() => {
    if (state.tab) lastTab.set(state.view, state.tab);
  }, [state, lastTab]);

  const navigate = useCallback(
    (view: AppView, tab?: ViewTab | null) => {
      setState((current) => {
        const wanted = tab !== undefined && tab !== null && tabBelongs(view, tab) ? tab : (lastTab.get(view) ?? null);
        const next: NavState = { view, tab: view === "plans" || view === "mine" ? (wanted ?? (view === "plans" ? "route" : "lists")) : null };
        if (current.view !== next.view || current.tab !== next.tab) {
          try {
            window.history.pushState({ view: next.view, tab: next.tab }, "", buildUrl(next.view, next.tab));
          } catch {
            /* entornos sin History API: la vista cambia igualmente */
          }
          return next;
        }
        return current;
      });
    },
    [lastTab]
  );

  return { view: state.view, tab: state.tab, navigate };
}
