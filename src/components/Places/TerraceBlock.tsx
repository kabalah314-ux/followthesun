import { useState } from "react";
import type { TerraceSun } from "../../hooks/useTerraceSun";
import { TERRACE_GRID } from "../../lib/terraceShape";
import { licenseSummary, type TerraceLicenseInfo } from "../../services/openData/terraceMatching";
import { formatClock } from "../../services/timeService";
import { venueFeedbackService } from "../../services/venueFeedbackService";
import type { SunSearchResult, TerraceCertainty, VenueCategory } from "../../types";
import { cn } from "../../utils/cn";
import { Caps } from "../FindSun/ui";
import { tr } from "../../i18n";

/** La terraza en miniatura: 5 × 5 celdas (fachada arriba, calle abajo) al sol o a la sombra. */
function MiniTerrace({ sunny }: { sunny: boolean[] }) {
  const G = TERRACE_GRID;
  const cells = [];
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const on = sunny[i * G + j];
      cells.push(<i key={`${i}-${j}`} className={cn("block rounded-[2px]", on ? "bg-sun" : "bg-shade/60")} />);
    }
  }
  return (
    <span aria-hidden className="grid h-10 w-14 shrink-0 gap-[2px] rounded-[6px] border border-line p-[3px]" style={{ gridTemplateColumns: `repeat(${G}, 1fr)` }}>
      {cells}
    </span>
  );
}

/**
 * La terraza: lo que dice la licencia municipal (mesas, sillas, temporada) o lo que se sabe de
 * OpenStreetMap, el % de la terraza al sol a la hora elegida (dibujada también en el mapa) y la
 * confirmación de la gente («¿hay mesas al sol aquí?»).
 */
export default function TerraceBlock({
  result,
  terrace: drawn,
  onFeedback,
}: {
  result: SunSearchResult;
  terrace?: TerraceSun | null;
  onFeedback?(hasTerrace: boolean): void;
}) {
  const meta = result.place.metadata ?? {};
  const [feedback, setFeedback] = useState(() => venueFeedbackService.get(result.placeId));
  const isVenue = meta.venue === true || result.locationType === "terrace";
  if (!isVenue) return null;
  const terrace = meta.terrace as TerraceCertainty | undefined;
  const license = (meta.licensed ?? null) as TerraceLicenseInfo | null;
  const note = license
    ? licenseSummary(license)
    : terrace === "confirmed"
      ? tr("sunDetails.terraza_confirmada_en_openstreetmap_se")
      : terrace === "likely"
        ? tr("sunDetails.candidato_el_local_esta_en")
        : terrace === "none"
          ? tr("sunDetails.segun_los_datos_este_local")
          : tr("sunDetails.no_sabemos_si_este_local");

  const record = (hasTerrace: boolean) => {
    venueFeedbackService.record({
      venue: {
        id: result.placeId,
        name: result.place.name,
        category: (meta.category as VenueCategory) ?? "cafe",
        latitude: result.place.latitude,
        longitude: result.place.longitude,
        terrace: "unknown",
        terraceSource: "",
      },
      hasTerrace,
      sunAtMoment: result.score >= 50,
    });
    setFeedback(venueFeedbackService.get(result.placeId));
    onFeedback?.(hasTerrace);
  };

  const btn = (on: boolean) =>
    cn(
      "min-h-[44px] rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
      on ? "border-sun/60 bg-sun-soft text-sun-deep" : "border-line text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
    );

  return (
    <section className="mt-4 border-t border-line pt-3.5" aria-label={tr("placeCard.la_terraza")}>
      <Caps>{tr("placeCard.la_terraza")}</Caps>
      <p className="mt-2 text-[13.5px] leading-snug text-ink-soft">{note}</p>
      {drawn && drawn.placeId === result.placeId && drawn.sunny && drawn.percent !== null && (
        <div className="mt-3 flex items-center gap-3">
          <MiniTerrace sunny={drawn.sunny} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-snug text-ink">
              {(() => {
                const w = result.windows.find((x) => drawn.time >= x.start && drawn.time < x.end);
                const cloudy = w?.kind === "cloud" || w?.kind === "uncertain";
                const params = { p0: drawn.percent, p1: formatClock(drawn.time) };
                return cloudy ? tr("terrace.pct_sin_edificios", params) : tr("terrace.pct_al_sol", params);
              })()}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-faint">
              {tr("terrace.dibujo")}
              {drawn.estimated ? ` ${tr("terrace.estimada")}` : ""}
            </p>
          </div>
        </div>
      )}
      <p className="mt-3 text-[13.5px] font-semibold text-ink">{tr("sunDetails.hay_mesas_al_sol_aqui")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => record(true)} className={btn(!!feedback?.hasTerrace)}>
          {tr("sunDetails.si_hay_terraza")}
        </button>
        <button type="button" onClick={() => record(false)} className={btn(!!feedback && !feedback.hasTerrace)}>
          {tr("sunDetails.no_hay_terraza")}
        </button>
      </div>
      {feedback && <p className="mt-2 text-[12.5px] text-ink-faint">{tr("placeCard.confirmaciones_nota")}</p>}
    </section>
  );
}
