import { useEffect, useState } from "react";
import WindowStrip from "../components/FindSun/WindowStrip";
import { LogoMark } from "../components/Logo";
import { parsePlaceSlug } from "../lib/deepLinks";
import { fmtMin } from "../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../lib/placeTypes";
import { cloudService } from "../services/cloudService";
import { resolvePlaceRef } from "../services/placeLinkService";
import { satelliteService } from "../services/satelliteService";
import { solarService } from "../services/solarService";
import { formatClock, startOfZoneDay } from "../services/timeService";
import type { SunPlace, SunSearchResult, SunWindow } from "../types";
import { tr } from "../i18n";

/**
 * La tarjeta del widget: el sol del día en el lugar (de la salida a la puesta, con edificios,
 * relieve y nubes del motor), sus tramos de sol directo y un enlace a la ficha completa.
 * Parámetros: `?tema=oscuro` (por defecto, claro).
 */

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; place: SunPlace; result: SunSearchResult | null; start: number; end: number; tomorrow: boolean; slug: string };

const MIN = 60_000;
const HOUR = 3_600_000;

/** Tramos de al menos 10 min de las clases pedidas (huecos de hasta 5 min se ignoran). */
export function sunRanges(windows: readonly SunWindow[], kinds: readonly SunWindow["kind"][] = ["sun"]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const w of windows) {
    if (!kinds.includes(w.kind)) continue;
    const last = out[out.length - 1];
    if (last && w.start - last[1] <= 5 * MIN) last[1] = Math.max(last[1], w.end);
    else out.push([w.start, w.end]);
  }
  return out.filter(([a, b]) => b - a >= 10 * MIN);
}

const totalMinutes = (ranges: Array<[number, number]>) => Math.round(ranges.reduce((acc, [a, b]) => acc + (b - a), 0) / MIN);

export default function SunWidget() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tema") === "oscuro") document.documentElement.dataset.theme = "night";
    cloudService.start();
    satelliteService.start();
    const slug = decodeURIComponent(window.location.pathname.replace(/^\/widget\/?/, "").replace(/\/+$/, ""));
    const ref = parsePlaceSlug(slug);
    if (!ref) {
      setState({ kind: "missing" });
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const place = await resolvePlaceRef(ref);
        if (!place) {
          if (alive) setState({ kind: "missing" });
          return;
        }
        const now = Date.now();
        let day = startOfZoneDay(now);
        let t = solarService.getSunTimes(day, place.latitude, place.longitude);
        let tomorrow = false;
        // Pasada la puesta, el widget enseña el día siguiente.
        if (now > t.sunset - 15 * MIN) {
          day = startOfZoneDay(day + 30 * HOUR);
          t = solarService.getSunTimes(day, place.latitude, place.longitude);
          tomorrow = true;
        }
        // El motor analiza como mucho 14 h seguidas.
        const noon = (t.sunrise + t.sunset) / 2;
        const start = Math.max(t.sunrise, noon - 7 * HOUR);
        const end = Math.min(t.sunset, noon + 7 * HOUR);
        const { findBestSunPlaces } = await import("../services/sunSearchService");
        const out = await findBestSunPlaces(
          { startTime: start, endTime: end, minimumSunlightMinutes: 30, locationType: "any", locationTypes: [place.type], limit: 1 },
          { places: [place], now }
        );
        const result = out.results[0] ?? out.bestAvailable[0] ?? null;
        if (alive) setState({ kind: "ready", place, result, start, end, tomorrow, slug });
      } catch {
        if (alive) setState({ kind: "missing" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const shell = "flex h-full flex-col justify-between rounded-[18px] border border-line bg-[var(--paper)] px-4 py-3 text-ink";

  if (state.kind === "loading") {
    return (
      <div className={shell} aria-busy="true">
        <div className="fts-shimmer h-4 w-24 rounded-full" />
        <div className="fts-shimmer h-6 w-48 rounded-full" />
        <div className="fts-shimmer h-[10px] rounded-full" />
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <div className={shell}>
        <p className="text-[13.5px] text-ink-soft">{tr("widget.no_encontrado")}</p>
        <a href="/" target="_blank" rel="noopener" className="text-[12.5px] font-semibold text-sun-deep">
          I Follow the Sun ↗
        </a>
      </div>
    );
  }

  const { place, result, start, end, tomorrow, slug } = state;
  // Primero el sol directo; si no lo hay, el sol suave entre nubes; si tampoco, «sin sol».
  const direct = result ? sunRanges(result.windows, ["sun"]) : [];
  const soft = direct.length === 0 && result ? sunRanges(result.windows, ["sun", "partial"]) : [];
  const ranges = direct.length > 0 ? direct : soft;
  const minutes = totalMinutes(ranges);
  const span = ranges.map(([a, b]) => `${formatClock(a)}–${formatClock(b)}`).join(" · ");
  const type = PLACE_TYPE_LABEL[place.type]?.singular ?? "";
  const href = `${window.location.origin}/lugar/${slug}`;
  return (
    <div className={shell}>
      <div>
        <p className="fts-caps truncate !text-[11px]">
          {tomorrow ? tr("widget.manana") : tr("widget.hoy")}
          {type ? ` · ${type}` : ""}
        </p>
        <p className="mt-1 truncate font-serif text-[21px] leading-[1.1]">{place.name}</p>
        <p className="mt-1 truncate text-[13.5px] font-semibold">
          {direct.length > 0 ? tr("widget.sol", { p0: span }) : soft.length > 0 ? tr("widget.sol_suave", { p0: span }) : tr("widget.sin_sol")}
        </p>
      </div>
      <div>
        {result && <WindowStrip windows={result.windows} start={start} end={end} />}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-ink-faint">
          <a href={href} target="_blank" rel="noopener" className="flex items-center gap-1.5 font-semibold text-ink-soft hover:text-ink">
            <LogoMark size={16} />
            I Follow the Sun ↗
          </a>
          {minutes > 0 && (
            <span className="tabular-nums">{tr(direct.length > 0 ? "widget.total" : "widget.total_suave", { p0: fmtMin(minutes) })}</span>
          )}
        </div>
      </div>
    </div>
  );
}
