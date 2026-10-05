import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp } from "../../lib/coordinates";
import type { TimeMode, TimeRange } from "../../hooks/useTimeController";
import { formatClock, formatDuration, HOUR, MINUTE } from "../../services/timeService";
import type { TimeZones, TimelineInterval } from "../../types";
import { cn } from "../../utils/cn";
import { PauseIcon, PlayIcon } from "../Icons";

interface Props {
  /** Instante elegido (`selectedTime`, en ms). */
  selectedTime: number;
  now: number;
  range: TimeRange;
  mode: TimeMode;
  playing: boolean;
  isNight: boolean;
  intervals: TimelineInterval[] | null;
  onScrub(ms: number): void;
  onNow(): void;
  onAhead(): void;
  onTogglePlay(): void;
  /** Zonas de procedencia del dato: observado · presente · previsión. */
  zones?: TimeZones | null;
  /** Procedencia del instante elegido ("Observado", "Previsión"…). */
  provenance?: string | null;
}

/**
 * TimeSlider — línea de tiempo del día solar. Por defecto `selectedTime = currentTime`;
 * al arrastrar el indicador cambian la posición del sol, los datos solares y las sombras.
 */
export default function TimeSlider({
  selectedTime,
  now,
  range,
  mode,
  playing,
  isNight,
  intervals,
  onScrub,
  onNow,
  onAhead,
  onTogglePlay,
  zones,
  provenance,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const span = Math.max(1, range.end - range.start);
  const frac = (ms: number) => clamp((ms - range.start) / span, 0, 1);
  const thumb = frac(selectedTime);
  const nowInRange = now >= range.start && now <= range.end;

  const scrubFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 1);
    onScrub(Math.round((range.start + f * span) / MINUTE) * MINUTE);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    scrubFromX(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) scrubFromX(e.clientX);
  };
  const endDrag = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 30 * MINUTE : 5 * MINUTE;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onScrub(selectedTime + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onScrub(selectedTime - step);
    else if (e.key === "Home") onScrub(range.start);
    else if (e.key === "End") onScrub(range.end);
    else return;
    e.preventDefault();
  };

  const delta = selectedTime - now;
  let label = "Ahora";
  if (mode === "ahead" && Math.abs(delta) > MINUTE) {
    label = delta > 0 ? `Dentro de ${formatDuration(delta)}` : `Hace ${formatDuration(-delta)}`;
  } else if (mode === "now" && isNight) {
    label = "Ahora · fuera de luz solar";
  }
  if (provenance && !(mode === "now" && isNight)) label += ` · ${provenance}`;

  const ticks: number[] = [];
  for (let t = Math.ceil(range.start / HOUR) * HOUR; t < range.end; t += HOUR) ticks.push(t);

  return (
    <div className="fts-glass fts-rise w-full rounded-[28px] px-4 pb-4 pt-3.5 sm:px-7 sm:pb-5 sm:pt-4" style={{ animationDelay: "700ms" }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="fts-caps truncate">{label}</p>
          <p className="mt-1 font-serif text-[32px] leading-none tabular-nums text-ink sm:text-[40px]">
            {formatClock(selectedTime)}
          </p>
        </div>

        <div
          role="group"
          aria-label="Modo de tiempo"
          className="flex shrink-0 rounded-full border border-line bg-ink/[0.04] p-[3px] text-[9px] font-semibold uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.18em]"
        >
          <button
            type="button"
            onClick={onNow}
            aria-pressed={mode === "now"}
            className={cn(
              "rounded-full px-3 py-2 transition-all duration-500 sm:px-4",
              mode === "now" ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:text-ink"
            )}
          >
            Ahora
          </button>
          <button
            type="button"
            onClick={mode === "ahead" ? onTogglePlay : onAhead}
            aria-pressed={mode === "ahead"}
            aria-label={mode === "ahead" && playing ? "Pausar" : "Próximas horas"}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-2 transition-all duration-500 sm:px-4",
              mode === "ahead" ? "bg-ink text-paper shadow-sm" : "text-ink-soft hover:text-ink"
            )}
          >
            {mode === "ahead" && playing ? <PauseIcon size={9} /> : <PlayIcon size={9} />}
            Próximas horas
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5 sm:mt-4 sm:gap-4">
        <span className="w-9 text-right text-[11px] tabular-nums text-ink-soft sm:w-11 sm:text-[12px]">
          {formatClock(range.start)}
        </span>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Hora del día"
          aria-valuemin={range.start}
          aria-valuemax={range.end}
          aria-valuenow={Math.round(selectedTime)}
          aria-valuetext={formatClock(selectedTime)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="relative h-[60px] flex-1 cursor-pointer touch-none select-none outline-none"
        >
          {/* línea base con degradado de luz del día */}
          <div className="fts-track absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" />

          {/* tramos de sol / sombra del punto seleccionado */}
          {intervals?.map((iv, i) => {
            const a = frac(iv.start) * 100;
            const w = Math.max(0.4, (frac(iv.end) - frac(iv.start)) * 100);
            return (
              <div
                key={`${iv.start}-${i}`}
                className={cn(
                  "fts-fade-in absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full",
                  iv.state === "sun" && "bg-sun",
                  iv.state === "partial" && "bg-sun/45",
                  iv.state === "cloud" && "bg-ink/30",
                  iv.state === "shade" && "bg-shade/50"
                )}
                style={{ left: `calc(${a}% + 1px)`, width: `calc(${w}% - 2px)` }}
              />
            );
          })}

          {/* recorrido hasta ahora (solo sin punto seleccionado) */}
          {!intervals && (
            <div
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-sun/80"
              style={{
                width: `${thumb * 100}%`,
                transition: dragging ? "none" : "width 120ms linear",
              }}
            />
          )}

          {/* marcas horarias */}
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-[calc(50%+9px)] h-[5px] w-px -translate-x-1/2 bg-ink/20"
              style={{ left: `${frac(t) * 100}%` }}
            />
          ))}

          {/* procedencia del dato: observado (trazo continuo) · presente (ámbar) · previsión (discontinuo) */}
          {(() => {
            const obs = zones?.observedUntil != null ? frac(zones.observedUntil) : 0;
            const pres = zones?.presentUntil != null ? Math.max(obs, frac(zones.presentUntil)) : 0;
            return (
              <div className="pointer-events-none absolute inset-x-0 top-[calc(50%+25px)]" aria-hidden>
                <div className="relative h-[2px]">
                  {obs > 0 && (
                    <i className="absolute inset-y-0 left-0 rounded-full bg-ink/40" style={{ width: `${obs * 100}%` }} />
                  )}
                  {pres > obs && (
                    <i
                      className="absolute inset-y-0 rounded-full bg-sun"
                      style={{ left: `${obs * 100}%`, width: `${(pres - obs) * 100}%` }}
                    />
                  )}
                  {pres < 1 && (
                    <i className="fts-forecast-dash absolute inset-y-0 right-0" style={{ left: `${pres * 100}%` }} />
                  )}
                </div>
                <div className="relative mt-1.5 h-3 text-[8px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {obs > 0.2 && <span className="absolute left-0">Observado</span>}
                  {1 - pres > 0.2 && <span className="absolute right-0">Previsión</span>}
                </div>
              </div>
            );
          })()}

          {/* ahora */}
          {nowInRange && (
            <span
              title="Ahora"
              className="absolute top-[calc(50%+17px)] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-ink"
              style={{ left: `${frac(now) * 100}%` }}
            />
          )}

          {/* indicador solar */}
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${thumb * 100}%`,
              transition: dragging ? "none" : "left 120ms linear",
            }}
          >
            <span className="fts-thumb-halo absolute -inset-3 rounded-full" />
            <span
              className={cn(
                "fts-thumb relative block h-[22px] w-[22px] rounded-full transition-transform duration-300",
                dragging && "scale-[1.18]"
              )}
            />
          </div>
        </div>

        <span className="w-9 text-[11px] tabular-nums text-ink-soft sm:w-11 sm:text-[12px]">
          {formatClock(range.end)}
        </span>
      </div>
    </div>
  );
}
