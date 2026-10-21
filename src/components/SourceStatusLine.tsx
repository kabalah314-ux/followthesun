import { useState, type ReactNode } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { formatAge } from "../services/timeService";
import type { LightSourceKind } from "../types";
import { cn } from "../utils/cn";
import { tr } from "../i18n";

/** Palabra corta de procedencia para etiquetas (nunca "en directo"). */
export const PROVENANCE_WORD: Record<LightSourceKind, string | null> = {
  loading: null,
  observed: tr("sourceStatusLine.observado"),
  forecast: tr("sourceStatusLine.prevision"),
  estimated: tr("pointPanel.estimado"),
  stale: tr("sourceStatusLine.observacion_antigua"),
  unavailable: null,
};

/** Texto de estado en lenguaje humano: nunca expone errores técnicos. */
export function sourceLabel(l: LightSourceState): string {
  const s = l.summary;
  switch (s.kind) {
    case "loading":
      return tr("sourceStatusLine.cargando_datos_de_luz");
    case "unavailable":
      return tr("sourceStatusLine.sin_datos_meteorologicos");
    case "observed":
      return tr("sourceStatusLine.observado_2", { p0: formatAge(s.ageMs) });
    case "stale":
      return tr("sourceStatusLine.observacion_antigua_2", { p0: formatAge(s.ageMs) });
    case "estimated":
      return tr("sourceStatusLine.estimado_ultima_observacion", { p0: formatAge(s.ageMs) });
    case "forecast":
      if (l.weather.simulated) return tr("sourceStatusLine.nubes_de_demostracion");
      if (l.weather.state === "stale") return tr("sourceStatusLine.prevision_desactualizada", { p0: formatAge(s.ageMs) });
      if (l.weather.state === "partial") return tr("sourceStatusLine.prevision_parcial", { p0: formatAge(s.ageMs) });
      return tr("sourceStatusLine.prevision_actualizada", { p0: formatAge(s.ageMs) });
  }
}

function Dot({ kind, busy }: { kind: LightSourceKind; busy: boolean }) {
  return (
    <i
      className={cn(
        "block h-[8px] w-[8px] shrink-0 rounded-full border transition-colors duration-700",
        kind === "observed" && "border-sun bg-sun",
        kind === "forecast" && "border-sun bg-transparent",
        kind === "estimated" && "border-sun bg-sun/35",
        kind === "stale" && "border-ink-faint bg-ink/10",
        (kind === "unavailable" || kind === "loading") && "border-dashed border-ink-faint bg-transparent",
        busy && "animate-pulse"
      )}
    />
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-faint">{k}</dt>
      <dd className="text-right text-ink-soft">{children}</dd>
    </div>
  );
}

const km = (v: number | null | undefined) => (v == null ? "—" : `≈ ${String(v).replace(".", ",")} km`);

function Detail({ l }: { l: LightSourceState }) {
  const s = l.summary;
  if (s.kind === "loading") return <p>{tr("sourceStatusLine.consultando_observaciones_y_prevision")}</p>;
  if (s.kind === "unavailable") {
    return (
      <p>
        {tr("sourceStatusLine.no_hemos_podido_obtener_ni")}
      </p>
    );
  }

  const sat = s.satellite;
  const mod = s.model;
  return (
    <div className="space-y-2.5">
      <dl className="space-y-1">
        {sat && (
          <>
            <Row k={tr("sourceStatusLine.observacion")}>EUMETSAT MTG</Row>
            <Row k={tr("sourceStatusLine.resolucion")}>
              {km(sat.resolutionKm)} · {sat.temporalResolutionMinutes} min
            </Row>
            <Row k={tr("sourceStatusLine.latencia")}>{sat.latencyMinutes == null ? "—" : `≈ ${sat.latencyMinutes} min`}</Row>
          </>
        )}
        {mod && (
          <>
            <Row k={tr("sourceStatusLine.prevision")}>{l.weather.simulated ? tr("sourceStatusLine.demostracion") : (mod.source.split("·").pop() ?? "").trim()}</Row>
            <Row k={tr("sourceStatusLine.resolucion")}>{km(mod.resolutionKm)} · 1 h</Row>
            <Row k={tr("sourceStatusLine.actualizada")}>{formatAge(l.weather.ageMs)}</Row>
          </>
        )}
      </dl>
      <p>
        {l.weather.simulated
          ? tr("sourceStatusLine.datos_de_demostracion_generados_en")
          : tr("sourceStatusLine.la_observacion_es_de_satelite")}
        {tr("sourceStatusLine.ambas_tienen_escala_de_kilometros")}
      </p>
      {s.kind === "stale" && <p>{tr("sourceStatusLine.no_se_ha_podido_refrescar")}</p>}
      {l.satellite.attribution && <p className="text-ink-faint">{l.satellite.attribution}</p>}
    </div>
  );
}

/** Estado de las fuentes de luz + "actualizado hace X". Pulsando se despliega el detalle. */
export default function SourceStatusLine({ light }: { light: LightSourceState }) {
  const [open, setOpen] = useState(false);
  const kind = light.summary.kind;
  const busy = kind === "loading" || light.satellite.refreshing || light.weather.refreshing;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left text-[12px] leading-snug text-ink-soft transition-colors hover:text-ink"
      >
        <Dot kind={kind} busy={busy && kind === "loading"} />
        <span className="min-w-0 flex-1">{sourceLabel(light)}</span>
        <span
          aria-hidden
          className={cn("text-[11.5px] text-ink-faint transition-transform duration-300", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="fts-fade-in mt-2 text-[12px] leading-[1.55] text-ink-soft">
          <Detail l={light} />
        </div>
      )}
    </div>
  );
}
