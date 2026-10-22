import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { NAV_ITEMS, PRIMARY_NAV, isNavActive } from "./navItems";
import { tr } from "../../i18n";

/** Escritorio: los tres destinos como pestañas en la cabecera del panel único. */
export default function DestinationTabs({
  view,
  onNavigate,
  badge,
}: {
  view: AppView;
  onNavigate(view: AppView): void;
  badge?: Partial<Record<AppView, number>>;
}) {
  return (
    <nav aria-label={tr("mobileNavigation.navegacion_principal")}>
      <ul className="flex gap-1 rounded-full bg-ink/[0.05] p-1">
        {PRIMARY_NAV.map((v) => {
          const active = isNavActive(v, view);
          const n = badge?.[v] ?? 0;
          return (
            <li key={v} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(v)}
                aria-current={active ? "page" : undefined}
                title={NAV_ITEMS[v].hint}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                  active ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                )}
              >
                <span className={cn("shrink-0", v === "explore" && "text-sun-deep")}>{NAV_ITEMS[v].icon(17)}</span>
                <span>{NAV_ITEMS[v].label}</span>
                {n > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1 text-[12px] font-bold text-ink">{n}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
