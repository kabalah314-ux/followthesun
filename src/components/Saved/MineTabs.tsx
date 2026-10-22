import { MINE_TABS, type MineTab } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { tr, type MessageKey } from "../../i18n";

const LABEL: Record<MineTab, MessageKey> = {
  lists: "mine.listas",
  home: "mine.mi_casa",
  history: "mine.historial",
};

/** Secciones de Mis sitios: Listas · Mi casa o balcón · Historial. */
export default function MineTabs({ tab, onTab }: { tab: MineTab; onTab(t: MineTab): void }) {
  return (
    <div role="tablist" aria-label={tr("navItems.mis_sitios")} className="fts-scroll-x flex gap-1.5 overflow-x-auto px-4 pb-0.5">
      {MINE_TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => onTab(t)}
          className={cn(
            "h-11 shrink-0 rounded-full px-4 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
            tab === t ? "bg-ink text-paper" : "bg-ink/[0.05] text-ink-soft hover:text-ink"
          )}
        >
          {tr(LABEL[t])}
        </button>
      ))}
    </div>
  );
}
