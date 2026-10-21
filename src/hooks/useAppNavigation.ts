import { useCallback, useEffect, useState } from "react";
import { buildUrl, parseLocation, parseRoute, type AppView } from "../lib/routing";

export type { AppView } from "../lib/routing";

/**
 * Vistas que abren un panel contextual a la izquierda (o una hoja inferior en móvil). «Ahora» es
 * un panel en escritorio y tableta; en móvil se resuelve con la tarjeta y una tira de sitios.
 */
export const PANEL_VIEWS: ReadonlySet<AppView> = new Set([
  "now",
  "find",
  "plan",
  "places",
  "recommended",
  "saved",
  "settings",
  "about",
]);

export interface AppNavigation {
  view: AppView;
  navigate(view: AppView): void;
}

/**
 * Estado de navegación ÚNICO de la app, sincronizado con la URL (atrás/adelante del navegador
 * funcionan). Navegar nunca desmonta el mapa: solo cambia la vista. Las rutas antiguas se
 * sustituyen por la nueva al cargar, conservando la query.
 */
export function useAppNavigation(): AppNavigation {
  const [view, setView] = useState<AppView>(() => parseLocation());

  useEffect(() => {
    const route = parseRoute();
    if (route.legacy) {
      try {
        window.history.replaceState(window.history.state, "", buildUrl(route.view));
      } catch {
        /* sin History API: la vista ya es la correcta */
      }
    }
    const onPop = () => setView(parseLocation());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const navigate = useCallback((next: AppView) => {
    setView((current) => {
      if (current !== next) {
        try {
          window.history.pushState({ view: next }, "", buildUrl(next));
        } catch {
          /* entornos sin History API: la vista cambia igualmente */
        }
      }
      return next;
    });
  }, []);

  return { view, navigate };
}
