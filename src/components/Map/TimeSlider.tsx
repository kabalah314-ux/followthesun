import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimeMode, TimeRange } from "../../hooks/useTimeController";
import { clamp } from "../../lib/coordinates";
import { dayChoiceLabel, dayStartFor } from "../../lib/planningTime";
import { presentOnDay } from "../../lib/timelineRange";
import { formatClock, formatDuration, getZoneParts, HOUR, MINUTE } from "../../services/timeService";
import type { TimeZones, TimelineInterval } from "../../types";
import { cn } from "../../utils/cn";

interface Props {
  /** Instante elegido (`selectedTime`, en ms). */
  selectedTime: number;
  now: number;
  range: TimeRange;
  mode: TimeMode;
  isNight: boolean;
  /** Día elegido: 0 = hoy … 6. */
  dayOffset: number;
  onSelectDay(offset: number): void;
  intervals: TimelineInterval[] | null;
  /** Zonas de procedencia del dato: observado · presente · previsión. */
  zones?: TimeZones | null;
  /** Procedencia del instante elegido («Observado», «Previsión»…). */
  provenance?: string | null;
  onScrub(ms: number): void;
  onNow(): void;
  onHide(): void;
  compact?: boolean;
}

const chip = (active: boolean) =>
  cn(
    "rounded-full px-3 py-1.5 text-[11px] font-medium leading-none outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-sun/60",
    active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
  );

/**
 * Línea de tiempo del día solar: el día (Hoy · Mañana · otra fecha), la hora elegida, «Ahora» para
 * volver al presente y la barra con el indicador solar. Al moverla cambian el sol, las sombras y
 * las nubes del mapa (sin peticiones de red).
 */
export default function TimeSlider(p: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const { range, selectedTime, now } = p;

  const span = Math.max(1, range.end - range.start);
  const frac = (ms: number) => clamp((ms - range.start) / span, 0, 1);
  const thumb = frac(selectedTime);
  /** Hora presente del día elegido; se marca solo cuando no coincide con el indicador. */
  const present = presentOnDay(now, p.dayOffset);
  const presentInRange = p.mode === "ahead" && present >= range.start && present <= range.end;
  const isNow = p.mode === "now" && p.dayOffset === 0;

  const scrubFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 1);
    p.onScrub(Math.round((range.start + f * span) / MINUTE) * MINUTE);
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
    if (e.key === "ArrowRight" || e.key === "ArrowUp") p.onScrub(selectedTime + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") p.onScrub(selectedTime - step);
    else if (e.key === "Home") p.onScrub(range.start);
    else if (e.key === "End") p.onScrub(range.end);
    else return;
    e.preventDefault();
  };

  let label: string;
  if (isNow) label = p.isNight ? "Ahora · sin sol" : "Ahora";
  else {
    const delta = selectedTime - now;
    label =
      p.dayOffset === 0 && Math.abs(delta) < 12 * HOUR
        ? delta > 0
          ? `En ${formatDuration(delta)}`
          : `Hace ${formatDuration(-delta)}`
        : dayChoiceLabel(dayStartFor(now, p.dayOffset), now);
  }
  if (p.provenance && !(isNow && p.isNight)) label += ` · ${p.provenance}`;

  // Etiquetas horarias cada 4 h (o 3 h si el día es corto), más el orto y el ocaso a los lados.
  const every = span < 11 * HOUR ? 3 : 4;
  const marks: number[] = [];
  for (let t = Math.ceil(range.start / HOUR) * HOUR; t < range.end; t += HOUR) {
    if (getZoneParts(t).hour % every === 0) marks.push(t);
  }
  const obs = p.zones?.observedUntil != null && p.dayOffset === 0 ? frac(p.zones.observedUntil) : 0;
  const pres = p.zones?.presentUntil != null && p.dayOffset === 0 ? Math.max(obs, frac(p.zones.presentUntil)) : 0;

  return (
    <div
      className={cn("fts-glass fts-rise w-full rounded-[24px]", p.compact ? "px-3.5 pb-3 pt-2.5" : "px-5 pb-3.5 pt-3")}
      style={{ animationDelay: "600ms" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Día" className="flex min-w-0 items-center gap-0.5">
          <button type="button" className={chip(p.dayOffset === 0)} onClick={() => p.onSelectDay(0)} aria-pressed={p.dayOffset === 0}>
            Hoy
          </button>
          <button type="button" className={chip(p.dayOffset === 1)} onClick={() => p.onSelectDay(1)} aria-pressed={p.dayOffset === 1}>
            Mañana
          </button>
          <label className="relative">
            <span className="sr-only">Otro día</span>
            <select
              value={p.dayOffset > 1 ? p.dayOffset : ""}
              onChange={(e) => e.target.value && p.onSelectDay(Number(e.target.value))}
              className={cn(chip(p.dayOffset > 1), "appearance-none bg-transparent pr-3")}
            >
              <option value="">{p.compact ? "Fecha" : "Otra fecha"}</option>
              {[2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {dayChoiceLabel(dayStartFor(now, d), now)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isNow && (
            <button
              type="button"
              onClick={p.onNow}
              className="fts-fade-in rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold text-ink outline-none transition-colors hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              Ahora
            </button>
          )}
          <button
            type="button"
            onClick={p.onHide}
            aria-label="Ocultar la línea de tiempo"
            title="Ocultar la línea de tiempo"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            <span aria-hidden className="-mt-0.5 text-[11px]">
              ▾
            </span>
          </button>
        </div>
      </div>

      <div className={cn("flex items-end justify-between gap-3", p.compact ? "mt-1.5" : "mt-2")}>
        <p className="min-w-0 truncate text-[10.5px] font-medium text-ink-soft">{label}</p>
        <p className={cn("shrink-0 font-serif leading-none tabular-nums text-ink", p.compact ? "text-[24px]" : "text-[30px]")}>
          {formatClock(selectedTime)}
        </p>
      </div>

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
        className="relative mt-1 h-9 cursor-pointer touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-sun/50 rounded-full"
      >
        <div className="fts-track absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" />

        {p.intervals?.map((iv, i) => {
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

        {!p.intervals && (
          <div
            className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-sun/80"
            style={{ width: `${thumb * 100}%`, transition: dragging ? "none" : "width 120ms linear" }}
          />
        )}

        {/* procedencia: observado (continuo) · presente (ámbar) · previsión (discontinuo) */}
        {p.dayOffset === 0 && (obs > 0 || pres > 0) && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(50%+9px)] h-[2px]">
            {obs > 0 && <i className="absolute inset-y-0 left-0 rounded-full bg-ink/35" style={{ width: `${obs * 100}%` }} />}
            {pres > obs && (
              <i className="absolute inset-y-0 rounded-full bg-sun" style={{ left: `${obs * 100}%`, width: `${(pres - obs) * 100}%` }} />
            )}
            {pres < 1 && <i className="fts-forecast-dash absolute inset-y-0 right-0" style={{ left: `${pres * 100}%` }} />}
          </div>
        )}

        {presentInRange && (
          <span
            title="Ahora"
            className="absolute top-[calc(50%-13px)] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: `${frac(present) * 100}%` }}
          />
        )}

        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${thumb * 100}%`, transition: dragging ? "none" : "left 120ms linear" }}
        >
          <span className="fts-thumb-halo absolute -inset-3 rounded-full" />
          <span className={cn("fts-thumb relative block h-[20px] w-[20px] rounded-full transition-transform duration-300", dragging && "scale-[1.18]")} />
        </div>
      </div>

      <div className="relative h-3.5 text-[9.5px] tabular-nums text-ink-faint">
        <span className="absolute left-0">{formatClock(range.start)}</span>
        {marks.map((t) =>
          frac(t) > 0.1 && frac(t) < 0.9 ? (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${frac(t) * 100}%` }}>
              {formatClock(t)}
            </span>
          ) : null
        )}
        <span className="absolute right-0">{formatClock(range.end)}</span>
      </div>
    </div>
  );
}

/** Versión compacta de la línea de tiempo: la hora elegida y el día, con un toque para desplegarla. */
export function TimelineCollapsed({
  selectedTime,
  dayLabel,
  onShow,
}: {
  selectedTime: number;
  dayLabel: string;
  onShow(): void;
}) {
  return (
    <button
      type="button"
      onClick={onShow}
      aria-label="Mostrar la línea de tiempo"
      title="Mostrar la línea de tiempo"
      className="fts-glass fts-rise flex w-full items-center justify-between gap-3 rounded-[24px] px-5 pb-3.5 pt-3 text-left"
      style={{ animationDelay: "600ms" }}
    >
      <span className="min-w-0">
        <span className="fts-caps block truncate">{dayLabel}</span>
        <span className="mt-1 block font-serif text-[26px] leading-none tabular-nums text-ink">{formatClock(selectedTime)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        Hora
        <span aria-hidden className="text-[11px]">
          ▴
        </span>
      </span>
    </button>
  );
}
