import { useEffect, useRef } from "react";
import { placeSlug, readDeepLink, withTimeQuery, type PlaceLinkRef } from "../lib/deepLinks";
import { urlWith, type AppView } from "../lib/routing";
import type { SunPlace } from "../types";
import { tr } from "../i18n";

interface Options {
  /** El mapa está listo: antes no se puede volar ni abrir una ficha. */
  ready: boolean;
  view: AppView;
  /** Instante elegido en la línea de tiempo; null = «ahora». */
  chosenTime: number | null;
  /** Lugar con la ficha abierta. */
  place: Pick<SunPlace, "id" | "name"> | null;
  showTimeAt(t: number): void;
  flyTo(lng: number, lat: number, zoom?: number): void;
  /** Abre la ficha del lugar; false si ya no existe. */
  openPlace(ref: PlaceLinkRef): Promise<boolean>;
  onToast(message: string): void;
}

/**
 * Enlaces profundos (ver `lib/deepLinks.ts`):
 *  1. Al cargar, aplica lo que trae la URL: ficha de un lugar, hora y día, centro y zoom.
 *  2. Después, la URL refleja la ficha abierta y la hora elegida con `replaceState` (no llena el
 *     historial), para que copiar la dirección comparta exactamente lo que se ve.
 */
export function useDeepLink(o: Options) {
  const opts = useRef(o);
  opts.current = o;
  const consumed = useRef(false);
  /** Mientras se abre la ficha del enlace, la URL no se toca. */
  const restoring = useRef(false);

  useEffect(() => {
    if (!o.ready || consumed.current) return;
    consumed.current = true;
    const link = readDeepLink(window.location.pathname, window.location.search, Date.now());
    if (link.view) opts.current.flyTo(link.view.lng, link.view.lat, link.view.zoom);
    if (link.place) {
      restoring.current = true;
      void opts.current
        .openPlace(link.place)
        .catch(() => false)
        .then((ok) => {
          restoring.current = false;
          if (!ok) opts.current.onToast(tr("useDeepLink.no_encontramos_ese_lugar_te"));
          else if (link.time != null) opts.current.showTimeAt(link.time);
        });
    } else if (link.time != null) {
      opts.current.showTimeAt(link.time);
    }
  }, [o.ready]);

  const slug = o.place ? placeSlug(o.place) : null;
  const { view, chosenTime } = o;
  useEffect(() => {
    if (!consumed.current || restoring.current) return;
    const timer = window.setTimeout(() => {
      const search = withTimeQuery(window.location.search, chosenTime);
      const next = slug ? urlWith({ slug }, search) : urlWith({ view }, search);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (next === current) return;
      try {
        window.history.replaceState(window.history.state, "", next);
      } catch {
        /* sin History API */
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [slug, view, chosenTime]);
}
