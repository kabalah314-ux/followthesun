import { memo } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { compassLabel, type SunTimes } from "../services/solarService";
import { formatClock } from "../services/timeService";
import type { CityDirection, CityStats, SunState } from "../types";
import { AnimatedNumber } from "./AnimatedNumber";
import { SunGlyph } from "./Icons";
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

/** Sin datos de nubes el sol no está verificado: «Sol posible», nunca «Sol directo». */
export function cityHeadline(stats: CityStats | null, up: boolean, weatherKnown: boolean, forecast: boolean): Headline {
  if (!up) return { label: "Sin sol", glyph: "night" };
  const p = stats?.sunPercent ?? 0;
  if (!weatherKnown) return { label: "Sol posible", glyph: p >= 8 ? "partial" : "shade" };
  if (p >= 60) return { label: forecast ? "Sol directo previsto" : "Sol directo", glyph: "sun" };
  if (p >= 30) return { label: forecast ? "Sol parcial previsto" : "Sol parcial", glyph: "partial" };
  if (p >= 8) return { label: "Poco sol", glyph: "partial" };
  return (stats?.cloudPercent ?? 0) >= 30
    ? { label: "Cielo cubierto", glyph: "cloud" }
    : { label: "Sombra", glyph: "shade" };
}

function describe(stats: CityStats, up: boolean, time: number, times: SunTimes, weatherKnown: boolean): string {
  const zone = stats.zoom < 14.2 ? "ciudad" : "zona";
  if (!up) {
    return time < times.solarNoon
      ? `Aún no ha amanecido. El primer sol llegará a las ${formatClock(times.sunrise)}.`
      : `El sol ya se ha puesto. Volverá a salir hacia las ${formatClock(times.sunrise)}.`;
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
      text = `El sol ilumina sobre todo el lado ${SIDE[stats.direction]} de la ${zone}.`;
  }
  if (!weatherKnown) text += " Aún sin datos de nubes.";
  else if (stats.cloudPercent >= 25 && stats.direction !== "none") text += " Las nubes velan parte de la luz.";
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
}

/**
 * Resumen de la luz de la zona visible. No está siempre en pantalla: se despliega desde el estado
 * del sol (nivel 4 de información) y lleva dentro el detalle de las fuentes (nivel 5).
 */
function InfoPanelBase({ stats, time, sunTimes, up, altitudeDeg, azimuthDeg, light }: Props) {
  const kind = light.summary.kind;
  const weatherKnown = kind !== "unavailable" && kind !== "loading";
  const head = cityHeadline(stats, up, weatherKnown, kind === "forecast");
  const pct = up ? (stats?.sunPercent ?? 0) : 0;
  const text = stats ? describe(stats, up, time, sunTimes, weatherKnown) : "Calculando la luz sobre la ciudad…";

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SunGlyph state={head.glyph} size={32} className="shrink-0" />
          <div className="min-w-0">
            <p className="fts-caps whitespace-nowrap">{head.label}</p>
            <p className="mt-1.5 truncate font-serif text-[21px] leading-none text-ink">{stats?.area ?? "Barcelona"}</p>
          </div>
        </div>
        <p className="shrink-0 font-serif text-[44px] leading-[0.82] tracking-tight text-ink">
          <AnimatedNumber value={pct} />
          <span className="ml-0.5 align-top text-[18px] text-ink-soft">%</span>
        </p>
      </div>
      <p key={text} className="fts-fade-in mt-3.5 text-[12.5px] leading-[1.55] text-ink-soft">
        {text}
      </p>
      <div className="mt-3.5 space-y-2.5 border-t border-line pt-3">
        <SourceStatusLine light={light} />
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] tabular-nums text-ink-faint">
          {up ? `Sol a ${Math.round(altitudeDeg)}° · ${compassLabel(azimuthDeg)}` : "Bajo el horizonte"} · % del área visible con sol directo
        </p>
      </div>
    </div>
  );
}

export default memo(InfoPanelBase);
