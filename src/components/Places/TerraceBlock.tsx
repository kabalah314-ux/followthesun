import { useState } from "react";
import { licenseSummary, type TerraceLicenseInfo } from "../../services/openData/terraceMatching";
import { venueFeedbackService } from "../../services/venueFeedbackService";
import type { SunSearchResult, TerraceCertainty, VenueCategory } from "../../types";
import { cn } from "../../utils/cn";
import { Caps } from "../FindSun/ui";
import { tr } from "../../i18n";

/**
 * La terraza: lo que dice la licencia municipal (mesas, sillas, temporada) o lo que se sabe de
 * OpenStreetMap, y la confirmación de la gente («¿hay mesas al sol aquí?»).
 */
export default function TerraceBlock({ result, onFeedback }: { result: SunSearchResult; onFeedback?(hasTerrace: boolean): void }) {
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
