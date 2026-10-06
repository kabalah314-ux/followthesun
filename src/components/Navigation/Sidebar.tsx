import { PanelLeftClose, PanelLeftOpen } from "../LineIcons";
import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { LAYOUT } from "../Layout/layout";
import { LogoMark, Wordmark } from "../Logo";
import NavigationItem from "./NavigationItem";
import { NAV_ITEMS, PRIMARY_NAV, SECONDARY_NAV } from "./navItems";

interface Props {
  view: AppView;
  compact: boolean;
  /** En tableta la barra siempre es compacta: no se puede expandir. */
  canExpand: boolean;
  onNavigate(view: AppView): void;
  onToggleCompact(): void;
}

/**
 * Barra lateral (escritorio y tableta): estrecha, translúcida, flotando sobre el mapa para que este
 * parezca continuar por debajo. Navegación principal arriba; Ajustes y Acerca de separados abajo.
 */
export default function Sidebar({ view, compact, canExpand, onNavigate, onToggleCompact }: Props) {
  const width = compact ? LAYOUT.sidebarCompact : LAYOUT.sidebarExpanded;

  return (
    <nav
      aria-label="Navegación principal"
      // El fondo translúcido no captura el gesto: el mapa se puede arrastrar por debajo.
      className="fts-glass fts-rise pointer-events-none absolute bottom-3 left-3 top-3 z-30 flex flex-col rounded-[24px] py-4 transition-[width] duration-300 ease-out"
      style={{ width, animationDelay: "200ms" }}
    >
      <button
        type="button"
        onClick={() => onNavigate("explore")}
        aria-label="Follow the Sun — volver al mapa"
        className={cn(
          "pointer-events-auto mb-6 flex items-center gap-3 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-sun/60",
          compact ? "justify-center px-0" : "px-4"
        )}
      >
        <LogoMark size={compact ? 30 : 32} className="shrink-0 text-ink" />
        {!compact && (
          <span className="min-w-0 text-left leading-none">
            <span className="block whitespace-nowrap text-[11.5px] font-semibold tracking-[0.24em] text-ink">
              <Wordmark />
            </span>
            <span className="mt-1.5 block font-serif text-[12.5px] italic text-ink-soft">Barcelona</span>
          </span>
        )}
      </button>

      <ul className={cn("flex flex-col gap-1", compact ? "px-2" : "px-2.5")}>
        {PRIMARY_NAV.map((v) => (
          <NavigationItem
            key={v}
            item={NAV_ITEMS[v]}
            active={view === v}
            compact={compact}
            onSelect={() => onNavigate(v)}
          />
        ))}
      </ul>

      <div className="flex-1" />

      <div className={cn("mb-2 h-px bg-line", compact ? "mx-3" : "mx-4")} />
      <ul className={cn("flex flex-col gap-1", compact ? "px-2" : "px-2.5")}>
        {SECONDARY_NAV.map((v) => (
          <NavigationItem
            key={v}
            item={NAV_ITEMS[v]}
            active={view === v}
            compact={compact}
            onSelect={() => onNavigate(v)}
          />
        ))}
      </ul>

      {canExpand && (
        <button
          type="button"
          onClick={onToggleCompact}
          aria-label={compact ? "Expandir menú" : "Plegar menú"}
          aria-expanded={!compact}
          className={cn(
            "pointer-events-auto mt-2 flex h-9 items-center gap-3 rounded-[14px] text-[11.5px] text-ink-faint outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60",
            compact ? "mx-2 justify-center" : "mx-2.5 px-3"
          )}
        >
          {compact ? (
            <PanelLeftOpen size={17} strokeWidth={1.5} absoluteStrokeWidth />
          ) : (
            <>
              <PanelLeftClose size={17} strokeWidth={1.5} absoluteStrokeWidth />
              <span>Plegar</span>
            </>
          )}
        </button>
      )}
    </nav>
  );
}
