import type { ShadeRouteState } from "../../hooks/useShadeRoute";
import type { SunShadeMode } from "../../lib/answer";
import { dayChoiceLabel } from "../../lib/planningTime";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import { WALK_ROUTE_ATTRIBUTION } from "../../services/walkRouteService";
import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

/**
 * «Ir por la sombra» / «Ir por el sol» en la ficha (utilidad 19): botón, alternativas con su % a la
 * sombra (o al sol) a la hora de paso y enlace para seguir la elegida en Google Maps.
 */

const gmaps = (s: ShadeRouteState, wps: Array<[number, number]>) => {
  if (!s.from || !s.to) return "#";
  const p = new URLSearchParams({
    api: "1",
    origin: `${s.from.lat.toFixed(5)},${s.from.lng.toFixed(5)}`,
    destination: `${s.to.lat.toFixed(5)},${s.to.lng.toFixed(5)}`,
    travelmode: "walking",
  });
  if (wps.length > 0) p.set("waypoints", wps.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
};

export default function RouteBlock({
  state,
  placeId,
  mode,
  onRoute,
  onClear,
}: {
  state: ShadeRouteState | null;
  placeId: string;
  mode: SunShadeMode;
  onRoute(): void;
  onClear(): void;
}) {
  const mine = state && state.placeId === placeId && state.status !== "idle" ? state : null;
  if (!mine) {
    return (
      <button
        type="button"
        onClick={onRoute}
        className="mt-1.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-line px-4 text-[13.5px] font-semibold text-ink outline-none transition-colors hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 19c3-1 4-4 7-4s4 3 7 4" />
          <path d="M12 3v6M9 6l3-3 3 3" />
        </svg>
        {mode === "shade" ? tr("route.ir_por_la_sombra") : tr("route.ir_por_el_sol")}
      </button>
    );
  }
  const title = mine.mode === "shade" ? tr("route.titulo_sombra") : tr("route.titulo_sol");
  return (
    <section aria-label={title} aria-busy={mine.status === "loading"} className="mt-2 rounded-[18px] border border-line px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="fts-caps !text-[11.5px]">
          {title} ·{" "}
          {startOfZoneDay(mine.departure) === startOfZoneDay(Date.now())
            ? tr("route.sale_a_las", { p0: formatClock(mine.departure) })
            : tr("route.sale_dia", { p0: dayChoiceLabel(startOfZoneDay(mine.departure), Date.now()).toLowerCase(), p1: formatClock(mine.departure) })}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="-my-2 min-h-[44px] rounded-full px-2 text-[12.5px] font-semibold text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          {tr("compare.quitar")}
        </button>
      </div>
      {mine.status === "loading" && <p className="mt-2 text-[13px] text-ink-soft">{tr("route.calculando")}</p>}
      {mine.status === "night" && <p className="mt-2 text-[13px] text-ink-soft">{tr("route.de_noche")}</p>}
      {mine.status === "error" && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          <span className="text-[13px] text-ink-soft">{tr("route.error")}</span>
          <button type="button" onClick={onRoute} className="min-h-[44px] text-[13px] font-semibold text-sun-deep underline-offset-4 hover:underline">
            {tr("forYou.reintentar")}
          </button>
        </div>
      )}
      {mine.status === "ready" && (
        <>
          <ul className="mt-1.5">
            {mine.routes.map((r, i) => {
              const pct = mine.mode === "shade" ? r.shadePct : 100 - r.shadePct;
              const best = i === mine.best;
              return (
                <li key={i} className={cn("flex items-center justify-between gap-3 py-1.5", i > 0 && "border-t border-line")}>
                  <div className="min-w-0">
                    <p className={cn("text-[13.5px] tabular-nums", best ? "font-semibold text-ink" : "text-ink-soft")}>
                      {tr("route.minutos", { p0: r.minutes })}
                      {r.extraMinutes > 0 ? ` (+${r.extraMinutes})` : ""} · {tr(mine.mode === "shade" ? "route.pct_sombra" : "route.pct_sol", { p0: pct })}
                    </p>
                    {best && mine.routes.length > 1 && <p className="text-[12px] text-sun-deep">{tr("route.la_mejor")}</p>}
                  </div>
                  <a
                    href={gmaps(mine, r.waypoints)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] shrink-0 items-center text-[12.5px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                  >
                    {tr("route.abrir")} ↗
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">
            {tr(mine.trees ? "route.nota_arboles" : "route.nota")} {WALK_ROUTE_ATTRIBUTION}
          </p>
        </>
      )}
    </section>
  );
}
