import { fmtMin } from "../../lib/formatSun";
import { durationLabel } from "../../lib/planning";
import { dayChoiceLabel } from "../../lib/planningTime";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import type { NormalizedSunRequest, SearchNoticeCode, SunSearchOutcome, SunSearchResult } from "../../types";
import { GhostButton } from "../FindSun/ui";
import SunResultCard from "./SunResultCard";

export const NOTICE_TEXT: Record<SearchNoticeCode, string> = {
  weather_unavailable: "Sin datos de nubes: mostramos sol posible, no confirmado.",
  weather_stale: "Los datos meteorológicos están desactualizados: la confianza es menor.",
  weather_partial: "Cobertura meteorológica parcial en parte de la zona.",
  beyond_forecast: "Parte de la franja queda fuera de la previsión: ahí solo cuentan la geometría y las sombras.",
  buildings_partial: "Faltan edificios en parte de la zona: la sombra urbana puede ser menos precisa.",
  buildings_unavailable: "No se han podido cargar los edificios: la sombra urbana no está verificada.",
  places_stale: "Usamos el último inventario de lugares guardado (sin conexión).",
  comfort_unavailable: "Sin datos de temperatura ni viento: el modo equilibrado cuenta solo el sol.",
  no_location: "Sin ubicación: se busca en toda Barcelona.",
};

const NO_SUN_TEXT = {
  night: "Ya no queda sol en esa franja.",
  clouds: "Las nubes tapan el sol en toda la zona durante esa franja.",
  shade: "Los edificios dejan sin sol los lugares disponibles en esa franja.",
  no_places: "No hay lugares de ese tipo en esta zona.",
  none: "No hemos podido encontrar con confianza un sitio soleado para esta franja.",
} as const;

export function describeRequest(r: NormalizedSunRequest): string {
  const day = dayChoiceLabel(startOfZoneDay(r.startTime), Date.now());
  return `${day} ${formatClock(r.startTime)}–${formatClock(r.endTime)} · ${durationLabel(r.minimumSunlightMinutes)} de sol`;
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
            ? "No hemos encontrado un sitio soleado."
            : `Ningún lugar cumple tus ${durationLabel(req?.minimumSunlightMinutes ?? 60)} completos.`}
        </p>
      ) : (
        <p className="font-serif text-[21px] leading-none text-ink">
          {title ?? (results.length === 1 ? "1 lugar encontrado" : `${results.length} mejores lugares`)}
        </p>
      )}
      {req && <p className="mt-1.5 text-[11px] text-ink-soft">{describeRequest(req)}</p>}

      {noFull && (
        <div className="mt-3">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            {failed
              ? "Algo ha fallado al calcularlo. Inténtalo de nuevo."
              : NO_SUN_TEXT[outcome?.noSunReason ?? "none"]}
          </p>
          {shown.length > 0 && outcome && (
            <p className="mt-2 text-[13px] font-medium text-ink">
              Mejor opción disponible: {fmtMin(outcome.meta.bestAvailableMinutes)} de sol directo
            </p>
          )}
        </div>
      )}

      {outcome && outcome.notices.length > 0 && (
        <ul className="mt-3 space-y-1">
          {outcome.notices.map((n) => (
            <li key={n} className="flex gap-2 text-[10.5px] leading-snug text-ink-faint">
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
          {onEdit ? <GhostButton onClick={onEdit}>{editLabel ?? "Editar búsqueda"}</GhostButton> : <span />}
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
