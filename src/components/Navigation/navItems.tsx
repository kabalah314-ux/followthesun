import { CalendarClock, Compass, Heart, Info, MapPin, Settings, Star } from "../LineIcons";
import type { ReactNode } from "react";
import type { AppView } from "../../lib/routing";

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
  explore: {
    view: "explore",
    label: "Explorar",
    hint: "Mira dónde da el sol",
    icon: (s) => <Compass size={s} {...stroke} />,
  },
  find: {
    view: "find",
    label: "Buscar sol/sombra",
    hint: "Sitios con sol (o sombra) cerca de ti",
    icon: (s) => <SunTrackIcon size={s} />,
  },
  plan: {
    view: "plan",
    label: "Planificar",
    hint: "Decide cuándo y dónde ir",
    icon: (s) => <CalendarClock size={s} {...stroke} />,
  },
  places: {
    view: "places",
    label: "Lugares",
    hint: "Descubre los mejores sitios de hoy",
    icon: (s) => <MapPin size={s} {...stroke} />,
  },
  saved: {
    view: "saved",
    label: "Guardados",
    hint: "Tus sitios favoritos",
    icon: (s) => <Heart size={s} {...stroke} />,
  },
  recommended: {
    view: "recommended",
    label: "Recomendados",
    hint: "Nueve sitios para descubrir",
    icon: (s) => <Star size={s} {...stroke} />,
  },
  settings: {
    view: "settings",
    label: "Ajustes",
    hint: "Unidades y mapa",
    icon: (s) => <Settings size={s} {...stroke} />,
  },
  about: {
    view: "about",
    label: "Acerca de",
    hint: "Datos, precisión y límites",
    icon: (s) => <Info size={s} {...stroke} />,
  },
};

/** Navegación principal (escritorio y tableta). */
export const PRIMARY_NAV: AppView[] = ["explore", "find", "plan", "places", "recommended", "saved"];
/** Secundaria, separada de la principal. */
export const SECONDARY_NAV: AppView[] = ["settings", "about"];
/** Móvil: solo las cuatro acciones más importantes. */
export const MOBILE_NAV: AppView[] = ["explore", "find", "plan", "saved"];
/** Móvil: en el menú «Más». */
export const MOBILE_MORE: AppView[] = ["places", "recommended", "settings", "about"];
