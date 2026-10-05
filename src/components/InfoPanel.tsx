import { memo, useState } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { compassLabel, type SunTimes } from "../services/solarService";
import { formatClock, formatDuration } from "../services/timeService";
import type { CityDirection, CityStats, SunState } from "../types";
import { cn } from "../utils/cn";
import { SunGlyph } from "./Icons";
import Legend from "./Legend";
import SourceStatusLine from "./SourceStatusLine";

const SIDE: Record<CityDirection, string> = {
  north: "norte",
  northeast: "noreste",
  east: "este",
  southeast: "sureste",
  south: "sur",
  southwest: "suroeste",
  west: "oeste",
  northwest: "noroeste",
  everywhere: "",
  none: "",
  scattered: "",
};

type Headline = { label: string; glyph: SunState | "night" };

/**
 * Titular claro: Sol · Sol entre nubes · Nublado · De noche. Sin porcentajes ambiguos.
 * Sin datos de nubes el sol no está verificado y se dice.
 */
function headline(stats: CityStats, up: boolean, weatherKnown: boolean, forecast: boolean, loading: boolean): Headline {
  if (!up) return { label: "De noche", glyph: "night" };
  if (!weatherKnown) return { label: loading ? "Mirando las nubes…" : "Sol (sin datos de nubes)", glyph: "partial" };
  const c = stats.cloudPercent;
  if (c < 25) return { label: forecast ? "Sol previsto" : "Sol", glyph: "sun" };
  if (c < 65) return { label: "Sol entre nubes", glyph: "partial" };
  return { label: "Nublado", glyph: "cloud" };
}

function subline(up: boolean, time: number, times: SunTimes): string {
  if (up) return `Se pone a las ${formatClock(times.sunset)} · quedan ${formatDuration(times.sunset - time)} de luz`;
  return time < times.solarNoon
    ? `El sol sale a las ${formatClock(times.sunrise)}`
    : `Mañana sale hacia las ${formatClock(times.sunrise)}`;
}

function describe(
  stats: CityStats,
  up: boolean,
  time: number,
  times: SunTimes,
  weatherKnown: boolean
): string {
  const zone = stats.zoom < 14.2 ? "ciudad" : "zona";
  if (!up) {
    return time < times.solarNoon
      ? `Aún no ha amanecido. El primer sol llegará a las ${formatClock(times.sunrise)}.`
      : `El sol ya se ha puesto. Mañana volverá a salir hacia las ${formatClock(times.sunrise)}.`;
  }

  let text: string;
  switch (stats.direction) {
    case "everywhere":
      text = `El sol está iluminando casi toda la ${zone}.`;
      break;
    case "none":
      text = `Casi toda la ${zone} está en sombra o bajo nubes.`;
      break;
    case "scattered":
      text = `La luz se reparte entre sombras y claros por toda la ${zone}.`;
      break;
    default:
      text = `El sol está iluminando principalmente el lado ${SIDE[stats.direction]} de la ${zone}.`;
  }
  if (!weatherKnown) text += " Aún sin datos de nubes.";
  else if (stats.cloudPercent >= 25 && stats.direction !== "none") {
    text += " Las nubes velan parte de la luz.";
  }
  return text;
}

interface Props {
  stats: CityStats | null;
  time: number;
  sunTimes: SunTimes;
  up: boolean;
  altitudeDeg: number;
  azimuthDeg: number;
  light: LightSourceState;
  showClouds: boolean;
  showShadows: boolean;
}

function InfoPanelBase({
  stats,
  time,
  sunTimes,
  up,
  altitudeDeg,
  azimuthDeg,
  light,
  showClouds,
  showShadows,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const s: CityStats =
    stats ??
    ({
      sunPercent: 0,
      shadePercent: 0,
      cloudPercent: 0,
      direction: "scattered",
      altitudeDeg,
      azimuthDeg,
      area: "Barcelona",
      zoom: 13.7,
    } as CityStats);

  const kind = light.summary.kind;
  const weatherKnown = kind !== "unavailable" && kind !== "loading";
  const head = headline(s, up, weatherKnown, kind === "forecast", kind === "loading");
  const text = stats
    ? describe(s, up, time, sunTimes, weatherKnown)
    : "Calculando la luz sobre la ciudad…";

  return (
    <section
      className={cn(
        "fts-glass fts-rise transition-[border-radius,padding] duration-300",
        expanded
          ? "w-[min(calc(100vw-1.5rem),292px)] rounded-[24px] p-4 sm:p-[18px]"
          : "w-[min(calc(100vw-1.5rem),318px)] rounded-[22px] p-1.5 pr-3"
      )}
      style={{ animationDelay: "600ms" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Ocultar información solar" : "Ver información solar"}
        className={cn(
          "group flex w-full items-center text-left transition-colors",
          expanded ? "justify-between gap-3" : "gap-2.5 rounded-[18px] hover:bg-ink/[0.035]"
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <SunGlyph state={head.glyph} size={expanded ? 30 : 27} className="shrink-0 transition-all duration-500" />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold tracking-[0.04em] text-ink" data-testid="sky-state">
              {head.label} <span className="font-normal text-ink-faint">· {s.area}</span>
            </p>
            <p className="truncate text-[11px] leading-tight text-ink-soft" data-testid="sky-subline">
              {subline(up, time, sunTimes)}
            </p>
          </div>
        </div>
        <span className="ml-1 flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "ml-0.5 text-[11px] text-ink-faint transition-transform duration-300",
              expanded && "rotate-180"
            )}
          >
            ▾
          </span>
        </span>
      </button>

      {!expanded && up && (
        <div className="px-2.5 pb-1 pt-1.5">
          <Legend showClouds={showClouds} showShadows={showShadows} compact />
        </div>
      )}
      {expanded && (
        <div className="fts-fade-in">
          <p className="mt-3 text-[12px] leading-[1.5] text-ink-soft">{text}</p>
          <div className="mt-3.5 space-y-3 border-t border-line pt-3">
            {up && <Legend showClouds={showClouds} showShadows={showShadows} />}
            <SourceStatusLine light={light} />
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] tabular-nums text-ink-faint">
              {up ? `Sol a ${Math.round(altitudeDeg)}° · ${compassLabel(azimuthDeg)}` : "Bajo el horizonte"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(InfoPanelBase);
