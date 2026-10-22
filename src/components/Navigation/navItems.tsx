import { CalendarClock, Heart, Info, Settings } from "../LineIcons";
import type { ReactNode } from "react";
import { destinationOf, type AppView } from "../../lib/routing";
import { tr } from "../../i18n";

/**
 * Icono del Sol de Follow the Sun: disco + arco de trayectoria, con el mismo trazo fino que el
 * resto de iconos.
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
  explore: {
    view: "explore",
    label: tr("nav.explorar"),
    hint: tr("nav.explorar_hint"),
    icon: (s) => <SunTrackIcon size={s} />,
  },
  plans: {
    view: "plans",
    label: tr("nav.planes"),
    hint: tr("nav.planes_hint"),
    icon: (s) => <CalendarClock size={s} {...stroke} />,
  },
  mine: {
    view: "mine",
    label: tr("navItems.mis_sitios"),
    hint: tr("nav.mis_sitios_hint"),
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
    label: tr("sunDetails.como_lo_sabemos"),
    hint: tr("navItems.datos_precision_y_limites"),
    icon: (s) => <Info size={s} {...stroke} />,
  },
};

/** Los tres destinos (barra inferior en móvil, pestañas del panel en escritorio). */
export const PRIMARY_NAV: AppView[] = ["explore", "plans", "mine"];
/** En el icono de perfil del buscador. */
export const SECONDARY_NAV: AppView[] = ["settings", "about"];
/** Móvil: los mismos tres destinos. */
export const MOBILE_NAV: AppView[] = PRIMARY_NAV;
/** Móvil: en el menú de perfil. */
export const MOBILE_MORE: AppView[] = SECONDARY_NAV;

/** ¿Está activo el destino `item` cuando se ve `view`? */
export function isNavActive(item: AppView, view: AppView): boolean {
  const d = destinationOf(item);
  return d ? d === destinationOf(view) : item === view;
}
