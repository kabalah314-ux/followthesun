import { CONFIDENCE_ES, confidenceWord, fmtMin, influenceWord } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { formatClock } from "../../services/timeService";
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
  /** Modo sombra: los minutos y la franja se refieren a sombra, no a sol. */
  shade?: boolean;
  onPick(r: SunSearchResult): void;
}

const glyphOf = (r: SunSearchResult, shade: boolean) => {
  if (shade) return "shade" as const;
  if (!r.weatherAvailable) return "partial" as const;
  const f = r.sunlightMinutes / Math.max(1, r.requestedMinutes);
  return f >= 0.75 ? ("sun" as const) : f >= 0.35 ? ("partial" as const) : ("cloud" as const);
};

/** Frase directa: «Sol de 15:10 a 18:05» (o sombra en el modo sombra). */
export function windowPhrase(r: SunSearchResult, shade = false): string {
  const w = r.bestWindow ?? r.searchWindow;
  return `${shade ? "Sombra" : "Sol"} de ${formatClock(w.start)} a ${formatClock(w.end)}`;
}

export const reliabilityWord = (c: number): string => {
  const w = confidenceWord(c);
  return w === "very_high" || w === "high" ? "Alta" : w === "medium" ? "Media" : "Baja";
};

/** Resultados: la mejor opción primero, con la franja de sol (o sombra) en grande. */
export function ResultCards({ results, activeId, rangeStart, rangeEnd, shade = false, onPick }: Props) {
  return (
    <div className="fts-scroll-x -mx-1 mt-3.5 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-1 sm:overflow-visible">
      {results.map((r, i) => {
        const best = r.rank === 1;
        const active = activeId === r.placeId;
        const barrio = r.place.metadata?.barrio as string | undefined;
        const tip = r.place.metadata?.tip as string | undefined;
        return (
          <button
            key={r.placeId}
            type="button"
            data-testid={`result-card-${r.rank}`}
            onClick={() => onPick(r)}
            className={cn(
              "fts-fade-in group flex min-w-[240px] snap-start flex-col rounded-2xl border px-3.5 py-3 text-left transition-all duration-500 hover:-translate-y-0.5 sm:min-w-0",
              active || best ? "border-sun/60 bg-sun-soft" : "border-line bg-ink/[0.03] hover:bg-ink/[0.06]"
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                  {best ? "Mejor opción" : `Opción ${r.rank}`} · {PLACE_TYPE_LABEL[r.locationType].singular}
                  {barrio ? ` · ${barrio}` : ""}
                </p>
                <p className="mt-1.5 line-clamp-2 font-serif text-[18px] leading-[1.1] text-ink">{r.place.name}</p>
              </div>
              {r.walking && (
                <p className="shrink-0 text-right font-serif text-[20px] leading-none text-ink">
                  {r.walking.durationMinutes}
                  <span className="ml-0.5 text-[10px] text-ink-soft">min a pie</span>
                </p>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <SunGlyph state={glyphOf(r, shade)} size={20} className="shrink-0" />
              <p className="text-[13.5px] font-semibold text-ink" data-testid={`result-window-${r.rank}`}>
                {windowPhrase(r, shade)}
              </p>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              {fmtMin(r.longestSunRunMinutes || r.sunlightMinutes)} {shade ? "de sombra seguida" : "de sol seguido"}
              {!shade && !r.weatherAvailable ? " (posible)" : ""}
            </p>

            <div className="mt-2.5">
              <WindowStrip windows={r.windows} start={rangeStart} end={rangeEnd} compact />
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 text-[10.5px] text-ink-soft">
              <span className="truncate">
                {r.weatherAvailable ? `Nubes: ${influenceWord(r.cloudInfluence).toLowerCase()}` : "Sin datos de nubes"}
              </span>
              <span className="flex items-center gap-1.5" title={CONFIDENCE_ES[confidenceWord(r.confidence)]}>
                Fiabilidad {reliabilityWord(r.confidence).toLowerCase()}
                <ConfidenceBars value={r.confidence} showWord={false} />
              </span>
            </div>
            {tip && <p className="mt-2 text-[10.5px] italic leading-snug text-ink-faint">{tip}</p>}
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
        </button>
      ))}
    </div>
  );
}
