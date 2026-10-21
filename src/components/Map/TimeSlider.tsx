import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimeMode, TimeRange } from "../../hooks/useTimeController";
import { clamp } from "../../lib/coordinates";
import { dayChoiceLabel, dayStartFor } from "../../lib/planningTime";
import type { TimelineSun } from "../../lib/timelineRange";
import { formatClock, formatDuration, getZoneParts, HOUR, MINUTE, startOfZoneDay } from "../../services/timeService";
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
  /** Horas del sol del día enseñado; `nextDay` = de noche se enseña el de mañana. */
  day?: { sun: TimelineSun; nextDay: boolean };
}

const chip = (active: boolean) =>
  cn(
    "relative rounded-full px-3 py-1.5 text-[12.5px] font-medium leading-none outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-sun/60",
    active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
  );

/** Amplía la zona táctil de un botón pequeño (~44 px de alto) sin cambiar su tamaño visible. */
function HitArea() {
  return <span aria-hidden className="absolute -inset-x-1 -inset-y-2.5" />;
}

/**
 * Línea de tiempo del día solar completo: del amanecer a la puesta, con media hora de crepúsculo a
 * cada lado. Lo ya pasado queda atenuado pero se puede recorrer; la hora dorada va marcada y
 * «Ahora» devuelve al presente. De noche enseña el día siguiente. Al moverla cambian el sol, las
 * sombras y las nubes del mapa (sin peticiones de red).
 */
export default function TimeSlider(p: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const { range, selectedTime, now } = p;

  const span = Math.max(1, range.end - range.start);
  const frac = (ms: number) => clamp((ms - range.start) / span, 0, 1);
  const thumb = frac(selectedTime);
  const isNow = p.mode === "now" && p.dayOffset === 0;
  const sun = p.day?.sun ?? null;
  const nextDay = !!p.day?.nextDay;
  /** El presente cae dentro de la franja: se atenúa lo pasado y se marca «ahora». */
  const presentInRange = p.dayOffset === 0 && !nextDay && now >= range.start && now <= range.end;
  const nowFrac = presentInRange ? frac(now) : 0;
  const golden = sun
    ? [
        { start: sun.sunrise, end: sun.goldenMorningEnd },
        { start: sun.goldenEveningStart, end: sun.sunset },
      ].filter((g) => g.end > g.start)
    : [];
  const inGolden = golden.some((g) => selectedTime >= g.start && selectedTime <= g.end);
  const sunriseFrac = sun ? frac(sun.sunrise) : 0;
  const sunsetFrac = sun ? frac(sun.sunset) : 1;

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
  if (isNow) {
    label = p.isNight ? "Ahora · sin sol" : "Ahora";
    if (p.isNight && nextDay && sun) label += ` · mañana sale a las ${formatClock(sun.sunrise)}`;
  } else {
    const delta = selectedTime - now;
    label =
      Math.abs(delta) < 12 * HOUR
        ? delta > 0
          ? `En ${formatDuration(delta)}`
          : `Hace ${formatDuration(-delta)}`
        : dayChoiceLabel(startOfZoneDay(selectedTime), now);
  }
  if (inGolden && !p.isNight) label += " · hora dorada";
  if (p.provenance && !(isNow && p.isNight)) label += ` · ${p.provenance}`;

  // Etiquetas horarias cada 4 h (o 3 h si el día es corto), entre el amanecer y la puesta.
  const every = span < 12 * HOUR ? 3 : 4;
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
            <HitArea />
            Hoy
          </button>
          <button type="button" className={chip(p.dayOffset === 1)} onClick={() => p.onSelectDay(1)} aria-pressed={p.dayOffset === 1}>
            <HitArea />
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
              aria-label="Volver a ahora"
              className="fts-fade-in relative inline-flex items-center gap-1.5 rounded-full bg-sun px-3.5 py-1.5 text-[13px] font-semibold leading-none text-ink shadow-sm outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-sun-deep/60"
            >
              <HitArea />
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink" />
              Ahora
            </button>
          )}
          <button
            type="button"
            onClick={p.onHide}
            aria-label="Ocultar la línea de tiempo"
            title="Ocultar la línea de tiempo"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            <HitArea />
            <span aria-hidden className="-mt-0.5 text-[12.5px]">
              ▾
            </span>
          </button>
        </div>
      </div>

      <div className={cn("flex items-end justify-between gap-3", p.compact ? "mt-1.5" : "mt-2")}>
        <p className="min-w-0 truncate text-[12.5px] font-medium text-ink-soft">{label}</p>
        <p className={cn("shrink-0 font-serif leading-none tabular-nums text-ink", p.compact ? "text-[24px]" : "text-[30px]")}>
          {formatClock(selectedTime)}
        </p>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={nextDay ? "Hora de mañana" : "Hora del día"}
        aria-valuemin={range.start}
        aria-valuemax={range.end}
        aria-valuenow={Math.round(clamp(selectedTime, range.start, range.end))}
        aria-valuetext={formatClock(selectedTime)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative mt-1 h-9 cursor-pointer touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-sun/50 rounded-full"
      >
        <div className="fts-track absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" />

        {/* crepúsculo antes del amanecer y después de la puesta */}
        {sun && (
          <>
            <div
              aria-hidden
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-l-full bg-shade/30"
              style={{ width: `${sunriseFrac * 100}%` }}
            />
            <div
              aria-hidden
              className="absolute right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-r-full bg-shade/30"
              style={{ width: `${(1 - sunsetFrac) * 100}%` }}
            />
          </>
        )}

        {/* hora dorada: la primera hora con sol y la última */}
        {golden.map((g) => (
          <div
            key={g.start}
            aria-hidden
            title="Hora dorada"
            className="absolute top-[calc(50%-10px)] h-[3px] rounded-full bg-sun-deep/60"
            style={{ left: `${frac(g.start) * 100}%`, width: `${Math.max(0.6, (frac(g.end) - frac(g.start)) * 100)}%` }}
          />
        ))}

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
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-sun/80"
            style={{
              left: `${sunriseFrac * 100}%`,
              width: `${Math.max(0, Math.min(thumb, sunsetFrac) - sunriseFrac) * 100}%`,
              transition: dragging ? "none" : "width 120ms linear",
            }}
          />
        )}

        {/* lo ya pasado de hoy: atenuado, pero se puede volver a él */}
        {presentInRange && nowFrac > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-0 rounded-l-full bg-paper/55"
            style={{ width: `${nowFrac * 100}%` }}
          />
        )}

        {/* procedencia: observado (continuo) · presente (ámbar) · previsión (discontinuo) */}
        {p.dayOffset === 0 && !nextDay && (obs > 0 || pres > 0) && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(50%+9px)] h-[2px]">
            {obs > 0 && <i className="absolute inset-y-0 left-0 rounded-full bg-ink/35" style={{ width: `${obs * 100}%` }} />}
            {pres > obs && (
              <i className="absolute inset-y-0 rounded-full bg-sun" style={{ left: `${obs * 100}%`, width: `${(pres - obs) * 100}%` }} />
            )}
            {pres < 1 && <i className="fts-forecast-dash absolute inset-y-0 right-0" style={{ left: `${pres * 100}%` }} />}
          </div>
        )}

        {presentInRange && p.mode === "ahead" && (
          <span
            title="Ahora"
            className="absolute top-[calc(50%-13px)] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: `${nowFrac * 100}%` }}
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

      <div className="relative h-4 text-[12px] tabular-nums text-ink-faint">
        {sun ? (
          <>
            <span className="absolute flex items-center gap-0.5 whitespace-nowrap" style={{ left: `${sunriseFrac * 100}%` }} title="Amanecer">
              <span aria-hidden className="text-sun-deep">
                ↑
              </span>
              <span className="sr-only">Amanecer a las</span>
              {formatClock(sun.sunrise)}
            </span>
            {marks.map((t) =>
              frac(t) > sunriseFrac + 0.13 && frac(t) < sunsetFrac - 0.13 ? (
                <span key={t} className="absolute -translate-x-1/2" style={{ left: `${frac(t) * 100}%` }}>
                  {formatClock(t)}
                </span>
              ) : null
            )}
            <span
              className="absolute flex items-center gap-0.5 whitespace-nowrap"
              style={{ right: `${(1 - sunsetFrac) * 100}%` }}
              title="Puesta de sol"
            >
              <span className="sr-only">Puesta de sol a las</span>
              {formatClock(sun.sunset)}
              <span aria-hidden className="text-sun-deep">
                ↓
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="absolute left-0">{formatClock(range.start)}</span>
            <span className="absolute right-0">{formatClock(range.end)}</span>
          </>
        )}
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
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        Hora
        <span aria-hidden className="text-[12.5px]">
          ▴
        </span>
      </span>
    </button>
  );
}
