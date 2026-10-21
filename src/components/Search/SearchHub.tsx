import type { ReactNode } from "react";
import { SEARCH_VIEWS, type SearchView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { PanelChrome, PanelHeader } from "../Layout/ContextPanel";

const TAB_LABEL: Record<SearchView, string> = {
  find: "Ahora",
  plan: "Más tarde",
  places: "Lugares",
  recommended: "Sorpréndeme",
};

/**
 * Buscar: una sola herramienta con cuatro pestañas (Ahora · Más tarde · Lugares · Sorpréndeme). Cada
 * pestaña es el panel de siempre; su cabecera propia se reduce a «atrás» y subtítulo.
 */
export default function SearchHub({
  view,
  onTab,
  onClose,
  children,
}: {
  view: SearchView;
  onTab(view: SearchView): void;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <div>
      <PanelHeader title="Buscar" subtitle="Sitios con sol o sombra, ahora o más tarde" onClose={onClose} />
      <div role="tablist" aria-label="Tipo de búsqueda" className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-ink/[0.05] p-1">
        {SEARCH_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => onTab(v)}
            className={cn(
              "h-11 flex-1 whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sun/60",
              view === v ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            )}
          >
            {TAB_LABEL[v]}
          </button>
        ))}
      </div>
      <PanelChrome.Provider value={{ embedded: true }}>{children}</PanelChrome.Provider>
    </div>
  );
}
