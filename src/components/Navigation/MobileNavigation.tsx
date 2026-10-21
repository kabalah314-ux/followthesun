import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { MOBILE_NAV, NAV_ITEMS, isNavActive } from "./navItems";
import { tr } from "../../i18n";

/**
 * Barra inferior móvil: los cuatro destinos (Ahora, Mapa, Buscar, Mis sitios). Ajustes y Acerca de
 * están en el menú «Más» de la cabecera; Más tarde, Lugares y Sorpréndeme son pestañas de Buscar.
 */
export default function MobileNavigation({
  view,
  onNavigate,
}: {
  view: AppView;
  onNavigate(view: AppView): void;
}) {
  return (
    <nav
      aria-label={tr("mobileNavigation.navegacion_principal")}
      className="fts-glass pointer-events-auto fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-x-0 border-b-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-[480px] items-stretch justify-around px-2">
        {MOBILE_NAV.map((v) => {
          const item = NAV_ITEMS[v];
          const active = isNavActive(v, view);
          return (
            <li key={v} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(v)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-sun/60",
                  active ? "text-ink" : "text-ink-faint"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-300",
                    active && "bg-ink/[0.07]",
                    v === "now" && "text-sun-deep"
                  )}
                >
                  {item.icon(21)}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
