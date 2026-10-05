import { fmtMin, influenceWord } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import type { SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { SunGlyph } from "../Icons";
import { ConfidenceBars } from "./ui";
import WindowStrip from "./WindowStrip";

interface Props {
  results: SunSearchResult[];
  activeId: string | null;
  rangeStart: number;
  rangeEnd: number;
  onPick(r: SunSearchResult): void;
}

const glyphOf = (r: SunSearchResult) => {
  if (!r.weatherAvailable) return "partial" as const;
  const f = r.sunlightMinutes / Math.max(1, r.requestedMinutes);
  return f >= 0.75 ? ("sun" as const) : f >= 0.35 ? ("partial" as const) : ("cloud" as const);
};

/** Resultados en tarjetas pequeñas: la mejor opción primero y destacada. */
export function ResultCards({ results, activeId, rangeStart, rangeEnd, onPick }: Props) {
  return (
    <div className="fts-scroll-x -mx-1 mt-3.5 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
      {results.map((r, i) => {
        const best = r.rank === 1;
        const active = activeId === r.placeId;
        return (
          <button
            key={r.placeId}
            type="button"
            onClick={() => onPick(r)}
            className={cn(
              "fts-fade-in group flex min-w-[218px] snap-start flex-col rounded-2xl border px-3.5 py-3 text-left transition-all duration-500 hover:-translate-y-0.5 sm:min-w-0",
              active || best ? "border-sun/60 bg-sun-soft" : "border-line bg-ink/[0.03] hover:bg-ink/[0.06]"
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  {best ? "Mejor opción" : `Opción ${r.rank}`}
                </p>
                <p className="mt-1.5 line-clamp-2 font-serif text-[18px] leading-[1.1] text-ink">
                  {r.place.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-[34px] leading-[0.85] tracking-tight text-ink">{r.score}</p>
                <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Sun Score
                </p>
              </div>
            </div>

            <p className="mt-2 text-[10.5px] text-ink-soft">
              {PLACE_TYPE_LABEL[r.locationType].singular}
              {r.walking ? ` · ≈ ${r.walking.durationMinutes} min a pie` : ""}
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <SunGlyph state={glyphOf(r)} size={20} className="shrink-0" />
              <p className="text-[12.5px] font-medium text-ink">
                {fmtMin(r.sunlightMinutes)} {r.weatherAvailable ? "de sol" : "de sol posible"}
              </p>
            </div>

            <div className="mt-2.5">
              <WindowStrip windows={r.windows} start={rangeStart} end={rangeEnd} compact />
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10.5px] text-ink-soft">
              <span className="truncate">
                {r.urbanShadowMinutes > 0 && r.buildingsKnown
                  ? `${fmtMin(r.urbanShadowMinutes)} de sombra`
                  : r.weatherAvailable
                    ? `Nubes: ${influenceWord(r.cloudInfluence).toLowerCase()}`
                    : "Sin datos de nubes"}
              </span>
              <ConfidenceBars value={r.confidence} showWord={false} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Versión mínima (cuando el detalle ocupa la pantalla): un botón por resultado. */
export function ResultPills({
  results,
  activeId,
  onPick,
}: {
  results: SunSearchResult[];
  activeId: string | null;
  onPick(r: SunSearchResult): void;
}) {
  return (
    <div className="fts-scroll-x flex gap-2 overflow-x-auto pb-0.5">
      {results.map((r) => (
        <button
          key={r.placeId}
          type="button"
          onClick={() => onPick(r)}
          className={cn(
            "flex shrink-0 items-center gap-2.5 rounded-full border px-3.5 py-2 text-[12px] transition-colors duration-300",
            activeId === r.placeId
              ? "border-sun/60 bg-sun-soft text-ink"
              : "border-line bg-ink/[0.03] text-ink-soft hover:text-ink"
          )}
        >
          <span className="font-serif text-[15px] italic text-sun-deep">{r.rank}</span>
          <span className="max-w-[140px] truncate font-medium">{r.place.name}</span>
          <span className="tabular-nums text-ink-faint">{r.score}</span>
        </button>
      ))}
    </div>
  );
}
