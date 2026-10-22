import { CHIPS, type ChipId } from "../../lib/explore";
import { cn } from "../../utils/cn";
import { CHIP_ICON, FilterIcon } from "./chipIcons";
import { CHIP_LABEL } from "./specLabel";
import { tr } from "../../i18n";

/**
 * Chips de intención de Explorar: Sol ahora · Sombra ahora · Terrazas · Parques · Playa · Niños ·
 * Atardecer · Trabajar · Con perro, y el acceso a los filtros. Un toque busca; otro toque en el
 * chip activo vuelve a «Para ti».
 */
export default function ChipsBar({
  active,
  onChip,
  filterCount,
  filtersOpen,
  onFilters,
  variant,
}: {
  active: ChipId | null;
  onChip(chip: ChipId | null): void;
  filterCount: number;
  filtersOpen: boolean;
  onFilters(): void;
  /** «floating»: sobre el mapa (móvil); «panel»: en el panel de escritorio. */
  variant: "floating" | "panel";
}) {
  const floating = variant === "floating";
  const base =
    "flex h-11 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sun/60 active:scale-[0.98]";
  const idle = floating ? "fts-glass text-ink" : "border border-line bg-ink/[0.03] text-ink hover:bg-ink/[0.07]";
  return (
    <div
      role="toolbar"
      aria-label={tr("chips.que_buscas")}
      className={cn("fts-scroll-x flex snap-x gap-2 overflow-x-auto", floating ? "pointer-events-auto -mx-3 px-3 pb-1" : "-mx-1 px-1 pb-1")}
    >
      <button
        type="button"
        onClick={onFilters}
        aria-expanded={filtersOpen}
        aria-label={filterCount ? tr("filters.filtros_activos", { p0: filterCount }) : tr("filters.filtros")}
        className={cn(base, filtersOpen || filterCount ? "bg-ink text-paper" : idle)}
      >
        <FilterIcon />
        <span>{tr("filters.filtros")}</span>
        {filterCount > 0 && (
          <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1 text-[12px] font-bold text-ink">{filterCount}</span>
        )}
      </button>
      {CHIPS.map((c) => {
        const on = active === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChip(on ? null : c)}
            className={cn(base, on ? "bg-ink text-paper" : idle, !on && (c === "sun" ? "text-sun-deep" : c === "shade" ? "text-shade" : ""))}
          >
            {CHIP_ICON[c]}
            <span className={cn(!on && (c === "sun" || c === "shade") && "text-ink")}>{tr(CHIP_LABEL[c])}</span>
          </button>
        );
      })}
    </div>
  );
}
