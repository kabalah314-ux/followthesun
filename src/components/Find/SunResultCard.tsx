import { fmtMin, influenceWord } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import type { SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { ConfidenceBars } from "../FindSun/ui";
import WindowStrip from "../FindSun/WindowStrip";
import { SunGlyph } from "../Icons";

const glyphOf = (r: SunSearchResult) => {
  if (!r.weatherAvailable) return "partial" as const;
  const f = r.sunlightMinutes / Math.max(1, r.requestedMinutes);
  return f >= 0.75 ? ("sun" as const) : f >= 0.35 ? ("partial" as const) : ("cloud" as const);
};

interface Props {
  result: SunSearchResult;
  active: boolean;
  rangeStart: number;
  rangeEnd: number;
  onPick(): void;
  delay?: number;
  /** Etiqueta superior (por defecto «Mejor opción» / «Opción N»). */
  eyebrow?: string;
}

/** Un resultado: nombre, Sun Score, cuánto sol, confianza y distancia. Lo justo para decidir. */
export default function SunResultCard({ result: r, active, rangeStart, rangeEnd, onPick, delay = 0, eyebrow }: Props) {
  const best = r.rank === 1;
  const extra =
    r.urbanShadowMinutes > 0 && r.buildingsKnown
      ? `${fmtMin(r.urbanShadowMinutes)} de sombra`
      : r.weatherAvailable
        ? `Nubes: ${influenceWord(r.cloudInfluence).toLowerCase()}`
        : "Sin datos de nubes";

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        "fts-fade-in group flex w-full flex-col rounded-2xl border px-3.5 py-3 text-left outline-none transition-all duration-300 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-sun/60",
        active ? "border-sun/70 bg-sun-soft" : best ? "border-sun/40 bg-sun-soft/60" : "border-line bg-ink/[0.025] hover:bg-ink/[0.05]"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            {eyebrow ?? (best ? "Mejor opción" : `Opción ${r.rank}`)}
          </p>
          <p className="mt-1 line-clamp-2 font-serif text-[18px] leading-[1.12] text-ink">{r.place.name}</p>
          <p className="mt-1 text-[10.5px] text-ink-soft">
            {PLACE_TYPE_LABEL[r.locationType].singular}
            {r.walking ? ` · ≈ ${r.walking.durationMinutes} min a pie` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-[32px] leading-[0.85] tracking-tight text-ink">{r.score}</p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Sun Score</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <SunGlyph state={glyphOf(r)} size={18} className="shrink-0" />
        <p className="text-[12.5px] font-medium text-ink">
          {fmtMin(r.sunlightMinutes)} {r.weatherAvailable ? "de sol" : "de sol posible"}
        </p>
        <span className="ml-auto">
          <ConfidenceBars value={r.confidence} />
        </span>
      </div>

      <div className="mt-2.5">
        <WindowStrip windows={r.windows} start={rangeStart} end={rangeEnd} compact />
      </div>
      <p className="mt-2 truncate text-[10.5px] text-ink-faint">{extra}</p>
    </button>
  );
}
