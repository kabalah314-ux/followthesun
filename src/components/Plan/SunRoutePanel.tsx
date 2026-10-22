import { useEffect, useRef, useState } from "react";
import { BARCELONA } from "../../config";
import type { SunShadeMode } from "../../lib/answer";
import { placeSlug, withTimeQuery } from "../../lib/deepLinks";
import { fmtMin } from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { dayStartFor, zonedMs } from "../../lib/planningTime";
import { urlWith } from "../../lib/routing";
import { shareOrCopy } from "../../services/planShareService";
import { solarService } from "../../services/solarService";
import { planRoute, type PlannedRoute } from "../../services/sunRouteService";
import { formatClock } from "../../services/timeService";
import type { LngLat, SearchProgress as Progress, SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { Caps, PrimaryButton } from "../FindSun/ui";
import SearchProgress from "../FindSun/SearchProgress";
import { tr } from "../../i18n";

const MIN = 60_000;
const HOUR = 3_600_000;

type Slot = "now" | "afternoon" | "tomorrow-morning" | "tomorrow-afternoon";

/** Franja de cada opción (de la hora presente a la puesta, como mucho 4 h). */
function slotRange(slot: Slot, now: number, mode: SunShadeMode): { start: number; end: number } | null {
  const sun = (off: number) => solarService.getSunTimes(dayStartFor(now, off), BARCELONA.lat, BARCELONA.lng);
  const at = (off: number, minutes: number) => zonedMs(dayStartFor(now, off), minutes);
  const round = (t: number) => Math.ceil(t / (15 * MIN)) * 15 * MIN;
  let start: number;
  let end: number;
  switch (slot) {
    case "now":
      start = round(now);
      end = mode === "sun" ? Math.min(start + 4 * HOUR, sun(0).sunset) : start + 3 * HOUR;
      break;
    case "afternoon":
      start = round(Math.max(now, at(0, 16 * 60)));
      end = mode === "sun" ? sun(0).sunset : Math.max(start + 2 * HOUR, at(0, 20 * 60));
      break;
    case "tomorrow-morning":
      start = at(1, 10 * 60);
      end = at(1, 13 * 60 + 30);
      break;
    case "tomorrow-afternoon":
      start = at(1, 16 * 60);
      end = mode === "sun" ? sun(1).sunset : at(1, 20 * 60);
      break;
  }
  return end - start >= 75 * MIN ? { start, end } : null;
}

const SLOTS: Array<{ id: Slot; label: "route.ahora" | "planning.esta_tarde" | "route.manana_por_la_manana" | "route.manana_por_la_tarde" }> = [
  { id: "now", label: "route.ahora" },
  { id: "afternoon", label: "planning.esta_tarde" },
  { id: "tomorrow-morning", label: "route.manana_por_la_manana" },
  { id: "tomorrow-afternoon", label: "route.manana_por_la_tarde" },
];

/**
 * La ruta del sol (la idea que da nombre a la app): una tarde encadenando 2–4 sitios para estar
 * siempre al sol (o a la sombra), con paseos cortos entre ellos. Programación dinámica sobre los
 * mejores sitios cercanos (`lib/sunRoute.ts`).
 */
export default function SunRoutePanel({
  now,
  appMode,
  origin,
  hasLocation,
  onUseLocation,
  route,
  onRoute,
  onPickStop,
  activeId,
}: {
  now: number;
  appMode: SunShadeMode;
  /** Desde dónde se sale (tu ubicación o el centro). */
  origin: LngLat | null;
  hasLocation: boolean;
  onUseLocation(): void;
  route: PlannedRoute | null;
  onRoute(r: PlannedRoute | null): void;
  onPickStop(r: SunSearchResult, stopIndex: number): void;
  activeId: string | null;
}) {
  const [mode, setMode] = useState<SunShadeMode>(appMode);
  const [maxWalk, setMaxWalk] = useState(12);
  const [slot, setSlot] = useState<Slot>(() => (slotRange("now", now, appMode) ? "now" : "tomorrow-afternoon"));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [failed, setFailed] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const range = slotRange(slot, now, mode);

  const run = async () => {
    if (!range) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setFailed(false);
    onRoute(null);
    try {
      const r = await planRoute({
        origin: origin ?? { lng: BARCELONA.lng, lat: BARCELONA.lat },
        start: range.start,
        end: range.end,
        mode,
        maxWalk,
        signal: c.signal,
        onProgress: setProgress,
      });
      if (c.signal.aborted) return;
      onRoute(r);
      if (!r) setFailed(true);
    } catch {
      if (!c.signal.aborted) setFailed(true);
    } finally {
      if (!c.signal.aborted) {
        setBusy(false);
        setProgress(null);
      }
    }
  };

  const share = async () => {
    if (!route) return;
    const lines = [tr("route.mi_ruta_del_sol"), ""];
    route.stops.forEach((s, i) => {
      const slug = placeSlug(s.result.place);
      const url = slug ? `${window.location.origin}${urlWith({ slug }, withTimeQuery("", s.start))}` : "";
      lines.push(`${i + 1}. ${formatClock(s.start)}–${formatClock(s.end)} · ${s.result.place.name}${url ? `\n${url}` : ""}`);
    });
    const res = await shareOrCopy({ title: tr("route.mi_ruta_del_sol"), text: lines.join("\n"), url: window.location.origin });
    void res;
  };

  const chip = (on: boolean) =>
    cn(
      "h-11 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
      on ? "bg-ink text-paper" : "border border-line text-ink hover:bg-ink/[0.05]"
    );

  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{mode === "shade" ? tr("route.intro_sombra") : tr("route.intro_sol")}</p>

      <Caps className="mt-4">{tr("route.cuando")}</Caps>
      <div className="fts-scroll-x -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {SLOTS.map((s) => {
          const ok = !!slotRange(s.id, now, mode);
          return (
            <button key={s.id} type="button" disabled={!ok} aria-pressed={slot === s.id} onClick={() => setSlot(s.id)} className={cn(chip(slot === s.id), !ok && "opacity-40")}>
              {tr(s.label)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <div>
          <Caps>{tr("route.buscar")}</Caps>
          <div className="mt-2 flex gap-1.5">
            <button type="button" aria-pressed={mode === "sun"} onClick={() => setMode("sun")} className={chip(mode === "sun")}>
              {tr("pointPanel.sol")}
            </button>
            <button type="button" aria-pressed={mode === "shade"} onClick={() => setMode("shade")} className={chip(mode === "shade")}>
              {tr("findSunPanel.sombra")}
            </button>
          </div>
        </div>
        <div>
          <Caps>{tr("route.paseos_de_como_mucho")}</Caps>
          <div className="mt-2 flex gap-1.5">
            {[8, 12, 18].map((m) => (
              <button key={m} type="button" aria-pressed={maxWalk === m} onClick={() => setMaxWalk(m)} className={chip(maxWalk === m)}>
                {tr("filters.min", { p0: m })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-ink-soft">
        {hasLocation ? tr("route.desde_tu_ubicacion") : tr("route.desde_el_centro")}
        {!hasLocation && (
          <>
            {" · "}
            <button type="button" onClick={onUseLocation} className="font-semibold text-sun-deep underline-offset-4 hover:underline">
              {tr("nearbyStrip.usar_mi_ubicacion")}
            </button>
          </>
        )}
      </p>

      {busy ? (
        <div className="mt-4">
          <SearchProgress progress={progress} onCancel={() => {
            ctrl.current?.abort();
            setBusy(false);
          }} />
        </div>
      ) : (
        <PrimaryButton onClick={() => void run()} disabled={!range} className="mt-4 w-full justify-center">
          {route ? tr("route.calcular_otra") : tr("route.calcular")}
        </PrimaryButton>
      )}
      {!range && <p className="mt-2 text-[13px] text-ink-soft">{tr("route.franja_demasiado_corta")}</p>}
      {failed && !busy && <p className="mt-3 text-[14px] leading-snug text-ink-soft">{tr("route.sin_ruta")}</p>}

      {route && !busy && (
        <section aria-label={tr("route.tu_ruta")} className="fts-fade-in mt-5">
          <p className="font-serif text-[22px] leading-tight text-ink">
            {route.single ? tr("route.quedate_en", { p0: route.stops[0].result.place.name }) : tr("route.tu_ruta")}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {formatClock(route.stops[0].start)}–{formatClock(route.stops[route.stops.length - 1].end)} ·{" "}
            {route.mode === "shade" ? tr("route.de_sombra", { p0: fmtMin(route.sunMinutes) }) : tr("route.de_sol", { p0: fmtMin(route.sunMinutes) })}
            {route.walkMinutes > 0 && ` · ${tr("route.andando", { p0: route.walkMinutes })}`}
          </p>
          <ol className="mt-3">
            {route.stops.map((s, i) => (
              <li key={`${s.result.placeId}-${i}`}>
                {i > 0 && (
                  <p className="flex items-center gap-2 py-1.5 pl-3.5 text-[12.5px] text-ink-soft">
                    <span aria-hidden className="h-5 w-px bg-ink/20" />
                    {tr("route.a_pie", { p0: s.walkBefore })}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onPickStop(s.result, i)}
                  aria-current={activeId === s.result.placeId ? "true" : undefined}
                  className={cn(
                    "flex min-h-[64px] w-full items-start gap-3 rounded-[18px] border px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                    activeId === s.result.placeId ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60 hover:bg-ink/[0.04]"
                  )}
                >
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", route.mode === "shade" ? "bg-shade text-white" : "bg-sun text-ink")}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold tabular-nums text-ink-soft">
                      {formatClock(s.start)}–{formatClock(s.end)}
                    </span>
                    <span className="mt-0.5 block truncate text-[15px] font-semibold text-ink">{s.result.place.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-soft">
                      {PLACE_TYPE_LABEL[s.result.locationType]?.singular} ·{" "}
                      {route.mode === "shade" ? tr("route.min_de_sombra", { p0: s.minutes }) : tr("route.min_de_sol", { p0: s.minutes })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => void share()}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-line text-[14px] font-semibold text-ink outline-none transition-colors hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            {tr("route.compartir_la_ruta")}
          </button>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">{tr("route.nota")}</p>
        </section>
      )}
    </div>
  );
}
