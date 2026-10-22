import { useEffect, useState } from "react";
import { fmtMin } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { dayChoiceLabel } from "../../lib/planningTime";
import { WEEK_HOURS, type CellState } from "../../lib/weekGrid";
import { formatClock } from "../../services/timeService";
import { analyzeWeek, type WeekDay } from "../../services/weekService";
import type { SunPlace } from "../../types";
import { cn } from "../../utils/cn";
import { Caps } from "../FindSun/ui";
import { tr, type MessageKey } from "../../i18n";

export interface WeekCandidate {
  key: string;
  label: string;
  place: SunPlace;
}

const CELL: Record<CellState, string> = {
  sun: "bg-sun",
  partial: "bg-sun/45",
  shade: "bg-shade/50",
  cloud: "bg-ink/25",
  night: "bg-ink/[0.06]",
};

const STATE_KEY: Record<CellState, MessageKey> = {
  sun: "week.estado_sun",
  partial: "week.estado_partial",
  shade: "week.estado_shade",
  cloud: "week.estado_cloud",
  night: "week.estado_night",
};

const HATCH = "repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 5px)";

/**
 * Esta semana: siete días por horas con el mejor momento de cada día para un sitio (el elegido,
 * tu casa o uno guardado). Con previsión de nubes los dos primeros días; después, «sol posible»
 * (rayado): solo el sol y los edificios.
 */
export default function WeekPanel({
  now,
  candidates,
  onPickPlace,
}: {
  now: number;
  candidates: WeekCandidate[];
  /** Elegir otro sitio en el mapa o en Mis sitios. */
  onPickPlace(): void;
}) {
  const [key, setKey] = useState<string | null>(candidates[0]?.key ?? null);
  const current = candidates.find((c) => c.key === key) ?? candidates[0] ?? null;
  const [days, setDays] = useState<WeekDay[]>([]);
  const [busy, setBusy] = useState(false);
  const placeId = current?.place.id ?? null;

  useEffect(() => {
    if (!current) return;
    const ctrl = new AbortController();
    setDays([]);
    setBusy(true);
    void analyzeWeek(current.place, Date.now(), (d) => !ctrl.signal.aborted && setDays((prev) => [...prev, d]), ctrl.signal).finally(
      () => !ctrl.signal.aborted && setBusy(false)
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  if (!current) {
    return (
      <div className="rounded-[20px] border border-dashed border-line px-4 py-5 text-center">
        <p className="font-serif text-[19px] leading-tight text-ink">{tr("week.elige_un_sitio")}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{tr("week.elige_un_sitio_hint")}</p>
        <button type="button" onClick={onPickPlace} className="mt-3 min-h-[44px] text-[14px] font-semibold text-sun-deep underline-offset-4 hover:underline">
          {tr("week.ir_a_explorar")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{tr("week.intro")}</p>
      {candidates.length > 1 && (
        <div className="fts-scroll-x -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {candidates.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.key === current.key}
              onClick={() => setKey(c.key)}
              className={cn(
                "h-11 max-w-[220px] shrink-0 truncate rounded-full px-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                c.key === current.key ? "bg-ink text-paper" : "border border-line text-ink hover:bg-ink/[0.05]"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 truncate text-[15px] font-semibold text-ink">
        {current.place.name}
        <span className="ml-1.5 text-[12.5px] font-normal text-ink-faint">{PLACE_TYPE_LABEL[current.place.type]?.singular}</span>
      </p>

      <div className="mt-3" role="table" aria-label={tr("week.cuadricula", { p0: current.place.name })}>
        <div role="row" className="flex items-end gap-2 pb-1">
          <span role="columnheader" className="w-[62px] shrink-0" />
          <div className="relative h-4 flex-1 text-[11.5px] tabular-nums text-ink-faint">
            {WEEK_HOURS.filter((h) => h % 2 === 0).map((h) => (
              <span key={h} role="columnheader" className="absolute -translate-x-1/2" style={{ left: `${((h - WEEK_HOURS[0] + 0.5) / WEEK_HOURS.length) * 100}%` }}>
                {h}
              </span>
            ))}
          </div>
        </div>
        {days.map((d) => (
          <div key={d.dayOffset} role="row" className="border-t border-line py-2">
            <div className="flex items-center gap-2">
              <span role="rowheader" className="w-[62px] shrink-0 truncate text-[13px] font-semibold text-ink">
                {dayChoiceLabel(d.dayStart, now)}
              </span>
              <div className="flex flex-1 gap-[3px]">
                {d.cells.map((c) => (
                  <span
                    key={c.hour}
                    role="cell"
                    aria-label={`${c.hour}:00 · ${tr(STATE_KEY[c.state])}${c.unverified ? ` · ${tr("week.posible")}` : ""}`}
                    className={cn("h-6 flex-1 rounded-[5px]", CELL[c.state], d.best && c.start >= d.best.start - 3_600_000 && c.start < d.best.end && "ring-1 ring-inset ring-sun-deep/60")}
                    style={c.unverified ? { backgroundImage: HATCH } : undefined}
                  />
                ))}
              </div>
            </div>
            <p className="mt-1 pl-[70px] text-[12.5px] leading-snug text-ink-soft">
              {d.best
                ? tr("week.mejor_momento", { p0: formatClock(d.best.start), p1: formatClock(d.best.end), p2: fmtMin(d.sunMinutes) })
                : tr("week.sin_sol_directo")}
            </p>
          </div>
        ))}
        {busy &&
          Array.from({ length: Math.max(0, 7 - days.length) }, (_, i) => (
            <div key={`s${i}`} className="border-t border-line py-2">
              <div className="fts-shimmer h-6 rounded-[6px]" style={{ animationDelay: `${i * 90}ms` }} />
            </div>
          ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-ink-soft">
        {(["sun", "partial", "shade", "cloud"] as CellState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <i className={cn("block h-3 w-3 rounded-[3px]", CELL[s])} />
            {tr(STATE_KEY[s])}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <i className="block h-3 w-3 rounded-[3px] bg-sun" style={{ backgroundImage: HATCH }} />
          {tr("week.posible")}
        </span>
      </div>
      <Caps className="mt-4">{tr("week.como_se_calcula")}</Caps>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{tr("week.nota")}</p>
    </div>
  );
}
