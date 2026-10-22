import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { MOBILE_NAV, NAV_ITEMS, isNavActive } from "./navItems";
import { tr } from "../../i18n";

/**
 * Barra inferior móvil: los tres destinos (Explorar, Planes y Mis sitios). Ajustes, idioma y «Cómo
 * lo sabemos» están en el icono de perfil del buscador. Botones de 64 px de alto.
 */
export default function MobileNavigation({
  view,
  onNavigate,
  badge,
}: {
  view: AppView;
  onNavigate(view: AppView): void;
  /** Aviso discreto en un destino (p. ej. opciones en el plan en grupo). */
  badge?: Partial<Record<AppView, number>>;
}) {
  return (
    <nav
      aria-label={tr("mobileNavigation.navegacion_principal")}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 border-t border-line bg-glass-strong backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-[520px] items-stretch justify-around px-2">
        {MOBILE_NAV.map((v) => {
          const item = NAV_ITEMS[v];
          const active = isNavActive(v, view);
          const n = badge?.[v] ?? 0;
          return (
            <li key={v} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(v)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-sun/60",
                  active ? "text-ink" : "text-ink-faint"
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-300",
                    active && "bg-ink/[0.07]",
                    v === "explore" && "text-sun-deep"
                  )}
                >
                  {item.icon(21)}
                  {n > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sun px-1 text-[11px] font-bold leading-none text-ink">
                      {n}
                    </span>
                  )}
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
