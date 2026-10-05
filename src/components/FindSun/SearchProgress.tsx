import type { SearchPhase, SearchProgress as Progress } from "../../types";
import { cn } from "../../utils/cn";
import { GhostButton } from "./ui";

/**
 * «Buscando sol…» — sin pantalla de carga pesada: tres etapas reales del análisis (lugares,
 * edificios, sol y nubes) y una línea fina de avance.
 */

const STAGES: Array<{ label: string; phases: SearchPhase[]; from: number; span: number }> = [
  { label: "Lugares", phases: ["places"], from: 0, span: 0.06 },
  { label: "Edificios", phases: ["buildings"], from: 0.06, span: 0.34 },
  { label: "Sol y nubes", phases: ["sun", "ranking"], from: 0.4, span: 0.6 },
];

export default function SearchProgress({
  progress,
  onCancel,
}: {
  progress: Progress | null;
  onCancel(): void;
}) {
  const phase = progress?.phase ?? "places";
  const activeIdx = Math.max(
    0,
    STAGES.findIndex((s) => s.phases.includes(phase))
  );
  const stage = STAGES[activeIdx];
  const within = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const fraction = phase === "ranking" ? 1 : stage.from + stage.span * within;

  return (
    <div className="fts-fade-in" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="font-serif text-[22px] leading-none text-ink">Buscando sol…</p>
        <GhostButton onClick={onCancel}>Cancelar</GhostButton>
      </div>

      <div className="mt-4 h-px w-full overflow-hidden bg-line">
        <div
          className="h-full bg-sun transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, fraction * 100)}%` }}
        />
      </div>

      <ol className="mt-3.5 flex items-center gap-5">
        {STAGES.map((s, i) => (
          <li
            key={s.label}
            className={cn(
              "flex items-center gap-2 text-[11px] font-medium transition-colors duration-500",
              i === activeIdx ? "text-ink" : i < activeIdx ? "text-ink-soft" : "text-ink-faint"
            )}
          >
            <i
              className={cn(
                "block h-[7px] w-[7px] rounded-full border transition-colors duration-500",
                i < activeIdx && "border-sun bg-sun",
                i === activeIdx && "animate-pulse border-sun bg-sun/50",
                i > activeIdx && "border-ink-faint bg-transparent"
              )}
            />
            {s.label}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] leading-snug text-ink-faint">
        Calculando el sol, las sombras de los edificios y las nubes de cada lugar.
      </p>
    </div>
  );
}
