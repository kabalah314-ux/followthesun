import { memo, useState, type ReactNode } from "react";
import {
  confidenceLevel,
  influenceLevel,
  type CloudInfluenceLevel,
  type ConfidenceLevel,
} from "../lib/sunlightCalculations";
import { formatAge, formatClock, formatDayLabel, formatDuration } from "../services/timeService";
import type {
  ConfidenceBreakdown,
  DataOrigin,
  PointTimeline,
  SelectedPoint,
  SunState,
  SunlightResult,
} from "../types";
import { cn } from "../utils/cn";
import { AnimatedNumber } from "./AnimatedNumber";
import { CloseIcon, SunGlyph } from "./Icons";

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const INFLUENCE_LABEL: Record<CloudInfluenceLevel, string> = {
  low: "Baja",
  moderate: "Moderada",
  high: "Alta",
};

const DATA_ORIGIN_TEXT: Record<DataOrigin, string> = {
  observed: "muestra del satélite",
  interpolated: "interpolado entre dos observaciones",
  estimated: "persistencia de la última observación",
  stale: "observación antigua",
  forecast: "modelo meteorológico",
  unavailable: "sin datos",
};

type Headline = { label: string; glyph: SunState | "night"; unverified: boolean };

function headline(r: SunlightResult): Headline {
  const forecast = r.origin === "forecast";
  switch (r.state) {
    case "night":
      return { label: "Sin sol", glyph: "night", unverified: false };
    case "urban_shadow":
      return { label: "Sombra urbana", glyph: "shade", unverified: false };
    case "urban_shadow_cloud":
      return { label: "Sombra urbana + nubes", glyph: "shade", unverified: false };
    case "terrain_shadow":
      return { label: "Sombra del relieve", glyph: "shade", unverified: false };
    // Sin datos de nubes el sol no está verificado: no se afirma "sol directo".
    case "possible":
      return { label: "Sol posible", glyph: "partial", unverified: true };
    case "uncertain":
      return { label: "Resultado incierto", glyph: "partial", unverified: false };
    case "cloud_blocked":
      return { label: forecast ? "Nubes previstas" : "Las nubes tapan el sol", glyph: "cloud", unverified: false };
    case "partial":
      return { label: forecast ? "Sol parcial previsto" : "Sol parcial", glyph: "partial", unverified: false };
    case "direct":
      return { label: forecast ? "Sol directo previsto" : "Sol directo", glyph: "sun", unverified: false };
  }
}

function shadowLabel(r: SunlightResult): string {
  if (r.urbanShadow) return "Edificios";
  if (r.terrainShadow) return "Relieve";
  return r.buildingsKnown ? "Ninguna" : "Sin datos aquí";
}

function radiationLabel(r: SunlightResult): string {
  if (r.origin === "forecast") return "Solo previsión";
  const s = r.satellite;
  if (s && s.directRadiation !== undefined) {
    if (s.origin === "observed") return "Disponible";
    if (s.origin === "interpolated") return "Interpolada";
    return "Última observación";
  }
  return "No disponible";
}

/** Procedencia del dato, en lenguaje claro. Nunca "en directo". */
function originLine(r: SunlightResult, now: number): string | null {
  if (r.state === "night") return null;
  if (!r.weatherAvailable) return "Sin datos de nubes";
  if (r.origin === "forecast") {
    return r.cloud
      ? `Previsión · modelo actualizado ${formatAge(now - r.cloud.updatedAt.getTime())}`
      : "Previsión";
  }
  if (r.origin === "observed" && r.satellite) {
    return `Observado · ${formatAge(now - r.satellite.sampleTime.getTime())}`;
  }
  return r.satellite
    ? `Estimado · observación ${formatAge(now - r.satellite.sampleTime.getTime())}`
    : "Estimado";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{label}</dt>
      <dd className="mt-1 truncate text-[12.5px] font-medium text-ink">{children}</dd>
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
    ["Sol", b.solar],
    ["Edificios", b.geometry],
    ["Meteorología", b.weather],
    ["Satélite", b.satellite],
    ["Final", b.final],
  ];
  return (
    <ul className="space-y-1.5">
      {items.map(([label, v]) => (
        <li key={label} className="flex items-center gap-2.5 text-[10.5px] text-ink-soft">
          <span className="w-[78px] shrink-0">{label}</span>
          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
            <i
              className={cn("block h-full rounded-full", label === "Final" ? "bg-ink/70" : "bg-sun/80")}
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

function SunlightBlock({ r, now }: { r: SunlightResult | null; now: number }) {
  const [open, setOpen] = useState(false);

  if (!r) {
    return (
      <div className="mt-4 space-y-2" aria-busy="true">
        <div className="fts-shimmer h-[52px] rounded-2xl" />
        <div className="fts-shimmer h-[40px] rounded-2xl" style={{ animationDelay: "120ms" }} />
      </div>
    );
  }

  if (r.state === "night") {
    return <p className="mt-4 text-[13px] text-ink-soft">El sol está bajo el horizonte a esta hora.</p>;
  }

  const head = headline(r);
  const origin = originLine(r, now);
  const wkm = km(r.spatial.weatherScaleKm);

  let note: string | null = null;
  if (r.cloud?.simulated) note = "Nubes de demostración: no son datos reales.";
  else if (head.unverified) note = "Sin datos de nubes: solo geometría solar y sombras.";
  else if (r.conflict) note = "Satélite y modelo discrepan: la confianza se ha reducido.";
  else if (r.weatherQuality === "outdated") note = "Datos meteorológicos desactualizados.";

  return (
    <div className="mt-4">
      <p className="fts-caps !text-[9px]">{r.origin === "forecast" ? "Luz solar prevista" : "Luz solar"}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <SunGlyph state={head.glyph} size={28} className="shrink-0 transition-all duration-700" />
          <p className="min-w-0 text-[14px] font-medium leading-tight text-ink">{head.label}</p>
        </div>
        <p className="shrink-0 font-serif text-[40px] leading-[0.85] tracking-tight text-ink">
          {head.unverified ? (
            <span className="text-ink-faint">—</span>
          ) : (
            <>
              <AnimatedNumber value={Math.round(r.sunlightScore * 100)} />
              <span className="ml-0.5 align-top text-[16px] text-ink-soft">%</span>
            </>
          )}
        </p>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-ink/[0.035] px-3.5 py-3">
        <Row label="Sombra urbana">{shadowLabel(r)}</Row>
        <Row label="Influencia de nubes">
          {r.weatherAvailable ? INFLUENCE_LABEL[influenceLevel(r.cloudInfluence)] : "Sin datos"}
        </Row>
        <Row label="Radiación observada">{radiationLabel(r)}</Row>
        <Row label="Confianza">
          <ConfidenceMeter value={r.confidence} />
        </Row>
      </dl>

      {origin && (
        <p className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-soft">
          <i
            className={cn(
              "block h-[7px] w-[7px] shrink-0 rounded-full border",
              r.origin === "observed" && "border-sun bg-sun",
              r.origin === "forecast" && "border-sun bg-transparent",
              r.origin === "estimated" && "border-sun bg-sun/35"
            )}
          />
          {origin}
        </p>
      )}
      {note && <p className="mt-1.5 text-[10.5px] leading-snug text-ink-faint">{note}</p>}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
      >
        {open ? "Ocultar detalle" : "Ver detalle"}
      </button>
      {open && (
        <div className="fts-fade-in mt-2.5 space-y-3 rounded-2xl border border-line px-3.5 py-3">
          <Breakdown b={r.confidenceBreakdown} />
          <p className="text-[10.5px] leading-[1.55] text-ink-soft">
            Edificios: precisión de calle. Meteorología{wkm ? ` (≈ ${wkm} km)` : ""}: escala de barrio, no
            de calle.
            {r.weatherAvailable ? ` Dato dominante: ${DATA_ORIGIN_TEXT[r.dataOrigin]}.` : ""}
          </p>
        </div>
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
}

function PointPanelBase({ point, timeline, sunlight, now, time, onClose, className }: Props) {
  const intervalLabel = (state: SunState) =>
    state === "sun"
      ? timeline?.weatherAvailable
        ? "Sol directo"
        : "Sol posible"
      : state === "partial"
        ? "Sol parcial"
        : state === "cloud"
          ? "Nubes"
          : "Sombra";

  return (
    <section
      className={cn(
        "fts-glass fts-slide-in w-[min(calc(100vw-1.5rem),320px)] rounded-[26px] p-4 sm:w-[min(calc(100vw-2rem),320px)] sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="fts-caps">Hoy · {formatDayLabel(time)}</p>
          <h2 className="mt-1.5 font-serif text-[23px] leading-[1.08] text-ink sm:text-[25px]">
            {point.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <SunlightBlock r={sunlight} now={now} />

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="fts-caps !text-[9px]">A lo largo del día</p>
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
          <p className="mt-3 text-[13px] text-ink-soft">Hoy no llega sol directo a este punto.</p>
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
                      <p className="text-[13px] font-medium leading-tight text-ink">{intervalLabel(iv.state)}</p>
                      <p className="mt-0.5 text-[12px] tabular-nums text-ink-soft">
                        {formatClock(iv.start)} — {formatClock(iv.end)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                      {formatDuration(iv.end - iv.start)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2.5 flex items-center justify-between border-t border-line pt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              <span>{timeline.weatherAvailable ? "Sol directo hoy" : "Sol posible hoy"}</span>
              <span className="font-serif text-[15px] normal-case tracking-normal text-ink">
                {formatDuration(timeline.sunMs)}
              </span>
            </div>
            {!timeline.hasBuildings && (
              <p className="mt-2 text-[11px] leading-snug text-ink-faint">
                Sin edificios cargados aquí: solo relieve y nubes. Acércate para afinar.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default memo(PointPanelBase);
