import { useState } from "react";
import { BARCELONA } from "../../config";
import { sportPicks, wantedPct, type SportState, type SportTarget } from "../../hooks/useSportRoute";
import type { SunShadeMode } from "../../lib/answer";
import { fmtMeters } from "../../lib/formatSun";
import { dayStartFor } from "../../lib/planningTime";
import { LOOP_KM, circuitsFor, fileSlug, gpxOf, sportMapsUrl, type CircuitId, type Sport } from "../../lib/sportRoutes";
import { solarService } from "../../services/solarService";
import { formatClock } from "../../services/timeService";
import { WALK_ROUTE_ATTRIBUTION } from "../../services/walkRouteService";
import type { LngLat } from "../../types";
import { cn } from "../../utils/cn";
import { Caps, PrimaryButton } from "../FindSun/ui";
import { tr, type MessageKey } from "../../i18n";

/**
 * Correr o ir en bici a la sombra (guía maestra 2, utilidad 31): circuitos conocidos o una vuelta
 * desde donde estás, y a qué hora salir para ir a la sombra (o al sol) a primera o a última hora.
 */

const NOTE: Record<CircuitId, MessageKey> = {
  ciutadella: "sport.c_ciutadella",
  santjoan: "sport.c_santjoan",
  montjuic: "sport.c_montjuic",
  aigues: "sport.c_aigues",
  diagonal: "sport.c_diagonal",
  maritim: "sport.c_maritim",
};

type Choice = CircuitId | "loop";

const MIN = 60_000;

function downloadGpx(name: string, text: string) {
  const blob = new Blob([text], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileSlug(name)}.gpx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const chip = (on: boolean) =>
  cn(
    "h-11 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
    on ? "bg-ink text-paper" : "border border-line text-ink hover:bg-ink/[0.05]"
  );

export default function SportPanel({
  now,
  appMode,
  origin,
  onUseLocation,
  state,
  onCompute,
  onCancel,
  onSelectSlot,
  onNextRoute,
  onShowTime,
}: {
  now: number;
  appMode: SunShadeMode;
  /** Tu ubicación (para la vuelta desde donde estás). */
  origin: LngLat | null;
  onUseLocation(): void;
  state: SportState;
  onCompute(target: SportTarget, sport: Sport, dayStart: number, now: number, mode: SunShadeMode): void;
  onCancel(): void;
  onSelectSlot(index: number): void;
  onNextRoute(): void;
  /** Lleva el mapa (y su sombra) a esa hora. */
  onShowTime(t: number): void;
}) {
  const prev = state.target;
  const [sport, setSport] = useState<Sport>(prev ? state.sport : "run");
  const [mode, setMode] = useState<SunShadeMode>(prev ? state.mode : appMode);
  const [choice, setChoice] = useState<Choice | null>(prev ? (prev.kind === "loop" ? "loop" : prev.circuit.id) : null);
  const [km, setKm] = useState<number>(prev?.kind === "loop" ? prev.km : 5);
  // Ya de noche (o casi): de entrada, mañana.
  const [dayOffset, setDayOffset] = useState<0 | 1>(() =>
    now > solarService.getSunTimes(dayStartFor(now, 0), BARCELONA.lat, BARCELONA.lng).sunset - 40 * MIN ? 1 : 0
  );

  const circuits = circuitsFor(sport);
  const pickSport = (s: Sport) => {
    setSport(s);
    if (choice && choice !== "loop" && !circuitsFor(s).some((c) => c.id === choice)) setChoice(null);
    setKm(s === "bike" ? 15 : 5);
  };

  let target: SportTarget | null = null;
  if (choice === "loop") target = origin ? { kind: "loop", start: origin, km } : null;
  else {
    const c = circuits.find((x) => x.id === choice);
    if (c) target = { kind: "circuit", circuit: c };
  }
  const run = () => {
    if (target) onCompute(target, sport, dayStartFor(now, dayOffset), now, mode);
  };

  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{mode === "shade" ? tr("sport.intro") : tr("sport.intro_sol")}</p>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
        <div>
          <Caps>{tr("sport.deporte")}</Caps>
          <div className="mt-2 flex gap-1.5">
            {(["run", "bike"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sport === s} onClick={() => pickSport(s)} className={chip(sport === s)}>
                {s === "run" ? tr("sport.correr") : tr("sport.bici")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Caps>{tr("sport.dia")}</Caps>
          <div className="mt-2 flex gap-1.5">
            <button type="button" aria-pressed={dayOffset === 0} onClick={() => setDayOffset(0)} className={chip(dayOffset === 0)}>
              {tr("sport.hoy")}
            </button>
            <button type="button" aria-pressed={dayOffset === 1} onClick={() => setDayOffset(1)} className={chip(dayOffset === 1)}>
              {tr("sport.manana")}
            </button>
          </div>
        </div>
        <div>
          <Caps>{tr("sport.prefiero")}</Caps>
          <div className="mt-2 flex gap-1.5">
            <button type="button" aria-pressed={mode === "shade"} onClick={() => setMode("shade")} className={chip(mode === "shade")}>
              {tr("findSunPanel.sombra")}
            </button>
            <button type="button" aria-pressed={mode === "sun"} onClick={() => setMode("sun")} className={chip(mode === "sun")}>
              {tr("pointPanel.sol")}
            </button>
          </div>
        </div>
      </div>

      <Caps className="mt-5">{tr("sport.recorrido")}</Caps>
      <ul className="mt-2 grid gap-2">
        {circuits.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => setChoice(c.id)}
              className={cn(
                "flex min-h-[60px] w-full items-start gap-3 rounded-[18px] border px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                choice === c.id ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60 hover:bg-ink/[0.04]"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink-soft">
                    {fmtMeters((c.km[sport] ?? 0) * 1000)} · {c.outAndBack ? tr("sport.ida_y_vuelta") : tr("sport.circuito")}
                  </span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{tr(NOTE[c.id])}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <div className={cn("rounded-[18px] border px-3.5 py-3", choice === "loop" ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60")}>
            <button
              type="button"
              aria-pressed={choice === "loop"}
              onClick={() => setChoice("loop")}
              className="block w-full rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              <span className="block text-[15px] font-semibold text-ink">{tr("sport.vuelta_desde_aqui")}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{tr("sport.vuelta_desde_aqui_desc")}</span>
            </button>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {LOOP_KM[sport].map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={choice === "loop" && km === k}
                  onClick={() => {
                    setChoice("loop");
                    setKm(k);
                  }}
                  className={chip(choice === "loop" && km === k)}
                >
                  {fmtMeters(k * 1000)}
                </button>
              ))}
            </div>
            {choice === "loop" && !origin && (
              <p className="mt-2 text-[13px] leading-snug text-ink-soft">
                {tr("sport.necesita_ubicacion")}{" "}
                <button type="button" onClick={onUseLocation} className="font-semibold text-sun-deep underline-offset-4 hover:underline">
                  {tr("nearbyStrip.usar_mi_ubicacion")}
                </button>
              </p>
            )}
          </div>
        </li>
      </ul>

      {state.status === "loading" ? (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.08]">
            <div className="h-full rounded-full bg-sun transition-[width] duration-300" style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[13px] text-ink-soft">
            <span>{tr("sport.calculando", { p0: Math.round(state.progress * 100) })}</span>
            <button type="button" onClick={onCancel} className="min-h-[44px] font-semibold text-ink underline-offset-4 hover:underline">
              {tr("sport.cancelar")}
            </button>
          </div>
        </div>
      ) : (
        <PrimaryButton onClick={run} disabled={!target} className="mt-4 w-full justify-center">
          {tr("sport.calcular")}
        </PrimaryButton>
      )}
      {state.status === "error" && <p className="mt-3 text-[14px] leading-snug text-ink-soft">{tr("sport.error")}</p>}
      {state.status === "ready" && <SportResult state={state} onSelectSlot={onSelectSlot} onNextRoute={onNextRoute} onShowTime={onShowTime} />}
    </div>
  );
}

function SportResult({
  state,
  onSelectSlot,
  onNextRoute,
  onShowTime,
}: {
  state: SportState;
  onSelectSlot(index: number): void;
  onNextRoute(): void;
  onShowTime(t: number): void;
}) {
  const r = state.routes[state.route];
  if (!r) return null;
  const shade = state.mode === "shade";
  const name = state.target?.kind === "circuit" ? state.target.circuit.name : tr("sport.vuelta_de", { p0: fmtMeters(r.distanceM) });
  const picks = sportPicks(state, r);
  const recommended = new Set([picks.morning?.slot, picks.evening?.slot].filter((t): t is number => t !== undefined));
  const pctOf = (i: number) => wantedPct(r.shadePct[i] ?? 0, state.mode);
  const selT = state.slots[state.slot];
  const selPct = pctOf(state.slot);
  const choose = (i: number) => {
    onSelectSlot(i);
    onShowTime(state.slots[i]);
  };

  const reco = (which: "morning" | "evening"): string | null => {
    const p = picks[which];
    if (!p) return null;
    const time = formatClock(p.slot);
    if (!p.good) {
      return tr(shade ? "sport.reco_mejor_sombra" : "sport.reco_mejor_sol", {
        p0: tr(which === "morning" ? "sport.por_la_manana" : "sport.por_la_tarde"),
        p1: time,
        p2: p.pct,
      });
    }
    const key: MessageKey =
      which === "morning" ? (shade ? "sport.reco_manana_sombra" : "sport.reco_manana_sol") : shade ? "sport.reco_tarde_sombra" : "sport.reco_tarde_sol";
    return tr(key, { p0: time, p1: p.pct });
  };

  const group = (label: MessageKey, times: number[]) =>
    times.length > 0 && (
      <div className="mt-3">
        <Caps>{tr(label)}</Caps>
        <div className="fts-scroll-x -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {times.map((t) => {
            const i = state.slots.indexOf(t);
            const p = pctOf(i);
            const on = i === state.slot;
            const star = recommended.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => choose(i)}
                aria-label={`${formatClock(t)} · ${shade ? tr("sport.pct_sombra", { p0: p }) : tr("sport.pct_sol", { p0: p })}${star ? ` · ${tr("sport.recomendada")}` : ""}`}
                className={cn(
                  "flex min-h-[60px] w-[70px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] border text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                  on ? "border-ink bg-ink text-paper" : star ? "border-sun/70 bg-sun-soft text-ink" : "border-line bg-paper/60 text-ink hover:bg-ink/[0.04]"
                )}
              >
                <span className="text-[13px] font-semibold tabular-nums">
                  {formatClock(t)}
                  {star && <span aria-hidden> ★</span>}
                </span>
                <span className={cn("h-1.5 w-11 overflow-hidden rounded-full", on ? "bg-paper/25" : "bg-ink/[0.08]")}>
                  <span className={cn("block h-full rounded-full", shade ? "bg-shade" : "bg-sun")} style={{ width: `${p}%` }} />
                </span>
                <span className="text-[11.5px] tabular-nums opacity-80">{p} %</span>
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <section aria-label={name} className="fts-fade-in mt-5">
      <p className="font-serif text-[22px] leading-tight text-ink">{name}</p>
      <p className="mt-1 text-[13px] text-ink-soft">
        {tr(state.sport === "bike" ? "sport.distancia_tiempo_bici" : "sport.distancia_tiempo_correr", { p0: fmtMeters(r.distanceM), p1: r.minutes })}
      </p>

      {state.slots.length === 0 ? (
        <p className="mt-3 text-[14px] leading-snug text-ink-soft">{tr("sport.sin_sol_hoy")}</p>
      ) : (
        <>
          <ul className="mt-3 grid gap-1.5">
            {(["morning", "evening"] as const).map((w) => {
              const line = reco(w);
              return line ? (
                <li key={w} className="flex items-start gap-2 text-[14px] leading-snug text-ink">
                  <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", shade ? "bg-shade" : "bg-sun")} />
                  {line}
                </li>
              ) : null;
            })}
          </ul>

          {state.now !== null && group("route.ahora", [state.now])}
          {group("sport.primera_hora", state.morning)}
          {group("sport.ultima_hora", state.evening)}

          {selT !== undefined && (
            <div className="mt-3 rounded-[18px] bg-ink/[0.04] px-3.5 py-3">
              <p className="text-[14px] leading-snug text-ink">
                {tr(shade ? "sport.saliendo" : "sport.saliendo_sol", {
                  p0: formatClock(selT),
                  p1: fmtMeters((r.distanceM * selPct) / 100),
                  p2: fmtMeters(r.distanceM),
                  p3: selPct,
                })}
              </p>
              <button
                type="button"
                onClick={() => onShowTime(selT)}
                className="mt-1 min-h-[44px] text-[13.5px] font-semibold text-sun-deep underline-offset-4 hover:underline"
              >
                {tr("sport.ver_mapa", { p0: formatClock(selT) })}
              </button>
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {state.routes.length > 1 && (
          <button type="button" onClick={onNextRoute} className={chip(false)}>
            {tr("sport.otra_vuelta", { p0: state.route + 1, p1: state.routes.length })}
          </button>
        )}
        <button type="button" onClick={() => downloadGpx(name, gpxOf(name, r.coords))} className={chip(false)}>
          {tr("sport.gpx")}
        </button>
        <a href={sportMapsUrl(r.coords, state.sport)} target="_blank" rel="noopener noreferrer" className={cn(chip(false), "inline-flex items-center")}>
          {tr("sport.google_maps")} ↗
        </a>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">
        {tr(state.trees ? "sport.nota_arboles" : "sport.nota")} {tr("sport.rutas_de", { p0: WALK_ROUTE_ATTRIBUTION })}
      </p>
    </section>
  );
}
