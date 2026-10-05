import { clamp } from "../../lib/coordinates";
import { formatClock } from "../../services/timeService";
import type { SunWindow, SunWindowKind } from "../../types";
import { cn } from "../../utils/cn";

const KIND_CLASS: Record<SunWindowKind, string> = {
  sun: "bg-sun",
  partial: "bg-sun/45",
  shadow: "bg-shade/55",
  cloud: "bg-ink/30",
  uncertain: "",
  night: "bg-ink/10",
};

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 28%, transparent) 0 3px, transparent 3px 6px)";

interface Props {
  windows: SunWindow[];
  start: number;
  end: number;
  /** Ventana destacada (la mejor). */
  highlight?: { start: number; end: number } | null;
  compact?: boolean;
}

/**
 * Los tramos de sol de una franja en una barra: sol · parcial · sombra · nubes · incierto.
 * Es la forma de ver «17:00–17:35 sol · 17:35–18:02 sombra…» de un vistazo.
 */
export default function WindowStrip({ windows, start, end, highlight, compact }: Props) {
  const span = Math.max(1, end - start);
  const pos = (t: number) => clamp((t - start) / span, 0, 1) * 100;

  return (
    <div>
      <div className="relative">
        <div className={cn("relative overflow-hidden rounded-full bg-ink/[0.06]", compact ? "h-[4px]" : "h-[10px]")}>
          {windows.map((w, i) => (
            <i
              key={`${w.kind}-${i}`}
              className={cn("absolute inset-y-0 block", KIND_CLASS[w.kind])}
              style={{
                left: `${pos(w.start)}%`,
                width: `${Math.max(0.4, pos(w.end) - pos(w.start))}%`,
                backgroundImage: w.kind === "uncertain" ? HATCH : undefined,
              }}
            />
          ))}
        </div>
        {highlight && !compact && (
          <i
            className="pointer-events-none absolute -inset-y-[3px] block rounded-full ring-1 ring-ink/70"
            style={{
              left: `${pos(highlight.start)}%`,
              width: `${Math.max(1, pos(highlight.end) - pos(highlight.start))}%`,
            }}
          />
        )}
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between text-[9.5px] tabular-nums text-ink-faint">
          <span>{formatClock(start)}</span>
          <span>{formatClock(end)}</span>
        </div>
      )}
    </div>
  );
}
