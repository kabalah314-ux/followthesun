import type { CollectionDef } from "../../lib/explore";
import { cn } from "../../utils/cn";
import { CHIP_ICON } from "../Find/chipIcons";
import { collectionHint, collectionTitle } from "../Find/specLabel";
import { tr } from "../../i18n";

const ICON_OF = (c: CollectionDef) =>
  c.when.kind === "sunset"
    ? CHIP_ICON.sunset
    : c.types.includes("terrace")
      ? CHIP_ICON.terraces
      : c.types.includes("playground")
        ? CHIP_ICON.kids
        : c.types.includes("beach")
          ? CHIP_ICON.beach
          : c.mode === "shade"
            ? CHIP_ICON.shade
            : CHIP_ICON.parks;

/**
 * Colecciones del momento: se eligen solas por estación, hora y calor («Terrazas con sol hasta
 * tarde», «Parques con sombra para niños», «Atardeceres»). Un toque las busca.
 */
export default function Collections({
  items,
  activeId,
  onPick,
}: {
  items: CollectionDef[];
  activeId: string | null;
  onPick(c: CollectionDef): void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={tr("collections.colecciones_del_momento")} className="mt-6">
      <p className="fts-caps !text-[11.5px]">{tr("collections.colecciones_del_momento")}</p>
      <div className="fts-scroll-x -mx-4 mt-2.5 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {items.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c)}
            aria-pressed={activeId === c.id}
            className={cn(
              "flex min-h-[96px] w-[208px] shrink-0 snap-start flex-col justify-between rounded-[18px] border p-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
              activeId === c.id ? "border-sun/60 bg-sun-soft" : c.mode === "shade" ? "border-line bg-shade/[0.07] hover:bg-shade/[0.12]" : "border-line bg-sun-soft/70 hover:bg-sun-soft"
            )}
          >
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", c.mode === "shade" ? "bg-shade/15 text-shade" : "bg-sun/20 text-sun-deep")}>
              {ICON_OF(c)}
            </span>
            <span>
              <span className="mt-2 block text-[14.5px] font-semibold leading-snug text-ink">{collectionTitle(c)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">{collectionHint(c)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
