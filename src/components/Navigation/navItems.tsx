import { CalendarClock, Compass, Heart, Info, MapPin, Search, Settings, Shuffle } from "../LineIcons";
import type { ReactNode } from "react";
import { destinationOf, type AppView } from "../../lib/routing";
import { tr } from "../../i18n";

/**
 * Icono del Sol de Follow the Sun para «Find the Sun»: disco + arco de trayectoria, con el mismo
 * trazo fino que el resto de iconos.
 */
export function SunTrackIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3.5 17.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.2 2.8" opacity="0.6" />
      <path d="M2.5 17.5h19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="3.1" fill="currentColor" />
    </svg>
  );
}

export interface NavItemDef {
  view: AppView;
  label: string;
  /** Qué hace, en una frase (texto de ayuda / tooltip). */
  hint: string;
  icon: (size: number) => ReactNode;
}

const stroke = { strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

export const NAV_ITEMS: Record<AppView, NavItemDef> = {
  now: {
    view: "now",
    label: tr("findSunPanel.ahora"),
    hint: tr("navItems.tu_sol_o_tu_sombra"),
    icon: (s) => <SunTrackIcon size={s} />,
  },
  explore: {
    view: "explore",
    label: tr("layerControl.mapa"),
    hint: tr("navItems.sol_y_sombra_a_cualquier"),
    icon: (s) => <Compass size={s} {...stroke} />,
  },
  find: {
    view: "find",
    label: tr("app.buscar"),
    hint: tr("navItems.sitios_con_sol_o_sombra"),
    icon: (s) => <Search size={s} {...stroke} />,
  },
  plan: {
    view: "plan",
    label: tr("navItems.mas_tarde"),
    hint: tr("navItems.elige_dia_y_franja"),
    icon: (s) => <CalendarClock size={s} {...stroke} />,
  },
  places: {
    view: "places",
    label: tr("searchProgress.lugares"),
    hint: tr("navItems.los_mejores_sitios_de_hoy"),
    icon: (s) => <MapPin size={s} {...stroke} />,
  },
  recommended: {
    view: "recommended",
    label: tr("navItems.sorprendeme"),
    hint: tr("navItems.nueve_sitios_para_descubrir"),
    icon: (s) => <Shuffle size={s} {...stroke} />,
  },
  saved: {
    view: "saved",
    label: tr("navItems.mis_sitios"),
    hint: tr("navItems.tus_sitios_guardados"),
    icon: (s) => <Heart size={s} {...stroke} />,
  },
  settings: {
    view: "settings",
    label: tr("navItems.ajustes"),
    hint: tr("navItems.unidades_mapa_y_privacidad"),
    icon: (s) => <Settings size={s} {...stroke} />,
  },
  about: {
    view: "about",
    label: tr("aboutPanel.acerca_de"),
    hint: tr("navItems.datos_precision_y_limites"),
    icon: (s) => <Info size={s} {...stroke} />,
  },
};

/** Los cuatro destinos (barra lateral en escritorio y tableta, barra inferior en móvil). */
export const PRIMARY_NAV: AppView[] = ["now", "explore", "find", "saved"];
/** Secundaria, separada de la principal. */
export const SECONDARY_NAV: AppView[] = ["settings", "about"];
/** Móvil: los mismos cuatro destinos. */
export const MOBILE_NAV: AppView[] = PRIMARY_NAV;
/** Móvil: en el menú «Más» de la cabecera. */
export const MOBILE_MORE: AppView[] = ["settings", "about"];

/** ¿Está activo el destino `item` cuando se ve `view`? (las pestañas de Buscar cuentan como Buscar). */
export function isNavActive(item: AppView, view: AppView): boolean {
  const d = destinationOf(item);
  return d ? d === destinationOf(view) : item === view;
}
