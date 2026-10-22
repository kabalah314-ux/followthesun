import { useEffect, useMemo, useState } from "react";
import { BARCELONA } from "../../config";
import { fmtMin } from "../../lib/formatSun";
import { analyzeYear, type MonthSun } from "../../services/homeSunService";
import { homeToPlace, type HomePoint } from "../../services/homeService";
import { getZoneParts } from "../../services/timeService";
import type { LngLat, SelectedPoint } from "../../types";
import { cn } from "../../utils/cn";
import { Caps, PrimaryButton } from "../FindSun/ui";
import { intlLocale, tr } from "../../i18n";

const monthFmt = new Intl.DateTimeFormat(intlLocale(), { month: "short", timeZone: BARCELONA.timeZone });
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Horas de sol directo posible al año (sin nubes) a partir del día 21 de cada mes. */
export function annualSunHours(months: readonly MonthSun[]): number | null {
  if (months.length < 12) return null;
  let minutes = 0;
  for (const m of months) minutes += m.sunMinutes * (DAYS_IN_MONTH[m.month - 1] ?? 30);
  return Math.round(minutes / 60);
}
const monthLong = new Intl.DateTimeFormat(intlLocale(), { month: "long", timeZone: BARCELONA.timeZone });

/**
 * «Mi casa o balcón»: un punto guardado y sus horas de sol directo el día 21 de cada mes (sol y
 * edificios, sin nubes): para saber si el balcón tendrá sol en invierno o sombra en verano.
 */
export default function HomePanel({
  home,
  selection,
  userLocation,
  onSet,
  onClear,
  onShow,
  onRequestLocation,
}: {
  home: HomePoint | null;
  /** Punto elegido ahora en el mapa (para guardarlo como casa). */
  selection: SelectedPoint | null;
  userLocation: LngLat | null;
  onSet(p: { lat: number; lng: number; name: string }): void;
  onClear(): void;
  onShow(h: HomePoint): void;
  onRequestLocation(): Promise<LngLat | null>;
}) {
  const [months, setMonths] = useState<MonthSun[]>([]);
  const [busy, setBusy] = useState(false);
  const key = home ? `${home.lat},${home.lng}` : "";

  useEffect(() => {
    if (!home) return;
    const ctrl = new AbortController();
    setMonths([]);
    setBusy(true);
    void analyzeYear(homeToPlace(home), Date.now(), (m) => !ctrl.signal.aborted && setMonths((prev) => [...prev, m]), ctrl.signal).finally(
      () => !ctrl.signal.aborted && setBusy(false)
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const max = useMemo(() => Math.max(60, ...months.map((m) => m.daylightMinutes)), [months]);
  const thisMonth = getZoneParts(Date.now()).month;

  if (!home) {
    return (
      <div>
        <p className="text-[14px] leading-relaxed text-ink-soft">{tr("home.intro")}</p>
        <div className="mt-4 space-y-2">
          <PrimaryButton
            disabled={!selection}
            onClick={() => selection && onSet({ lat: selection.lat, lng: selection.lng, name: selection.name || tr("home.mi_casa") })}
            className="w-full justify-center"
          >
            {selection ? tr("home.usar_el_punto", { p0: selection.name }) : tr("home.toca_el_mapa")}
          </PrimaryButton>
          <button
            type="button"
            onClick={async () => {
              const pos = userLocation ?? (await onRequestLocation());
              if (pos) onSet({ lat: pos.lat, lng: pos.lng, name: tr("home.mi_casa") });
            }}
            className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-line text-[14px] font-semibold text-ink hover:bg-ink/[0.05]"
          >
            {tr("home.usar_mi_ubicacion")}
          </button>
        </div>
        <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">{tr("home.consejo")}</p>
      </div>
    );
  }

  const dec = months.find((m) => m.month === 12);
  const jun = months.find((m) => m.month === 6);

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Caps>{tr("home.mi_casa_o_balcon")}</Caps>
          <p className="mt-1.5 truncate font-serif text-[22px] leading-tight text-ink">{home.name}</p>
        </div>
        <button type="button" onClick={() => onShow(home)} className="min-h-[44px] shrink-0 rounded-full px-3 text-[13.5px] font-semibold text-sun-deep hover:bg-sun-soft">
          {tr("home.ver_en_el_mapa")}
        </button>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
        {dec && jun
          ? tr("home.resumen", { p0: fmtMin(dec.sunMinutes), p1: fmtMin(jun.sunMinutes) })
          : busy
            ? tr("home.calculando")
            : tr("home.sin_datos")}
      </p>

      <div className="mt-4" role="img" aria-label={tr("home.grafico", { p0: home.name })}>
        <div className="flex h-36 items-end gap-1.5">
          {Array.from({ length: 12 }, (_, i) => {
            const m = months.find((x) => x.month === i + 1);
            const day = m ? (m.daylightMinutes / max) * 100 : 0;
            const sun = m ? (m.sunMinutes / max) * 100 : 0;
            return (
              <div key={i} className="relative flex h-full flex-1 items-end" title={m ? `${monthLong.format(new Date(m.dayStart + 43_200_000))}: ${fmtMin(m.sunMinutes)}` : undefined}>
                {m ? (
                  <>
                    <span className="absolute inset-x-0 bottom-0 rounded-t-[5px] bg-ink/[0.07]" style={{ height: `${day}%` }} />
                    <span className={cn("absolute inset-x-0 bottom-0 rounded-t-[5px]", i + 1 === thisMonth ? "bg-sun-deep" : "bg-sun")} style={{ height: `${Math.max(2, sun)}%` }} />
                  </>
                ) : (
                  <span className="fts-shimmer absolute inset-x-0 bottom-0 h-1/3 rounded-t-[5px]" />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={cn("flex-1 text-center text-[11.5px] capitalize", i + 1 === thisMonth ? "font-bold text-ink" : "text-ink-faint")}>
              {monthFmt.format(new Date(Date.UTC(2026, i, 15))).replace(".", "").slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">{tr("home.nota")}</p>
      {annualSunHours(months) !== null && (
        <div className="mt-3 rounded-[16px] bg-ink/[0.035] px-3.5 py-3">
          <p className="text-[14px] font-semibold text-ink">
            {tr("home.al_ano", { p0: new Intl.NumberFormat(intlLocale()).format(annualSunHours(months) ?? 0) })}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">{tr("home.placas")}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {selection && (
          <button
            type="button"
            onClick={() => onSet({ lat: selection.lat, lng: selection.lng, name: selection.name || home.name })}
            className="min-h-[44px] rounded-full border border-line px-4 text-[13.5px] font-semibold text-ink hover:bg-ink/[0.05]"
          >
            {tr("home.cambiar_por_el_punto")}
          </button>
        )}
        <button type="button" onClick={onClear} className="min-h-[44px] px-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink">
          {tr("home.quitar")}
        </button>
      </div>
    </div>
  );
}
