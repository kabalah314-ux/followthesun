import { useEffect, useRef, useState } from "react";
import type { LightSourceState } from "../../hooks/useLightSource";
import { compassLabel, type SunTimes } from "../../services/solarService";
import { formatClock } from "../../services/timeService";
import type { CityStats } from "../../types";
import { cn } from "../../utils/cn";
import InfoPanel from "../InfoPanel";

interface Props {
  stats: CityStats | null;
  time: number;
  dayLabel: string;
  sunTimes: SunTimes;
  up: boolean;
  altitudeDeg: number;
  azimuthDeg: number;
  light: LightSourceState;
  compact?: boolean;
}

/**
 * Estado del sol en una sola línea: «Barcelona · Hoy 17:42 · 42° SO». Es todo lo que se ve por
 * defecto; al pulsarlo se despliega el resumen de la zona y las fuentes de datos.
 */
export default function SunStatus({ stats, time, dayLabel, sunTimes, up, altitudeDeg, azimuthDeg, light, compact }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const kind = light.summary.kind;

  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Estado del sol — ver detalle"
        className="fts-glass flex items-center gap-2.5 rounded-full py-2 pl-3 pr-3.5 text-[12px] outline-none transition-colors hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <i
          aria-hidden
          className={cn(
            "block h-[8px] w-[8px] shrink-0 rounded-full border",
            kind === "observed" && "border-sun bg-sun",
            kind === "forecast" && "border-sun bg-transparent",
            kind === "estimated" && "border-sun bg-sun/35",
            (kind === "stale" || kind === "unavailable" || kind === "loading") && "border-ink-faint bg-transparent"
          )}
        />
        {!compact && <span className="font-medium text-ink">{stats?.area ?? "Barcelona"}</span>}
        {!compact && <span className="text-ink-faint">·</span>}
        <span className="text-ink-soft">
          {dayLabel} <span className="tabular-nums text-ink">{formatClock(time)}</span>
        </span>
        {up && (
          <>
            <span className="text-ink-faint">·</span>
            <span className="tabular-nums text-ink-soft">
              {Math.round(altitudeDeg)}° {compassLabel(azimuthDeg)}
            </span>
          </>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={cn("text-ink-faint transition-transform duration-300", open && "rotate-180")}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="fts-glass fts-pop-in absolute left-0 top-full z-30 mt-2 w-[min(calc(100vw-1.5rem),300px)] rounded-[22px] p-4">
          <InfoPanel
            stats={stats}
            time={time}
            sunTimes={sunTimes}
            up={up}
            altitudeDeg={altitudeDeg}
            azimuthDeg={azimuthDeg}
            light={light}
          />
        </div>
      )}
    </div>
  );
}
