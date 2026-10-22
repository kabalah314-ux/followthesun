import { useEffect, useMemo, useRef, useState } from "react";
import { lightAt, midpoint, photoLight, spotVerdict, type SpotVerdict, type TimeRange } from "../../lib/photoLight";
import { formatClock } from "../../services/timeService";
import type { SunPlace } from "../../types";
import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

/**
 * «Luz para fotos» (guía maestra 2, utilidad 21 «Modo foto»): las horas azul y dorada del día, si
 * en este punto exacto llega el sol directo durante la hora dorada (con los edificios y las nubes
 * del motor) y de dónde viene la luz. Plegado: el cálculo del sitio solo se hace al abrirlo.
 */

interface Props {
  place: SunPlace;
  /** Punto exacto que se mira (el mejor sitio del lugar). */
  latitude: number;
  longitude: number;
  /** 00:00 del día que se mira. */
  dayStart: number;
  now: number;
  /** Lleva el mapa a esa hora para ver las sombras. */
  onShowTime?(t: number): void;
}

type Verdicts = { morning: SpotVerdict | null; evening: SpotVerdict | null };

const span = (r: TimeRange) => `${formatClock(r[0])}–${formatClock(r[1])}`;

async function verdictFor(place: SunPlace, lat: number, lng: number, r: TimeRange | null, signal: AbortSignal): Promise<SpotVerdict | null> {
  if (!r) return null;
  const { findBestSunPlaces } = await import("../../services/sunSearchService");
  // Solo este punto: sin polígono ni trazado, el motor muestrea exactamente aquí.
  const spot: SunPlace = { ...place, latitude: lat, longitude: lng, polygon: undefined, path: undefined, areaM2: undefined };
  try {
    const out = await findBestSunPlaces(
      { startTime: r[0], endTime: r[1], minimumSunlightMinutes: 10, locationType: "any", locationTypes: [place.type], limit: 1 },
      { places: [spot], now: Date.now(), signal, maxSamplePoints: 1 }
    );
    const res = out.results[0] ?? out.bestAvailable[0] ?? null;
    return res ? spotVerdict(res.windows, r) : null;
  } catch {
    return null;
  }
}

function VerdictLine({ v, loading }: { v: SpotVerdict | null; loading: boolean }) {
  if (loading) return <p className="mt-1 text-[12.5px] text-ink-faint">{tr("photo.calculando")}</p>;
  if (!v) return null;
  let text: string | null = null;
  if (v.blocked) text = tr("photo.aqui_edificios");
  else if (v.clear.length > 0) {
    const ranges = v.clear.map(span).join(", ");
    text =
      v.weather === "sun"
        ? tr("photo.aqui_sol", { p0: ranges })
        : v.weather === "cloud"
          ? tr("photo.aqui_despejado_nubes", { p0: ranges })
          : tr("photo.aqui_despejado", { p0: ranges });
  }
  if (!text) return null;
  const strong = !v.blocked && v.clear.length > 0 && v.weather !== "cloud";
  return <p className={cn("mt-1 text-[13px] leading-snug", strong ? "font-medium text-ink" : "text-ink-soft")}>{text}</p>;
}

export default function PhotoLightBlock({ place, latitude, longitude, dayStart, now, onShowTime }: Props) {
  const [open, setOpen] = useState(false);
  const [verdicts, setVerdicts] = useState<Verdicts | null>(null);
  const light = useMemo(() => photoLight(dayStart, latitude, longitude), [dayStart, latitude, longitude]);
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setVerdicts(null);
    void (async () => {
      const p = placeRef.current;
      const morning = await verdictFor(p, latitude, longitude, light.litMorning, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const evening = await verdictFor(p, latitude, longitude, light.litEvening, ctrl.signal);
      if (!ctrl.signal.aborted) setVerdicts({ morning, evening });
    })();
    return () => ctrl.abort();
  }, [open, place.id, latitude, longitude, light]);

  const rumbos = tr("photo.rumbos").split(",");
  const dirOf = (r: TimeRange | null) => {
    if (!r) return null;
    const l = lightAt(midpoint(r), latitude, longitude);
    return { name: rumbos[l.sector] ?? "", deg: Math.round(((l.azimuthDeg % 360) + 360) % 360) };
  };
  const am = dirOf(light.litMorning ?? light.goldenMorning);
  const pm = dirOf(light.litEvening ?? light.goldenEvening);

  const chip = (kind: "golden" | "blue", r: TimeRange | null) => {
    if (!r) return null;
    const past = r[1] < now;
    const text = `${tr(kind === "golden" ? "photo.hora_dorada" : "photo.hora_azul")} ${span(r)}`;
    const cls = cn(
      "min-h-[40px] rounded-full border px-3 text-[13px] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
      kind === "golden" ? "border-sun/40 bg-sun-soft text-ink" : "border-shade/30 bg-shade/[0.08] text-ink",
      past && "opacity-55"
    );
    return onShowTime ? (
      <button
        type="button"
        className={cn(cls, "hover:border-ink/30")}
        aria-label={tr("photo.ver_en_mapa", { p0: text })}
        onClick={() => onShowTime(midpoint(r))}
      >
        {text}
      </button>
    ) : (
      <span className={cn(cls, "inline-flex items-center")}>{text}</span>
    );
  };

  return (
    <div className="mt-4 border-t border-line pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left text-[14.5px] font-semibold text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <span>
          {tr("photo.titulo")}
          {light.goldenEvening && (
            <span className="ml-2 text-[13px] font-normal tabular-nums text-ink-faint">
              {tr("photo.hora_dorada").toLowerCase()} {span(light.goldenEvening)}
            </span>
          )}
        </span>
        <span aria-hidden className="text-[18px] leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="fts-fade-in space-y-3.5 pb-2 pt-1">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{tr("photo.por_la_manana")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chip("blue", light.blueMorning)}
              {chip("golden", light.goldenMorning)}
            </div>
            <VerdictLine v={verdicts?.morning ?? null} loading={verdicts === null} />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{tr("photo.por_la_tarde")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chip("golden", light.goldenEvening)}
              {chip("blue", light.blueEvening)}
            </div>
            <VerdictLine v={verdicts?.evening ?? null} loading={verdicts === null} />
          </div>
          {am && pm && (
            <p className="text-[13px] leading-snug text-ink-soft">{tr("photo.direccion", { p0: am.name, p1: am.deg, p2: pm.name, p3: pm.deg })}</p>
          )}
          <p className="text-[12.5px] leading-snug text-ink-faint">{onShowTime ? tr("photo.nota_mapa") : tr("photo.nota")}</p>
        </div>
      )}
    </div>
  );
}
