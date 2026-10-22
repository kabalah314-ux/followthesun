import type { PlansTab } from "../../lib/routing";
import { PLANS_TABS } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { tr, type MessageKey } from "../../i18n";

const LABEL: Record<PlansTab, MessageKey> = {
  route: "plans.ruta_del_sol",
  week: "plans.esta_semana",
  later: "navItems.mas_tarde",
  sport: "plans.correr_y_bici",
  group: "plans.en_grupo",
  alerts: "plans.alertas",
};

/** Secciones de Planes: Ruta del sol · Esta semana · Más tarde · Correr y bici · En grupo · Alertas. */
export default function PlansTabs({ tab, onTab, groupCount }: { tab: PlansTab; onTab(t: PlansTab): void; groupCount: number }) {
  return (
    <div role="tablist" aria-label={tr("nav.planes")} className="fts-scroll-x flex gap-1.5 overflow-x-auto px-4 pb-0.5">
      {PLANS_TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onTab(t)}
          className={cn(
            "flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
            tab === t ? "bg-ink text-paper" : "bg-ink/[0.05] text-ink-soft hover:text-ink"
          )}
        >
          {tr(LABEL[t])}
          {t === "group" && groupCount > 0 && (
            <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] font-bold", tab === t ? "bg-sun text-ink" : "bg-sun/80 text-ink")}>
              {groupCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
