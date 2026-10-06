import { useMediaQuery } from "../../hooks/useMediaQuery";

/**
 * Estrategia de diseño por dispositivo (no es «CSS de escritorio + CSS móvil»):
 *
 *   móvil       mapa + barra de navegación inferior + hojas inferiores
 *   tableta     barra lateral compacta + mapa + un panel flotante a la vez
 *   escritorio  barra lateral (plegable) + mapa + panel de la vista + panel de detalle
 */

export type Device = "mobile" | "tablet" | "desktop";

export const LAYOUT = {
  gap: 12,
  sidebarExpanded: 216,
  sidebarCompact: 64,
  panelWidth: 360,
  panelWidthTablet: 336,
  detailWidth: 340,
  /** Columna de controles del mapa (botón de 44 px + márgenes). */
  controlsWidth: 72,
  /** Altura reservada a la línea de tiempo en escritorio. */
  timelineHeight: 132,
  /** Altura del acceso compacto cuando la línea de tiempo está oculta. */
  timelineCollapsedHeight: 68,
  mobileHeader: 52,
  mobileNav: 64,
} as const;

export function useDevice(): Device {
  const mobile = useMediaQuery("(max-width: 639px)");
  const desktop = useMediaQuery("(min-width: 1024px)");
  return mobile ? "mobile" : desktop ? "desktop" : "tablet";
}

/** ¿Caben a la vez el panel de la vista y el de detalle? */
export function useWideLayout(): boolean {
  return useMediaQuery("(min-width: 1180px)");
}
