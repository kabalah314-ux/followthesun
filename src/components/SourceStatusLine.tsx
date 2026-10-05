import { useState, type ReactNode } from "react";
import type { LightSourceState } from "../hooks/useLightSource";
import { formatAge } from "../services/timeService";
import type { LightSourceKind } from "../types";
import { cn } from "../utils/cn";

/** Palabra corta de procedencia para etiquetas (nunca "en directo"). */
export const PROVENANCE_WORD: Record<LightSourceKind, string | null> = {
  loading: null,
  observed: "Observado",
  forecast: "Previsión",
  estimated: "Estimado",
  stale: "Observación antigua",
  unavailable: null,
};

/** Texto de estado en lenguaje humano: nunca expone errores técnicos. */
export function sourceLabel(l: LightSourceState): string {
  const s = l.summary;
  switch (s.kind) {
    case "loading":
      return "Cargando datos de luz";
    case "unavailable":
      return "Sin datos meteorológicos";
    case "observed":
      return `Observado · ${formatAge(s.ageMs)}`;
    case "stale":
      return `Observación antigua · ${formatAge(s.ageMs)}`;
    case "estimated":
      return `Estimado · última observación ${formatAge(s.ageMs)}`;
    case "forecast":
      if (l.weather.simulated) return "Nubes de demostración";
      if (l.weather.state === "stale") return `Previsión desactualizada · ${formatAge(s.ageMs)}`;
      if (l.weather.state === "partial") return `Previsión parcial · ${formatAge(s.ageMs)}`;
      return `Previsión · actualizada ${formatAge(s.ageMs)}`;
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
  if (s.kind === "loading") return <p>Consultando observaciones y previsión…</p>;
  if (s.kind === "unavailable") {
    return (
      <p>
        No hemos podido obtener ni observaciones ni previsión de nubes. Mostramos solo la geometría
        solar y las sombras de edificios; sin datos no estimamos nubosidad.
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
            <Row k="Observación">EUMETSAT MTG</Row>
            <Row k="Resolución">
              {km(sat.resolutionKm)} · {sat.temporalResolutionMinutes} min
            </Row>
            <Row k="Latencia">{sat.latencyMinutes == null ? "—" : `≈ ${sat.latencyMinutes} min`}</Row>
          </>
        )}
        {mod && (
          <>
            <Row k="Previsión">{l.weather.simulated ? "Demostración" : (mod.source.split("·").pop() ?? "").trim()}</Row>
            <Row k="Resolución">{km(mod.resolutionKm)} · 1 h</Row>
            <Row k="Actualizada">{formatAge(l.weather.ageMs)}</Row>
          </>
        )}
      </dl>
      <p>
        {l.weather.simulated
          ? "Datos de demostración generados en el navegador: no son reales. "
          : "La observación es de satélite y la previsión de un modelo; ninguna es una medición en directo. "}
        Ambas tienen escala de kilómetros: indican la luz de la zona, no la de cada calle. La sombra
        de los edificios sí se calcula a nivel de calle.
      </p>
      {s.kind === "stale" && <p>No se ha podido refrescar la observación: la confianza se ha reducido.</p>}
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
        className="group flex w-full items-center gap-2 text-left text-[10.5px] leading-snug text-ink-soft transition-colors hover:text-ink"
      >
        <Dot kind={kind} busy={busy && kind === "loading"} />
        <span className="min-w-0 flex-1">{sourceLabel(light)}</span>
        <span
          aria-hidden
          className={cn("text-[9px] text-ink-faint transition-transform duration-300", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="fts-fade-in mt-2 text-[10.5px] leading-[1.55] text-ink-soft">
          <Detail l={light} />
        </div>
      )}
    </div>
  );
}
