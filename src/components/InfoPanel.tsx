import { memo } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { compassLabel, type SunTimes } from "../services/solarService";
import { formatClock } from "../services/timeService";
import type { CityDirection, CityStats, SunState } from "../types";
import { AnimatedNumber } from "./AnimatedNumber";
import { SunGlyph } from "./Icons";
import SourceStatusLine from "./SourceStatusLine";
import { tr } from "../i18n";

const SIDE: Record<CityDirection, string> = {
  north: tr("infoPanel.norte"),
  northeast: tr("infoPanel.noreste"),
  east: tr("infoPanel.este"),
  southeast: tr("infoPanel.sureste"),
  south: tr("infoPanel.sur"),
  southwest: tr("infoPanel.suroeste"),
  west: tr("infoPanel.oeste"),
  northwest: tr("infoPanel.noroeste"),
  everywhere: "",
  none: "",
  scattered: "",
};

type Headline = { label: string; glyph: SunState | "night" };

/** Sin datos de nubes el sol no está verificado: «Sol posible», nunca «Sol directo». */
export function cityHeadline(stats: CityStats | null, up: boolean, weatherKnown: boolean, forecast: boolean): Headline {
  if (!up) return { label: tr("infoPanel.sin_sol"), glyph: "night" };
  const p = stats?.sunPercent ?? 0;
  if (!weatherKnown) return { label: tr("sunDetails.sol_posible"), glyph: p >= 8 ? "partial" : "shade" };
  if (p >= 60) return { label: forecast ? tr("infoPanel.sol_directo_previsto") : tr("sunDetails.sol_directo"), glyph: "sun" };
  if (p >= 30) return { label: forecast ? tr("infoPanel.sol_parcial_previsto") : tr("infoPanel.sol_parcial"), glyph: "partial" };
  if (p >= 8) return { label: tr("infoPanel.poco_sol"), glyph: "partial" };
  return (stats?.cloudPercent ?? 0) >= 30
    ? { label: tr("infoPanel.cielo_cubierto"), glyph: "cloud" }
    : { label: tr("findSunPanel.sombra"), glyph: "shade" };
}

function describe(stats: CityStats, up: boolean, time: number, times: SunTimes, weatherKnown: boolean): string {
  const zone = stats.zoom < 14.2 ? tr("infoPanel.ciudad") : tr("infoPanel.zona");
  if (!up) {
    return time < times.solarNoon
      ? tr("infoPanel.aun_no_ha_amanecido_el", { p0: formatClock(times.sunrise) })
      : tr("infoPanel.el_sol_ya_se_ha", { p0: formatClock(times.sunrise) });
  }
  let text: string;
  switch (stats.direction) {
    case "everywhere":
      text = tr("infoPanel.el_sol_esta_iluminando_casi", { p0: zone });
      break;
    case "none":
      text = tr("infoPanel.casi_toda_la_esta_en", { p0: zone });
      break;
    case "scattered":
      text = tr("infoPanel.la_luz_se_reparte_entre", { p0: zone });
      break;
    default:
      text = tr("infoPanel.el_sol_ilumina_sobre_todo", { p0: SIDE[stats.direction], p1: zone });
  }
  if (!weatherKnown) text += tr("infoPanel.aun_sin_datos_de_nubes");
  else if (stats.cloudPercent >= 25 && stats.direction !== "none") text += tr("infoPanel.las_nubes_velan_parte_de");
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
  const text = stats ? describe(stats, up, time, sunTimes, weatherKnown) : tr("infoPanel.calculando_la_luz_sobre_la");

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
      <p key={text} className="fts-fade-in mt-3.5 text-[13.5px] leading-[1.55] text-ink-soft">
        {text}
      </p>
      <div className="mt-3.5 space-y-2.5 border-t border-line pt-3">
        <SourceStatusLine light={light} />
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] tabular-nums text-ink-faint">
          {up ? tr("infoPanel.sol_a", { p0: Math.round(altitudeDeg), p1: compassLabel(azimuthDeg) }) : tr("infoPanel.bajo_el_horizonte")} {tr("infoPanel.del_area_visible_con_sol")}
        </p>
      </div>
    </div>
  );
}

export default memo(InfoPanelBase);
