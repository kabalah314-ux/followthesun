import { CONFIDENCE_ES, confidenceWord, fmtMin } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { formatClock } from "../../services/timeService";
import type { NarrativeEvent, SunSearchOutcome, SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import SunResultCard from "../Find/SunResultCard";
import { Caps, GhostButton, PrimaryButton } from "../FindSun/ui";
import WindowStrip from "../FindSun/WindowStrip";

interface Step {
  time: string;
  label: string;
  tone: "sun" | "move" | "shade" | "neutral";
}

const MIN = 60_000;

function steps(r: SunSearchResult): Step[] {
  const w = r.bestWindow ?? r.searchWindow;
  const out: Step[] = [];
  if (r.walking) {
    out.push({ time: formatClock(w.start - r.walking.durationMinutes * MIN), label: `Sal (≈ ${r.walking.durationMinutes} min a pie)`, tone: "move" });
    out.push({ time: formatClock(w.start), label: `Llegas a ${r.place.name}`, tone: "neutral" });
  } else {
    out.push({ time: formatClock(w.start), label: `Ve a ${r.place.name}`, tone: "neutral" });
  }
  out.push({
    time: `${formatClock(w.start)}–${formatClock(w.end)}`,
    label: r.bestWindow ? "Mejor ventana de sol" : "Tu ventana (con poco sol directo)",
    tone: r.bestWindow ? "sun" : "shade",
  });
  return out;
}

const NARRATIVE_TONE: Record<NarrativeEvent["kind"], Step["tone"]> = {
  sun: "sun",
  best: "sun",
  partial: "sun",
  shadow: "shade",
  cloud: "shade",
  uncertain: "neutral",
  night: "shade",
};

const DOT: Record<Step["tone"], string> = {
  sun: "bg-sun",
  move: "bg-ink/40",
  shade: "bg-shade/60",
  neutral: "border border-ink/40 bg-transparent",
};

interface Props {
  outcome: SunSearchOutcome;
  activeId: string | null;
  saved: boolean;
  onPick(r: SunSearchResult): void;
  onToggleSave(r: SunSearchResult): void;
  onShare(r: SunSearchResult): void;
  onEdit(): void;
}

/**
 * «Tu mejor plan»: entrada simple → resultado claro. Cuándo salir, cuándo llegar, la mejor ventana
 * de sol y cómo evoluciona la luz en tu franja. Debajo, alternativas.
 */
export default function PlanResult({ outcome, activeId, saved, onPick, onToggleSave, onShare, onEdit }: Props) {
  const best = outcome.results[0];
  const alternatives = outcome.results.slice(1);
  const req = outcome.request;

  return (
    <div className="fts-fade-in">
      <Caps>Tu mejor plan</Caps>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-[24px] leading-[1.08] text-ink">{best.place.name}</p>
          <p className="mt-1 text-[11px] text-ink-soft">
            {PLACE_TYPE_LABEL[best.locationType].singular} · confianza {CONFIDENCE_ES[confidenceWord(best.confidence)].toLowerCase()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-serif text-[40px] leading-[0.85] tracking-tight text-ink">{best.score}</p>
          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Sun Score</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {steps(best).map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-[12.5px]">
            <span className="w-[86px] shrink-0 tabular-nums text-ink">{s.time}</span>
            <i className={cn("block h-[8px] w-[8px] shrink-0 rounded-full", DOT[s.tone])} />
            <span className={cn(s.tone === "sun" ? "font-medium text-ink" : "text-ink-soft")}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-ink-soft">
        {fmtMin(best.sunlightMinutes)} de sol directo de {fmtMin(best.requestedMinutes)}
        {best.weatherAvailable ? "" : " (sol posible: sin datos de nubes)"}
      </p>

      <div className="mt-4">
        <WindowStrip windows={best.windows} start={req.startTime} end={req.endTime} highlight={best.searchWindow} />
      </div>

      {best.narrative.length >= 2 && (
        <div className="mt-4 border-t border-line pt-3">
          <Caps>Cómo cambia la luz</Caps>
          <ol className="mt-2.5 space-y-2">
            {best.narrative.map((e, i) => (
              <li key={i} className="flex items-center gap-3 text-[12px]">
                <span className="w-11 shrink-0 tabular-nums text-ink-faint">{formatClock(e.time)}</span>
                <i className={cn("block h-[7px] w-[7px] shrink-0 rounded-full", DOT[NARRATIVE_TONE[e.kind]])} />
                <span className={cn("text-ink-soft", e.kind === "best" && "font-medium text-ink")}>{e.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => onPick(best)}>Ver en el mapa</PrimaryButton>
        <GhostButton onClick={() => onToggleSave(best)} className={saved ? "text-sun-deep" : undefined}>
          {saved ? "Guardado" : "Guardar"}
        </GhostButton>
        <GhostButton onClick={() => onShare(best)}>Compartir</GhostButton>
      </div>

      {alternatives.length > 0 && (
        <div className="mt-5 border-t border-line pt-3.5">
          <Caps>Otras opciones</Caps>
          <div className="mt-2.5 space-y-2.5">
            {alternatives.map((r, i) => (
              <SunResultCard
                key={r.placeId}
                result={r}
                active={activeId === r.placeId}
                rangeStart={req.startTime}
                rangeEnd={req.endTime}
                onPick={() => onPick(r)}
                delay={i * 80}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <GhostButton onClick={onEdit}>Editar plan</GhostButton>
      </div>
    </div>
  );
}
