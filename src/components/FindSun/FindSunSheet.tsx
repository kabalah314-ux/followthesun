import { useCallback, useEffect, useState } from "react";
import { fmtMin } from "../../lib/formatSun";
import {
  DEFAULT_PLANNER,
  buildSearchRequest,
  durationLabel,
  oneHourOfSun,
  planAfternoon,
  type PlannerState,
} from "../../lib/planning";
import { dayChoiceLabel } from "../../lib/planningTime";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import type {
  LngLat,
  NormalizedSunRequest,
  PlaceInventoryStatus,
  SavedPlace,
  SearchNoticeCode,
  SunSearchResult,
} from "../../types";
import { cn } from "../../utils/cn";
import { CloseIcon } from "../Icons";
import Planner from "./Planner";
import PlanPanel from "../Sections/PlanPanel";
import { ResultCards, ResultPills } from "./ResultCards";
import SearchProgress from "./SearchProgress";
import { Caps, GhostButton } from "./ui";

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
  return `${day} ${formatClock(r.startTime)}–${formatClock(r.endTime)} · ${durationLabel(r.minimumSunlightMinutes)} de sol`;
}

interface Props {
  mode: "find" | "plan";
  open: boolean;
  /** El detalle de un resultado ocupa la pantalla: la hoja se reduce a una fila. */
  compact: boolean;
  now: number;
  origin: LngLat | null;
  search: SunSearchApi;
  inventory: PlaceInventoryStatus;
  activeId: string | null;
  saved: SavedPlace[];
  onOpen(): void;
  onModeChange(mode: "find" | "plan"): void;
  onClose(): void;
  onRequestLocation(): Promise<LngLat | null>;
  onPick(r: SunSearchResult): void;
  onPickSaved(p: SavedPlace): void;
}

const card = "fts-glass fts-slide-up pointer-events-auto w-full rounded-[28px] p-4 sm:p-5";

/**
 * Find the Sun + Sun Session Planner: una sola experiencia.
 *   cerrado → «Find the Sun» y «1 h de sol» (acción instantánea)
 *   abierto → planificador (qué · cuándo · cuánto · hasta dónde · dónde) → buscando → resultados
 */
export default function FindSunSheet({
  mode,
  open,
  compact,
  now,
  origin,
  search,
  inventory,
  activeId,
  saved,
  onOpen,
  onModeChange,
  onClose,
  onRequestLocation,
  onPick,
  onPickSaved,
}: Props) {
  const [planner, setPlanner] = useState<PlannerState>(() => (mode === "plan" ? planAfternoon(now) : DEFAULT_PLANNER));
  const patch = useCallback((p: Partial<PlannerState>) => setPlanner((s) => ({ ...s, ...p })), []);

  useEffect(() => {
    setPlanner(mode === "plan" ? planAfternoon(now) : DEFAULT_PLANNER);
  }, [mode]);

  const run = useCallback(
    (p: PlannerState, originOverride?: LngLat | null) => {
      setPlanner(p);
      void search.run(buildSearchRequest(p, { now: Date.now(), origin: originOverride ?? origin }));
    },
    [search, origin]
  );

  const modeSwitch = (
    <div className="flex rounded-full border border-line bg-ink/[0.035] p-[3px]" role="tablist" aria-label="Tipo de búsqueda">
      {(["find", "plan"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onModeChange(m)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] transition-all duration-300",
            mode === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
          )}
        >
          {m === "find" ? "Encontrar sitio" : "Planear tiempo"}
        </button>
      ))}
    </div>
  );

  /* ------------------------------ cerrado ------------------------------ */
  if (!open) {
    return (
      <div className="fts-rise pointer-events-auto flex items-center justify-center gap-2.5" style={{ animationDelay: "900ms" }}>
        <button
          type="button"
          onClick={onOpen}
          className="fts-cta group pointer-events-auto relative inline-flex items-center gap-3 rounded-full bg-ink px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.34em] text-paper transition-all duration-500 hover:-translate-y-0.5 active:scale-[0.98] sm:px-8 sm:py-4 sm:text-[12px]"
        >
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="fts-breathe absolute inset-0 rounded-full bg-[#ffb94d]/55 blur-[7px]" />
            <span className="relative h-[9px] w-[9px] rounded-full bg-[#ffc45e]" />
          </span>
          <span className="pl-[0.34em]">Find the Sun</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onOpen();
            run(oneHourOfSun(60, origin !== null));
          }}
          className="fts-glass pointer-events-auto rounded-full px-4 py-3 text-[11px] font-medium text-ink transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97] sm:py-3.5"
        >
          1 h de sol
        </button>
      </div>
    );
  }

  const { status, outcome, request, progress, failed } = search.state;
  const results = outcome?.results ?? [];
  const bestAvailable = outcome?.bestAvailable ?? [];
  const shown = results.length > 0 ? results : bestAvailable;

  /* ------------------------------ resultados compactos ------------------------------ */
  if (compact && outcome && shown.length > 0) {
    return (
      <div className="fts-glass pointer-events-auto w-full rounded-[24px] px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ResultPills results={shown} activeId={activeId} onPick={onPick} />
          </div>
          <GhostButton onClick={() => search.reset()}>Editar</GhostButton>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------ buscando ------------------------------ */
  if (status === "searching") {
    return (
      <div className={card}>
        <SearchProgress progress={progress} onCancel={() => search.cancel()} />
      </div>
    );
  }

  /* ------------------------------ lugares no disponibles ------------------------------ */
  if (status === "places_unavailable") {
    return (
      <div className={card}>
        <p className="font-serif text-[22px] leading-tight text-ink">
          No hemos podido cargar los lugares de Barcelona.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
          Comprueba tu conexión e inténtalo de nuevo. No mostramos resultados inventados.
        </p>
        <div className="mt-4 flex items-center justify-between">
          <GhostButton onClick={() => search.reset()}>Editar búsqueda</GhostButton>
          {request && (
            <GhostButton onClick={() => void search.run(request)} className="text-sun-deep">
              Reintentar
            </GhostButton>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ resultados / sin resultados ------------------------------ */
  if (status !== "idle" && (outcome || failed)) {
    const noFull = results.length === 0;
    const notices = outcome ? outcome.notices : [];
    const req = outcome?.request;
    const reasonText = outcome?.noSunReason ? NO_SUN_TEXT[outcome.noSunReason] : NO_SUN_TEXT.none;

    return (
      <div className={card}>
        <div className="mb-3 flex items-center justify-between gap-3">
          {modeSwitch}
          <span className="fts-caps hidden sm:block">Barcelona</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {noFull ? (
              <h2 className="font-serif text-[22px] leading-[1.1] text-ink sm:text-[24px]">
                {failed || shown.length === 0
                  ? "No hemos encontrado un sitio soleado."
                  : `Ningún lugar cumple tus ${durationLabel(req?.minimumSunlightMinutes ?? 60)} completos.`}
              </h2>
            ) : (
              <h2 key={results.length} className="fts-fade-in font-serif text-[22px] leading-none text-ink sm:text-[24px]">
                {results.length === 1 ? "1 lugar encontrado" : `${results.length} mejores lugares`}
              </h2>
            )}
            {req && <p className="mt-2 text-[11px] text-ink-soft">{describeRequest(req)}</p>}
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

        {noFull && (
          <div className="fts-fade-in mt-3">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              {failed ? "Algo ha fallado al calcularlo. Inténtalo de nuevo." : reasonText}
            </p>
            {shown.length > 0 && outcome && (
              <p className="mt-2.5 text-[13px] font-medium text-ink">
                Mejor opción disponible: {fmtMin(outcome.meta.bestAvailableMinutes)} de sol directo
              </p>
            )}
          </div>
        )}

        {notices.length > 0 && (
          <ul className="mt-3 space-y-1">
            {notices.map((n) => (
              <li key={n} className="flex gap-2 text-[10.5px] leading-snug text-ink-faint">
                <span aria-hidden>·</span>
                <span>{NOTICE_TEXT[n]}</span>
              </li>
            ))}
          </ul>
        )}

        {shown.length > 0 && req && (
          <ResultCards
            results={shown}
            activeId={activeId}
            rangeStart={req.startTime}
            rangeEnd={req.endTime}
            onPick={onPick}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <GhostButton onClick={() => search.reset()}>Editar búsqueda</GhostButton>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {noFull && (
              <>
                {planner.when !== "tomorrow" && (
                  <GhostButton onClick={() => run({ ...planner, when: "tomorrow" })} className="text-sun-deep">
                    Probar mañana
                  </GhostButton>
                )}
                {planner.durationMinutes > 30 && (
                  <GhostButton
                    onClick={() =>
                      run({ ...planner, durationMinutes: Math.max(30, Math.round(planner.durationMinutes / 2 / 15) * 15) })
                    }
                  >
                    Menos tiempo
                  </GhostButton>
                )}
                {planner.maxWalkingMinutes !== null && (
                  <GhostButton onClick={() => run({ ...planner, maxWalkingMinutes: null })}>
                    Ampliar distancia
                  </GhostButton>
                )}
              </>
            )}
            {!noFull && !origin && (
              <GhostButton
                onClick={async () => {
                  const loc = await onRequestLocation();
                  if (loc) run({ ...planner, maxWalkingMinutes: 20 }, loc);
                }}
                className="text-sun-deep"
              >
                Cerca de mí
              </GhostButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ planificador ------------------------------ */
  return (
    <div className={cn(card, "max-h-[62dvh] overflow-y-auto fts-scroll-y")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {modeSwitch}
        {inventory.state === "ready" && <span className="fts-caps hidden sm:block">Barcelona</span>}
      </div>
      {mode === "plan" ? (
        <PlanPanel
          state={planner}
          onChange={patch}
          now={now}
          origin={origin}
          inventory={inventory}
          onSearch={() => run(planner)}
          onRequestLocation={onRequestLocation}
          onClose={onClose}
        />
      ) : (
        <Planner
          state={planner}
          onChange={patch}
          now={now}
          origin={origin}
          inventory={inventory}
          saved={saved}
          onSearch={() => run(planner)}
          onQuick={(p) => run(p)}
          onRequestLocation={onRequestLocation}
          onPickSaved={onPickSaved}
          onClose={onClose}
        />
      )}
      {inventory.state !== "loading" && (
        <Caps className="mt-4 text-center !tracking-[0.14em] !text-ink-faint">
          Lugares © OpenStreetMap
        </Caps>
      )}
    </div>
  );
}
