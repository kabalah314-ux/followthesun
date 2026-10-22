import { useState } from "react";
import { CONFIDENCE_ES, confidenceWord } from "../../lib/formatSun";
import type { SunSearchResult, SunlightOrigin } from "../../types";
import { cn } from "../../utils/cn";
import { Caps, ConfidenceBars } from "../FindSun/ui";
import { tr } from "../../i18n";

const ORIGIN: Record<SunlightOrigin, "sunDetails.basado_en_observacion_satelital" | "sunDetails.basado_en_prevision" | "sunDetails.estimacion"> = {
  observed: "sunDetails.basado_en_observacion_satelital",
  forecast: "sunDetails.basado_en_prevision",
  estimated: "sunDetails.estimacion",
};

function ConfRow({ label, sub, value, missing, strong }: { label: string; sub?: string; value: number; missing?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <div className="min-w-0">
        <span className={cn("font-medium", strong ? "text-ink" : "text-ink-soft")}>{label}</span>
        {sub && <span className="ml-1.5 text-[12px] text-ink-faint">{sub}</span>}
      </div>
      <span className="shrink-0 text-ink">{missing ? <span className="text-ink-faint">{tr("sunDetails.sin_datos")}</span> : <ConfidenceBars value={value} />}</span>
    </div>
  );
}

/**
 * «Cómo lo sabemos», plegado al final de la ficha: por qué este sitio, la confianza de cada
 * eslabón, el Sun Score desglosado y cómo se ordena (nunca por pago).
 */
export default function HowWeKnow({ result }: { result: SunSearchResult }) {
  const [open, setOpen] = useState(false);
  const d = result.confidenceDetail;
  const R = result.rankingDetail;
  return (
    <div className="mt-4 border-t border-line pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left text-[14.5px] font-semibold text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <span>{tr("sunDetails.como_lo_sabemos")}</span>
        <span aria-hidden className="text-[18px] leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="fts-fade-in space-y-4 pb-2 pt-1">
          <div>
            <Caps>{tr("sunDetails.por_que_este_lugar")}</Caps>
            <ul className="mt-2 space-y-1.5">
              {result.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-ink-soft">
                  <span aria-hidden className={cn("mt-px w-3 shrink-0 text-center font-semibold", reason.tone === "plus" ? "text-sun-deep" : "text-ink-faint")}>
                    {reason.tone === "plus" ? "+" : reason.tone === "minus" ? "−" : "·"}
                  </span>
                  <span className={reason.tone === "plus" ? "text-ink" : undefined}>{reason.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Caps>{tr("sunDetails.confianza")}</Caps>
            <ConfRow label={tr("sunDetails.geometria")} sub={tr("sunDetails.sol_y_edificios")} value={d.geometry} />
            <ConfRow label={tr("sunDetails.meteorologia")} sub={tr("sunDetails.escala_de_barrio")} value={d.weather} missing={!result.weatherAvailable} />
            <ConfRow label={tr("sunDetails.global")} value={d.overall} strong />
            <p className="pt-1 text-[12.5px] leading-snug text-ink-faint">
              {result.weatherAvailable ? tr(ORIGIN[result.origin]) : tr("sunResultCard.sin_datos_de_nubes")} · {CONFIDENCE_ES[confidenceWord(result.confidence)]}
            </p>
            <p className="text-[12.5px] leading-snug text-ink-faint">{tr("sunDetails.la_sombra_de_los_edificios")}</p>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-serif text-[44px] leading-[0.85] tracking-tight text-ink">{result.score}</p>
                <Caps className="mt-2">Sun Score</Caps>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {result.scoreDetail.components.map((c) => (
                <div key={c.key} className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                  <span className="w-[112px] shrink-0">{c.label}</span>
                  <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
                    <i className="block h-full rounded-full bg-sun/80" style={{ width: `${Math.round(c.value * 100)}%` }} />
                  </span>
                  <span className="w-[62px] shrink-0 text-right tabular-nums text-ink-faint">
                    {Math.round(c.weight * 100)} % · +{c.contribution.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[16px] bg-ink/[0.035] px-3.5 py-3">
            <Caps>{tr("howWeKnow.como_ordenamos")}</Caps>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{tr("howWeKnow.como_ordenamos_texto")}</p>
            <p className="mt-1.5 text-[12.5px] tabular-nums leading-snug text-ink-faint">
              {tr("sunDetails.orden_de_los_resultados_sun")} {R.score}
              {R.confidenceAdjustment !== 0 && tr("sunDetails.confianza_2", { p0: R.confidenceAdjustment.toFixed(1) })}
              {R.distanceAdjustment !== 0 && tr("sunDetails.distancia_2", { p0: R.distanceAdjustment.toFixed(1) })}
              {!!R.placeAdjustment && tr("sunDetails.terraza_sin_confirmar", { p0: R.placeAdjustment.toFixed(1) })} = {R.value.toFixed(1)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
