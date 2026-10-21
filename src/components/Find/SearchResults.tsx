import { fmtMin } from "../../lib/formatSun";
import { durationLabel } from "../../lib/planning";
import { dayChoiceLabel } from "../../lib/planningTime";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import type { NormalizedSunRequest, SearchNoticeCode, SunSearchOutcome, SunSearchResult } from "../../types";
import { GhostButton } from "../FindSun/ui";
import SunResultCard from "./SunResultCard";
import { tr } from "../../i18n";

export const NOTICE_TEXT: Record<SearchNoticeCode, string> = {
  weather_unavailable: tr("searchResults.sin_datos_de_nubes_mostramos"),
  weather_stale: tr("searchResults.los_datos_meteorologicos_estan_desactualizados"),
  weather_partial: tr("searchResults.cobertura_meteorologica_parcial_en_parte"),
  beyond_forecast: tr("searchResults.parte_de_la_franja_queda"),
  buildings_partial: tr("searchResults.faltan_edificios_en_parte_de"),
  buildings_unavailable: tr("searchResults.no_se_han_podido_cargar"),
  places_stale: tr("searchResults.usamos_el_ultimo_inventario_de"),
  comfort_unavailable: tr("searchResults.sin_datos_de_temperatura_ni"),
  no_location: tr("searchResults.sin_ubicacion_se_busca_en"),
};

const NO_SUN_TEXT = {
  night: tr("searchResults.ya_no_queda_sol_en"),
  clouds: tr("searchResults.las_nubes_tapan_el_sol"),
  shade: tr("searchResults.los_edificios_dejan_sin_sol"),
  no_places: tr("searchResults.no_hay_lugares_de_ese"),
  none: tr("searchResults.no_hemos_podido_encontrar_con"),
} as const;

export function describeRequest(r: NormalizedSunRequest): string {
  const day = dayChoiceLabel(startOfZoneDay(r.startTime), Date.now());
  return tr("searchResults.de_sol", { p0: day, p1: formatClock(r.startTime), p2: formatClock(r.endTime), p3: durationLabel(r.minimumSunlightMinutes) });
}

/** Lo que se enseña: los que cumplen la petición o, si ninguno, lo mejor disponible. */
export const shownResults = (o: SunSearchOutcome | null): SunSearchResult[] =>
  !o ? [] : o.results.length > 0 ? o.results : o.bestAvailable;

export interface Suggestion {
  label: string;
  onClick(): void;
}

interface Props {
  outcome: SunSearchOutcome | null;
  failed: boolean;
  activeId: string | null;
  onPick(r: SunSearchResult): void;
  onEdit?(): void;
  editLabel?: string;
  suggestions?: Suggestion[];
  /** Título cuando hay resultados (por defecto «N mejores lugares»). */
  title?: string;
}

/**
 * Resultados de una búsqueda: nunca se inventan. Si ninguno cumple la petición completa se dice y
 * se ofrece lo mejor disponible y alternativas («Probar mañana», «Menos tiempo»…).
 */
export default function SearchResults({ outcome, failed, activeId, onPick, onEdit, editLabel, suggestions = [], title }: Props) {
  const results = outcome?.results ?? [];
  const shown = shownResults(outcome);
  const noFull = results.length === 0;
  const req = outcome?.request;

  return (
    <div className="fts-fade-in">
      {noFull ? (
        <p className="font-serif text-[21px] leading-[1.15] text-ink">
          {failed || shown.length === 0
            ? tr("searchResults.no_hemos_encontrado_un_sitio")
            : tr("searchResults.ningun_lugar_cumple_tus_completos", { p0: durationLabel(req?.minimumSunlightMinutes ?? 60) })}
        </p>
      ) : (
        <p className="font-serif text-[21px] leading-none text-ink">
          {title ?? (results.length === 1 ? tr("searchResults.1_lugar_encontrado") : tr("searchResults.mejores_lugares", { p0: results.length }))}
        </p>
      )}
      {req && <p className="mt-1.5 text-[12.5px] text-ink-soft">{describeRequest(req)}</p>}

      {noFull && (
        <div className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            {failed
              ? tr("searchResults.algo_ha_fallado_al_calcularlo")
              : NO_SUN_TEXT[outcome?.noSunReason ?? "none"]}
          </p>
          {shown.length > 0 && outcome && (
            <p className="mt-2 text-[14px] font-medium text-ink">
              {tr("searchResults.mejor_opcion_disponible_de_sol", { p0: fmtMin(outcome.meta.bestAvailableMinutes) })}
            </p>
          )}
        </div>
      )}

      {outcome && outcome.notices.length > 0 && (
        <ul className="mt-3 space-y-1">
          {outcome.notices.map((n) => (
            <li key={n} className="flex gap-2 text-[12px] leading-snug text-ink-faint">
              <span aria-hidden>·</span>
              <span>{NOTICE_TEXT[n]}</span>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && req && (
        <div className="mt-3.5 space-y-2.5">
          {shown.map((r, i) => (
            <SunResultCard
              key={r.placeId}
              result={r}
              active={activeId === r.placeId}
              rangeStart={req.startTime}
              rangeEnd={req.endTime}
              onPick={() => onPick(r)}
              delay={i * 80}
            />
          ))}
        </div>
      )}

      {(onEdit || (noFull && suggestions.length > 0)) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {onEdit ? <GhostButton onClick={onEdit}>{editLabel ?? tr("findSunPanel.editar_busqueda")}</GhostButton> : <span />}
          {noFull && (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {suggestions.map((s) => (
                <GhostButton key={s.label} onClick={s.onClick} className="text-sun-deep">
                  {s.label}
                </GhostButton>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
