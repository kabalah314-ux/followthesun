import { memo, useState } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { compassLabel, type SunTimes } from "../services/solarService";
import { formatClock } from "../services/timeService";
import type { CityDirection, CityStats, SunState } from "../types";
import { cn } from "../utils/cn";
import { AnimatedNumber } from "./AnimatedNumber";
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
 * Titular de la ciudad. Sin datos de nubes el sol no está verificado: se dice "Sol posible" en
 * lugar de afirmar "Sol directo". Para instantes futuros se habla de previsión.
 */
function headline(stats: CityStats, up: boolean, weatherKnown: boolean, forecast: boolean): Headline {
  if (!up) return { label: "Sin sol", glyph: "night" };
  const p = stats.sunPercent;
  if (!weatherKnown) return { label: "Sol posible", glyph: p >= 8 ? "partial" : "shade" };
  if (p >= 60) return { label: forecast ? "Sol directo previsto" : "Sol directo", glyph: "sun" };
  if (p >= 30) return { label: forecast ? "Sol parcial previsto" : "Sol parcial", glyph: "partial" };
  if (p >= 8) return { label: "Poco sol", glyph: "partial" };
  return stats.cloudPercent >= 30
    ? { label: "Cielo cubierto", glyph: "cloud" }
    : { label: "Sombra", glyph: "shade" };
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
  const head = headline(s, up, weatherKnown, kind === "forecast");
  const pct = up ? s.sunPercent : 0;
  const text = stats
    ? describe(s, up, time, sunTimes, weatherKnown)
    : "Calculando la luz sobre la ciudad…";

  return (
    <section
      className={cn(
        "fts-glass fts-rise transition-[border-radius,padding] duration-300",
        expanded
          ? "w-[min(calc(100vw-1.5rem),292px)] rounded-[24px] p-4 sm:p-[18px]"
          : "w-[min(calc(100vw-1.5rem),234px)] rounded-full p-1.5 pr-3"
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
          expanded ? "justify-between gap-3" : "gap-2.5 rounded-full hover:bg-ink/[0.035]"
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <SunGlyph state={head.glyph} size={expanded ? 30 : 27} className="shrink-0 transition-all duration-500" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold tracking-[0.08em] text-ink">{head.label}</p>
            <p className="truncate font-serif text-[13px] leading-tight text-ink-soft">{s.area}</p>
          </div>
        </div>
        <span className="ml-1 flex shrink-0 items-center gap-1.5">
          <span className="font-serif text-[24px] leading-none tabular-nums tracking-tight text-ink">
            <AnimatedNumber value={pct} />
            <span className="ml-px text-[12px] text-ink-soft">%</span>
          </span>
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
