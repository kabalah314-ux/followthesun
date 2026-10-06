import { cn } from "../../utils/cn";
import type { NavItemDef } from "./navItems";

interface Props {
  item: NavItemDef;
  active: boolean;
  compact: boolean;
  onSelect(): void;
}

/**
 * Elemento de la barra lateral. El estado activo es discreto: una superficie translúcida y un
 * punto cálido. En modo compacto, el nombre aparece como tooltip al pasar el ratón o con el foco.
 */
export default function NavigationItem({ item, active, compact, onSelect }: Props) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        aria-label={compact ? item.label : undefined}
        className={cn(
          "group pointer-events-auto relative flex h-10 w-full items-center gap-3 rounded-[14px] text-[13px] font-medium outline-none transition-colors duration-300",
          compact ? "justify-center px-0" : "px-3",
          active ? "bg-ink/[0.07] text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
          "focus-visible:ring-2 focus-visible:ring-sun/60"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute left-[3px] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-sun transition-all duration-300",
            active ? "scale-100 opacity-100" : "scale-0 opacity-0",
            compact && "left-[2px]"
          )}
        />
        <span className={cn("shrink-0", item.view === "find" && "text-sun-deep")}>{item.icon(19)}</span>
        {!compact && <span className="truncate">{item.label}</span>}
        {compact && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {item.label}
          </span>
        )}
      </button>
    </li>
  );
}
