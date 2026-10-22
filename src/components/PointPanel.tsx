import { memo, useMemo, useState, type ReactNode } from "react";
import { useComfort } from "../hooks/useComfort";
import { describePoint, type SunAnswer, type SunShadeMode } from "../lib/answer";
import { feelsLine, uvLine, windLine, type Comfort } from "../lib/comfort";
import { solarService } from "../services/solarService";
import {
  confidenceLevel,
  influenceLevel,
  type CloudInfluenceLevel,
  type ConfidenceLevel,
} from "../lib/sunlightCalculations";
import { dayChoiceInSentence, dayChoiceLabel } from "../lib/planningTime";
import { formatAge, formatClock, formatDayLabel, formatDuration, startOfZoneDay } from "../services/timeService";
import type {
  ConfidenceBreakdown,
  DataOrigin,
  PointTimeline,
  SelectedPoint,
  SunState,
  SunlightResult,
} from "../types";
import { cn } from "../utils/cn";
import { CloseIcon, SunGlyph } from "./Icons";
import { tr } from "../i18n";

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: tr("sunDetails.seguro"),
  medium: tr("sunDetails.bastante_seguro"),
  low: tr("sunDetails.depende_de_las_nubes"),
};

const INFLUENCE_LABEL: Record<CloudInfluenceLevel, string> = {
  low: tr("pointPanel.cielo_despejado"),
  moderate: tr("pointPanel.alguna_nube_puede_taparlo_a"),
  high: tr("pointPanel.las_nubes_lo_tapan_casi"),
};

const DATA_ORIGIN_TEXT: Record<DataOrigin, string> = {
  observed: tr("pointPanel.muestra_del_satelite"),
  interpolated: tr("pointPanel.interpolado_entre_dos_observaciones"),
  estimated: tr("pointPanel.persistencia_de_la_ultima_observacion"),
  stale: tr("pointPanel.observacion_antigua"),
  forecast: tr("pointPanel.modelo_meteorologico"),
  unavailable: tr("pointPanel.sin_datos"),
};

type Headline = { label: string; glyph: SunState | "night"; unverified: boolean };

function headline(r: SunlightResult): Headline {
  const forecast = r.origin === "forecast";
  switch (r.state) {
    case "night":
      return { label: tr("infoPanel.sin_sol"), glyph: "night", unverified: false };
    case "urban_shadow":
      return { label: tr("sunDetails.sombra_urbana"), glyph: "shade", unverified: false };
    case "urban_shadow_cloud":
      return { label: tr("pointPanel.sombra_urbana_nubes"), glyph: "shade", unverified: false };
    case "terrain_shadow":
      return { label: tr("pointPanel.sombra_del_relieve"), glyph: "shade", unverified: false };
    // Sin datos de nubes el sol no está verificado: no se afirma "sol directo".
    case "possible":
      return { label: tr("sunDetails.sol_posible"), glyph: "partial", unverified: true };
    case "uncertain":
      return { label: tr("pointPanel.resultado_incierto"), glyph: "partial", unverified: false };
    case "cloud_blocked":
      return { label: forecast ? tr("pointPanel.nubes_previstas") : tr("pointPanel.las_nubes_tapan_el_sol"), glyph: "cloud", unverified: false };
    case "partial":
      return { label: forecast ? tr("infoPanel.sol_parcial_previsto") : tr("infoPanel.sol_parcial"), glyph: "partial", unverified: false };
    case "direct":
      return { label: forecast ? tr("infoPanel.sol_directo_previsto") : tr("sunDetails.sol_directo"), glyph: "sun", unverified: false };
  }
}

function shadowLabel(r: SunlightResult): string {
  if (r.urbanShadow) return tr("pointPanel.un_edificio_lo_tapa");
  if (r.terrainShadow) return tr("pointPanel.el_relieve_lo_tapa");
  return r.buildingsKnown ? tr("pointPanel.ningun_edificio_lo_tapa_ahora") : tr("pointPanel.sin_datos_de_edificios_aqui");
}

function radiationLabel(r: SunlightResult): string {
  if (r.origin === "forecast") return tr("pointPanel.solo_prevision");
  const s = r.satellite;
  if (s && s.directRadiation !== undefined) {
    if (s.origin === "observed") return tr("pointPanel.disponible");
    if (s.origin === "interpolated") return tr("pointPanel.interpolada");
    return tr("pointPanel.ultima_observacion");
  }
  return tr("pointPanel.no_disponible");
}

/** Procedencia del dato, en lenguaje claro. Nunca "en directo". */
function originLine(r: SunlightResult, now: number): string | null {
  if (r.state === "night") return null;
  if (!r.weatherAvailable) return tr("sunResultCard.sin_datos_de_nubes");
  if (r.origin === "forecast") {
    return r.cloud
      ? tr("pointPanel.segun_la_prevision_actualizada", { p0: formatAge(now - r.cloud.updatedAt.getTime()) })
      : tr("pointPanel.segun_la_prevision");
  }
  if (r.origin === "observed" && r.satellite) {
    return tr("pointPanel.comprobado_por_satelite", { p0: formatAge(now - r.satellite.sampleTime.getTime()) });
  }
  return r.satellite
    ? tr("pointPanel.estimado_con_el_satelite_de", { p0: formatAge(now - r.satellite.sampleTime.getTime()) })
    : tr("pointPanel.estimado");
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium leading-snug text-ink">{children}</dd>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const level = confidenceLevel(value);
  const bars = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={cn(
              "block w-[3px] rounded-full transition-colors duration-500",
              i < bars ? "bg-sun" : "bg-ink/15"
            )}
            style={{ height: 5 + i * 2.5 }}
          />
        ))}
      </span>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

function Breakdown({ b }: { b: ConfidenceBreakdown }) {
  const items: Array<[string, number]> = [
    [tr("pointPanel.sol"), b.solar],
    [tr("searchProgress.edificios"), b.geometry],
    [tr("sunDetails.meteorologia"), b.weather],
    [tr("pointPanel.satelite"), b.satellite],
    [tr("pointPanel.final"), b.final],
  ];
  return (
    <ul className="space-y-1.5">
      {items.map(([label, v]) => (
        <li key={label} className="flex items-center gap-2.5 text-[12px] text-ink-soft">
          <span className="w-[78px] shrink-0">{label}</span>
          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
            <i
              className={cn("block h-full rounded-full", label === tr("pointPanel.final") ? "bg-ink/70" : "bg-sun/80")}
              style={{ width: `${Math.round(clamp01(v) * 100)}%` }}
            />
          </span>
          <span className="w-7 text-right tabular-nums text-ink-faint">{v > 0 ? v.toFixed(2) : "—"}</span>
        </li>
      ))}
    </ul>
  );
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const km = (v: number | null) => (v == null ? null : String(v).replace(".", ","));

function SunlightBlock({
  r,
  now,
  answer,
  comfort,
}: {
  r: SunlightResult | null;
  now: number;
  answer: SunAnswer | null;
  comfort: Comfort | null;
}) {
  const [open, setOpen] = useState(false);

  if (!r || !answer) {
    return (
      <div className="mt-4 space-y-2" aria-busy="true">
        <div className="fts-shimmer h-[52px] rounded-2xl" />
        <div className="fts-shimmer h-[40px] rounded-2xl" style={{ animationDelay: "120ms" }} />
      </div>
    );
  }

  const head = headline(r);
  const origin = originLine(r, now);
  const wkm = km(r.spatial.weatherScaleKm);
  const night = r.state === "night" || answer.state === "night";

  let note: string | null = null;
  if (r.cloud?.simulated) note = tr("pointPanel.nubes_de_demostracion_no_son");
  else if (head.unverified) note = tr("pointPanel.aun_no_tenemos_las_nubes");
  else if (r.conflict) note = tr("pointPanel.el_satelite_y_la_prevision");
  else if (r.weatherQuality === "outdated") note = tr("pointPanel.los_datos_del_tiempo_no");

  return (
    <div className="mt-4">
      <div className="flex items-start gap-3">
        <SunGlyph state={answer.state} size={30} className="mt-0.5 shrink-0 transition-all duration-700" />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug text-ink">{answer.headline}</p>
          {answer.detail && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{answer.detail}</p>}
        </div>
      </div>

      {!night && (
        <dl className="mt-3.5 space-y-2.5 rounded-2xl bg-ink/[0.035] px-3.5 py-3">
          <Row label={tr("searchProgress.edificios")}>{shadowLabel(r)}</Row>
          <Row label={tr("sunDetails.nubes")}>{r.weatherAvailable ? INFLUENCE_LABEL[influenceLevel(r.cloudInfluence)] : tr("pointPanel.aun_sin_datos_de_nubes")}</Row>
          <Row label={tr("sunDetails.fiabilidad")}>
            <ConfidenceMeter value={r.confidence} />
          </Row>
          {comfort && <Row label={tr("pointPanel.sensacion")}>{feelsLine(comfort)}</Row>}
          {comfort && windLine(comfort) && <Row label={tr("pointPanel.viento")}>{windLine(comfort)}</Row>}
          {comfort && uvLine(comfort) && <Row label={tr("pointPanel.uv")}>{uvLine(comfort)}</Row>}
        </dl>
      )}
      {note && <p className="mt-2 text-[13px] leading-snug text-ink-soft">{note}</p>}

      {!night && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2.5 -ml-1 rounded-full px-1 py-1.5 text-[13px] font-semibold text-sun-deep underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            {open ? tr("pointPanel.ocultar") : tr("sunDetails.como_lo_sabemos")}
          </button>
          {open && (
            <div className="fts-fade-in mt-2 space-y-3 rounded-2xl border border-line px-3.5 py-3">
              <p className="text-[13px] leading-[1.55] text-ink-soft">
                {head.label} {tr("pointPanel.luz_directa")} {head.unverified ? tr("pointPanel.sin_confirmar") : `${Math.round(r.sunlightScore * 100)} %`}.
                {origin ? ` ${origin}.` : ""} {tr("pointPanel.radiacion_por_satelite")} {radiationLabel(r).toLowerCase()}.
              </p>
              <Breakdown b={r.confidenceBreakdown} />
              <p className="text-[12.5px] leading-[1.55] text-ink-soft">
                {tr("pointPanel.los_edificios_se_calculan_calle")}{wkm ? ` (≈ ${wkm} km)` : ""} {tr("pointPanel.es_de_escala_de_barrio")}
                {r.weatherAvailable ? tr("pointPanel.dato_dominante", { p0: DATA_ORIGIN_TEXT[r.dataOrigin] }) : ""}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface Props {
  point: SelectedPoint;
  timeline: PointTimeline | null;
  sunlight: SunlightResult | null;
  now: number;
  time: number;
  onClose(): void;
  className?: string;
  /** Dentro de un panel contextual: sin cristal ni anchura propios. */
  embedded?: boolean;
  saved?: boolean;
  onToggleSave?(): void;
  /** Modo de la app (busco sol / busco sombra) y sensación térmica, para la frase-respuesta. */
  mode?: SunShadeMode;
  apparentC?: number | null;
  /** La cabecera (nombre y cerrar) la pone la hoja: aquí no se repite. */
  headerless?: boolean;
  /** Guardar este punto como «Mi casa o balcón». */
  onSetHome?(): void;
  /** Ver la semana de este punto (Planes · Esta semana). */
  onWeek?(): void;
}

function PointPanelBase({ point, timeline, sunlight, now, time, onClose, className, embedded, saved, onToggleSave, mode, apparentC, headerless, onSetHome, onWeek }: Props) {
  const comfort = useComfort(time);
  const intervalLabel = (state: SunState) =>
    state === "sun"
      ? timeline?.weatherAvailable
        ? tr("sunDetails.sol_directo")
        : tr("sunDetails.sol_posible")
      : state === "partial"
        ? tr("layerControl.sol_suave")
        : state === "cloud"
          ? tr("sunDetails.nubes")
          : tr("findSunPanel.sombra");

  const dayStart = startOfZoneDay(time);
  const sunTimes = useMemo(() => solarService.getSunTimes(dayStart, point.lat, point.lng), [dayStart, point.lat, point.lng]);
  const nextSunrise = useMemo(
    () => solarService.getSunTimes(startOfZoneDay(dayStart + 30 * 3_600_000), point.lat, point.lng).sunrise,
    [dayStart, point.lat, point.lng]
  );
  const answer = timeline
    ? describePoint({
        time,
        intervals: timeline.intervals,
        sunrise: sunTimes.sunrise,
        sunset: sunTimes.sunset,
        nextSunrise,
        weatherAvailable: timeline.weatherAvailable,
        mode,
        apparentC: time - now < 3_600_000 && time > now - 3_600_000 ? apparentC : null,
      })
    : null;
  const subtitle = point.area && point.area !== point.name && point.area !== "Barcelona" ? point.area : null;

  return (
    <section
      className={cn(
        !embedded &&
          "fts-glass fts-slide-in w-[min(calc(100vw-1.5rem),320px)] rounded-[26px] p-4 sm:w-[min(calc(100vw-2rem),320px)] sm:p-5",
        className
      )}
    >
      {!headerless && <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="fts-caps">
            {dayChoiceLabel(startOfZoneDay(time), now)} · {formatDayLabel(time)}
          </p>
          <h2 className="mt-1.5 font-serif text-[23px] leading-[1.08] text-ink sm:text-[25px]">
            {point.name}
          </h2>
          {subtitle && <p className="mt-1 text-[13px] text-ink-soft">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("sunDetails.cerrar")}
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>}

      <SunlightBlock r={sunlight} now={now} answer={answer} comfort={comfort} />

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="fts-caps !text-[12px]">{tr("pointPanel.en_este_punto", { p0: dayChoiceLabel(dayStart, now) })}</p>
        {!timeline ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="fts-shimmer h-[42px] rounded-2xl"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        ) : timeline.intervals.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-soft">{tr("pointPanel.hoy_no_llega_sol_directo")}</p>
        ) : (
          <>
            <ul className="fts-scroll-y mt-2.5 max-h-[min(180px,22vh)] space-y-1 overflow-y-auto pr-0.5">
              {timeline.intervals.map((iv, i) => {
                const active = time >= iv.start && time < iv.end;
                return (
                  <li
                    key={`${iv.state}-${i}`}
                    className={cn(
                      "fts-fade-in flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-500",
                      active ? "bg-ink/[0.055]" : "bg-transparent"
                    )}
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <SunGlyph state={iv.state} size={22} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium leading-tight text-ink">{intervalLabel(iv.state)}</p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-ink-soft">
                        {formatClock(iv.start)} — {formatClock(iv.end)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-ink-faint">
                      {formatDuration(iv.end - iv.start)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2.5 flex items-center justify-between border-t border-line pt-3 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              <span>
                {timeline.weatherAvailable ? tr("sunDetails.sol_directo") : tr("sunDetails.sol_posible")} {dayChoiceInSentence(dayStart, now)}
              </span>
              <span className="font-serif text-[15px] normal-case tracking-normal text-ink">
                {formatDuration(timeline.sunMs)}
              </span>
            </div>
            {!timeline.hasBuildings && (
              <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">
                {tr("pointPanel.sin_edificios_cargados_aqui_solo")}
              </p>
            )}
          </>
        )}
      </div>

      {onToggleSave && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3.5">
          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={saved}
            className={cn(
              "flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-sun/60",
              saved ? "border-sun/60 bg-sun-soft text-sun-deep" : "border-line text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
            )}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
            </svg>
            {saved ? tr("sunDetails.guardado") : tr("sunDetails.guardar")}
          </button>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=walking`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            {tr("sunDetails.como_llegar")}
          </a>
          {onWeek && (
            <button
              type="button"
              onClick={onWeek}
              className="flex min-h-[44px] items-center rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              {tr("pointPanel.su_semana")}
            </button>
          )}
          {onSetHome && (
            <button
              type="button"
              onClick={onSetHome}
              className="flex min-h-[44px] items-center rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-ink-soft outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              {tr("pointPanel.es_mi_casa")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default memo(PointPanelBase);
