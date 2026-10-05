import { fmtMin } from "../../lib/formatSun";
import { durationLabel, type PlannerState } from "../../lib/planning";
import { dayChoiceLabel } from "../../lib/planningTime";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import type { LngLat, NormalizedSunRequest, SearchNoticeCode, SunSearchOutcome, SunSearchResult } from "../../types";
import { CloseIcon } from "../Icons";
import { ResultCards } from "./ResultCards";
import { GhostButton } from "./ui";

const NOTICE_TEXT: Record<SearchNoticeCode, string> = {
  weather_unavailable: "Sin datos de nubes: mostramos sol posible, no confirmado.",
  weather_stale: "Los datos meteorológicos están desactualizados: la confianza es menor.",
  weather_partial: "Cobertura meteorológica parcial en parte de la zona.",
  beyond_forecast: "Parte de la franja queda fuera de la previsión: ahí solo se calcula geometría y sombras.",
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

function describeRequest(r: NormalizedSunRequest): string {
  const day = dayChoiceLabel(startOfZoneDay(r.startTime), Date.now());
  const what = r.intent === "shade" ? "de sombra" : "de sol";
  return `${day} ${formatClock(r.startTime)}–${formatClock(r.endTime)} · ${durationLabel(r.minimumSunlightMinutes)} ${what}`;
}

const card = "fts-glass fts-slide-up pointer-events-auto w-full rounded-[28px] p-4 sm:p-5";

interface Props {
  outcome: SunSearchOutcome | null;
  failed: boolean;
  planner: PlannerState;
  origin: LngLat | null;
  activeId: string | null;
  onEdit(): void;
  onRun(p: PlannerState, originOverride?: LngLat | null): void;
  onClose(): void;
  onPick(r: SunSearchResult): void;
  onRequestLocation(): Promise<LngLat | null>;
}

function headingFor(noFull: boolean, shade: boolean, failed: boolean, shownCount: number, resultsCount: number, req?: NormalizedSunRequest) {
  if (!noFull) {
    const n = resultsCount;
    return shade ? (n === 1 ? "1 sitio con sombra" : `${n} sitios con sombra`) : n === 1 ? "1 sitio con sol" : `${n} sitios con sol`;
  }
  if (failed || shownCount === 0) return shade ? "No hemos encontrado un sitio con sombra." : "No hemos encontrado un sitio soleado.";
  return `Ningún lugar cumple tus ${durationLabel(req?.minimumSunlightMinutes ?? 60)} completos.`;
}

/** Alternativas cuando nada cumple la petición: otro día, menos tiempo o más distancia. */
function RelaxActions({ planner, onRun }: Pick<Props, "planner" | "onRun">) {
  return (
    <>
      {planner.when !== "tomorrow" && (
        <GhostButton onClick={() => onRun({ ...planner, when: "tomorrow" })} className="text-sun-deep">
          Probar mañana
        </GhostButton>
      )}
      {planner.durationMinutes > 30 && (
        <GhostButton
          onClick={() => onRun({ ...planner, durationMinutes: Math.max(30, Math.round(planner.durationMinutes / 2 / 15) * 15) })}
        >
          Menos tiempo
        </GhostButton>
      )}
      {planner.maxWalkingMinutes !== null && (
        <GhostButton onClick={() => onRun({ ...planner, maxWalkingMinutes: null })}>Ampliar distancia</GhostButton>
      )}
    </>
  );
}

function noSunText(outcome: SunSearchOutcome | null, shade: boolean, failed: boolean): string {
  if (failed) return "Algo ha fallado al calcularlo. Inténtalo de nuevo.";
  if (shade) return "No hay sitios con sombra suficiente en esa franja. Prueba con menos tiempo o más distancia.";
  return outcome?.noSunReason ? NO_SUN_TEXT[outcome.noSunReason] : NO_SUN_TEXT.none;
}

/** Cabecera: cuántos sitios (o por qué ninguno), la petición y el botón de cerrar. */
function OutcomeHeader({ title, request, onClose }: { title: string; request?: NormalizedSunRequest; onClose(): void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 key={title} className="fts-fade-in font-serif text-[22px] leading-[1.1] text-ink sm:text-[24px]">
          {title}
        </h2>
        {request && <p className="mt-2 text-[11px] text-ink-soft">{describeRequest(request)}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/** Avisos sobre los datos usados (sin nubes, edificios parciales…). */
function NoticeList({ notices }: { notices: SearchNoticeCode[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1">
      {notices.map((n) => (
        <li key={n} className="flex gap-2 text-[10.5px] leading-snug text-ink-faint">
          <span aria-hidden>·</span>
          <span>{NOTICE_TEXT[n]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Resultado de una búsqueda: sitios encontrados, o explicación y alternativas si no hay. */
export default function SearchOutcomeCard({ outcome, failed, planner, origin, activeId, onEdit, onRun, onClose, onPick, onRequestLocation }: Props) {
  const results = outcome?.results ?? [];
  const shown = results.length > 0 ? results : outcome?.bestAvailable ?? [];
  const noFull = results.length === 0;
  const req = outcome?.request;
  const shade = req?.intent === "shade";
  const nearMe = async () => {
    const loc = await onRequestLocation();
    if (loc) onRun({ ...planner, maxWalkingMinutes: 20 }, loc);
  };

  return (
    <div className={card}>
      <OutcomeHeader title={headingFor(noFull, shade, failed, shown.length, results.length, req)} request={req} onClose={onClose} />

      {noFull && (
        <div className="fts-fade-in mt-3">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">{noSunText(outcome, shade, failed)}</p>
          {shown.length > 0 && outcome && (
            <p className="mt-2.5 text-[13px] font-medium text-ink">
              Mejor opción disponible: {fmtMin(outcome.meta.bestAvailableMinutes)} {shade ? "de sombra" : "de sol directo"}
            </p>
          )}
        </div>
      )}

      <NoticeList notices={outcome ? outcome.notices : []} />

      {shown.length > 0 && req && (
        <ResultCards results={shown} activeId={activeId} rangeStart={req.startTime} rangeEnd={req.endTime} shade={shade} onPick={onPick} />
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <GhostButton onClick={onEdit}>Editar búsqueda</GhostButton>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {noFull && <RelaxActions planner={planner} onRun={onRun} />}
          {!noFull && !origin && (
            <GhostButton onClick={() => void nearMe()} className="text-sun-deep">
              Cerca de mí
            </GhostButton>
          )}
        </div>
      </div>
    </div>
  );
}
