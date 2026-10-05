import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { LogoMark, Wordmark } from "../Logo";
import {
  AboutIcon,
  CollapseIcon,
  ExploreIcon,
  FindIcon,
  PlacesIcon,
  PlanIcon,
  SavedIcon,
  SettingsIcon,
  StarIcon,
} from "./NavIcons";
import type { AppView } from "./viewTypes";

interface Props {
  view: AppView;
  collapsed: boolean;
  onCollapsedChange(value: boolean): void;
  onNavigate(view: AppView): void;
}

interface Item {
  id: AppView;
  label: string;
  description: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => ReactNode;
}

const PRIMARY: Item[] = [
  { id: "explore", label: "Mapa", description: "Ver dónde da el sol ahora", icon: ExploreIcon },
  { id: "find", label: "Buscar sol/sombra", description: "Sitios con sol (o sombra) cerca de ti", icon: FindIcon },
  { id: "plan", label: "Planificar", description: "Elegir otro momento u otro día", icon: PlanIcon },
  { id: "places", label: "Sitios", description: "Parques, plazas, playas, terrazas y miradores", icon: PlacesIcon },
  { id: "recommended", label: "Recomendados", description: "9 sitios por categoría, siempre distintos", icon: StarIcon },
  { id: "saved", label: "Favoritos", description: "Tus sitios y su sol de hoy", icon: SavedIcon },
];

const SECONDARY: Item[] = [
  { id: "settings", label: "Ajustes", description: "Preferencias del mapa", icon: SettingsIcon },
  { id: "about", label: "Acerca de", description: "El proyecto y sus datos", icon: AboutIcon },
];

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: Item;
  active: boolean;
  collapsed: boolean;
  onClick(): void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={collapsed ? `${item.label} · ${item.description}` : item.description}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "group pointer-events-auto relative flex h-11 w-full items-center rounded-[15px] text-left transition-all duration-300",
        collapsed ? "justify-center px-0" : "gap-3 px-3 md:max-lg:justify-center md:max-lg:gap-0 md:max-lg:px-0",
        active
          ? "bg-ink/[0.075] text-ink"
          : "text-ink-soft hover:bg-ink/[0.045] hover:text-ink"
      )}
    >
      {active && <span className="absolute bottom-[10px] left-0 top-[10px] w-[2px] rounded-full bg-sun" />}
      <Icon className={cn("shrink-0", active ? "text-sun-deep" : "text-current")} />
      <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-medium md:max-lg:hidden", collapsed && "hidden")}>
        {item.label}
      </span>
      {collapsed && (
        <span className="pointer-events-none absolute left-[calc(100%+12px)] z-[80] hidden whitespace-nowrap rounded-full bg-ink px-3 py-2 text-[11px] font-medium text-paper opacity-0 shadow-xl transition-opacity duration-200 group-hover:block group-hover:opacity-100">
          {item.label}
        </span>
      )}
    </button>
  );
}

/**
 * Navegación desktop/tablet: rail translúcido sobre el mapa. El mapa sigue ocupando todo el
 * viewport; expandir/contraer solo mueve el contenido contextual, nunca desmonta el mapa.
 */
export default function Sidebar({ view, collapsed, onCollapsedChange, onNavigate }: Props) {
  return (
    <aside
      aria-label="Navegación principal"
      className={cn(
      "fts-glass fts-nav-rail pointer-events-none fixed bottom-[54px] left-3 top-3 z-40 hidden flex-col rounded-[25px] p-2.5 transition-[width] duration-300 ease-out md:flex",
        collapsed ? "w-[68px]" : "w-[224px] md:max-lg:w-[68px]"
      )}
    >
      <div className={cn("flex h-[54px] shrink-0 items-center", collapsed ? "justify-center" : "gap-3 px-2")}>
        <LogoMark size={34} animate className="shrink-0 text-ink" />
        {!collapsed && (
          <div className="min-w-0 leading-none md:max-lg:hidden">
            <p className="whitespace-nowrap text-[10px] font-semibold tracking-[0.22em] text-ink">
              <Wordmark />
            </p>
            <p className="mt-1.5 font-serif text-[12px] italic text-ink-soft">Barcelona</p>
          </div>
        )}
      </div>

      <div className={cn("mt-5 px-1", collapsed && "px-0")}>
        {!collapsed && <p className="fts-caps mb-2.5 px-2 !text-[8px] md:max-lg:hidden">Descubre</p>}
        <nav className="flex flex-col gap-1" aria-label="Producto">
          {PRIMARY.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              collapsed={collapsed}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto px-1">
        <div className="mb-2 h-px bg-line" />
        {!collapsed && <p className="fts-caps mb-2.5 px-2 !text-[8px] md:max-lg:hidden">Aplicación</p>}
        <nav className="flex flex-col gap-1" aria-label="Aplicación">
          {SECONDARY.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={view === item.id}
              collapsed={collapsed}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
        className={cn(
          "pointer-events-auto mt-2 flex h-10 w-full items-center rounded-[14px] text-ink-faint transition-colors hover:bg-ink/[0.045] hover:text-ink",
            collapsed ? "justify-center" : "justify-between px-3",
            "md:max-lg:hidden"
          )}
        >
          {!collapsed && <span className="text-[10px] font-medium md:max-lg:hidden">Más mapa</span>}
          <CollapseIcon expanded={!collapsed} className="h-[18px] w-[18px] md:max-lg:rotate-180" />
        </button>
      </div>
    </aside>
  );
}

export const SIDEBAR_EXPANDED = 224;
export const SIDEBAR_COLLAPSED = 68;