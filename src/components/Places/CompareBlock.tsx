import { useEffect, useState } from "react";
import type { SunShadeMode } from "../../lib/answer";
import { fmtMin } from "../../lib/formatSun";
import { shadeMinutesOf, sunMinutesOf } from "../../lib/weekGrid";
import type { NormalizedSunRequest, SunPlace, SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import WindowStrip from "../FindSun/WindowStrip";
import { tr } from "../../i18n";

/**
 * «Comparar dos sitios» (guía maestra 2, utilidad 33): el sitio que se apartó para comparar y el
 * de la ficha, con su luz en la MISMA franja y cuál tiene más sol (o más sombra, si se busca
 * sombra). El otro sitio se recalcula con la franja de esta ficha.
 */

function Row({ name, res, start, end, metric, mode }: { name: string; res: SunSearchResult | null | undefined; start: number; end: number; metric: number | null; mode: SunShadeMode }) {
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{name}</p>
        <p className="shrink-0 text-[12.5px] tabular-nums text-ink-soft">
          {res === undefined
            ? tr("compare.calculando")
            : metric === null
              ? "—"
              : tr(mode === "shade" ? "compare.min_sombra" : "compare.min_sol", { p0: fmtMin(metric) })}
        </p>
      </div>
      <div className="mt-1.5">
        {res ? <WindowStrip windows={res.windows} start={start} end={end} compact={false} /> : <div className={cn("h-[10px] rounded-full bg-ink/[0.06]", res === undefined && "fts-shimmer")} />}
      </div>
    </div>
  );
}

export default function CompareBlock({
  other,
  result,
  request,
  mode,
  onClear,
}: {
  other: SunPlace;
  result: SunSearchResult;
  request: NormalizedSunRequest;
  mode: SunShadeMode;
  onClear(): void;
}) {
  const [otherRes, setOtherRes] = useState<SunSearchResult | null | undefined>(undefined);
  const { startTime, endTime, minimumSunlightMinutes, origin } = request;

  useEffect(() => {
    const ctrl = new AbortController();
    setOtherRes(undefined);
    void (async () => {
      try {
        const { findBestSunPlaces } = await import("../../services/sunSearchService");
        const out = await findBestSunPlaces(
          { startTime, endTime, minimumSunlightMinutes, locationType: "any", locationTypes: [other.type], limit: 1, origin },
          { places: [other], signal: ctrl.signal }
        );
        if (!ctrl.signal.aborted) setOtherRes(out.results[0] ?? out.bestAvailable[0] ?? null);
      } catch {
        if (!ctrl.signal.aborted) setOtherRes(null);
      }
    })();
    return () => ctrl.abort();
  }, [other, startTime, endTime, minimumSunlightMinutes, origin]);

  const metricOf = (r: SunSearchResult | null | undefined) => (r ? (mode === "shade" ? shadeMinutesOf(r.windows) : sunMinutesOf(r.windows)) : null);
  const mA = metricOf(otherRes);
  const mB = metricOf(result);
  let verdict: string | null = null;
  if (otherRes === null) verdict = tr("compare.sin_datos");
  else if (mA !== null && mB !== null) {
    const diff = mB - mA;
    if (Math.abs(diff) < 5) verdict = tr("compare.igual");
    else
      verdict = tr(mode === "shade" ? "compare.mas_sombra" : "compare.mas_sol", {
        p0: diff > 0 ? result.place.name : other.name,
        p1: fmtMin(Math.abs(diff)),
      });
  }
  const walkA = otherRes?.walking?.durationMinutes;
  const walkB = result.walking?.durationMinutes;

  return (
    <section aria-label={tr("compare.titulo")} className="mt-4 rounded-[18px] border border-line px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="fts-caps !text-[11.5px]">{tr("compare.titulo")}</p>
        <button
          type="button"
          onClick={onClear}
          className="-my-2 min-h-[44px] rounded-full px-2 text-[12.5px] font-semibold text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          {tr("compare.quitar")}
        </button>
      </div>
      <Row name={other.name} res={otherRes} start={startTime} end={endTime} metric={mA} mode={mode} />
      <Row name={result.place.name} res={result} start={startTime} end={endTime} metric={mB} mode={mode} />
      {verdict && <p className="mt-3 text-[13.5px] font-medium leading-snug text-ink">{verdict}</p>}
      {walkA !== undefined && walkB !== undefined && (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-faint">
          {tr("compare.a_pie", { p0: other.name, p1: walkA, p2: result.place.name, p3: walkB })}
        </p>
      )}
    </section>
  );
}
