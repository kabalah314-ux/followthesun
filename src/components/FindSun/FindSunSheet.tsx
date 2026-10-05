import { useCallback, useState } from "react";
import { DEFAULT_PLANNER, buildSearchRequest, planAfternoon, type PlannerState } from "../../lib/planning";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import type { LngLat, PlaceInventoryStatus, SavedPlace, SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { CloseIcon } from "../Icons";
import Planner from "./Planner";
import PlanPanel from "../Sections/PlanPanel";
import { ResultPills } from "./ResultCards";
import SearchOutcomeCard from "./SearchOutcomeCard";
import SearchProgress from "./SearchProgress";
import { Caps, GhostButton } from "./ui";

interface Props {
  mode: "find" | "plan";
  /** El detalle de un resultado ocupa la pantalla: la hoja se reduce a una fila. */
  compact: boolean;
  now: number;
  origin: LngLat | null;
  search: SunSearchApi;
  inventory: PlaceInventoryStatus;
  activeId: string | null;
  saved: SavedPlace[];
  onClose(): void;
  onRequestLocation(): Promise<LngLat | null>;
  onPick(r: SunSearchResult): void;
  onPickSaved(p: SavedPlace): void;
}

const card = "fts-glass fts-slide-up pointer-events-auto w-full rounded-[28px] p-4 sm:p-5";

/**
 * Buscar sol / Planificar: planificador → buscando → resultados.
 * Se monta con `key={mode}`: al cambiar de modo el planificador empieza de cero.
 */
export default function FindSunSheet({
  mode,
  compact,
  now,
  origin,
  search,
  inventory,
  activeId,
  saved,
  onClose,
  onRequestLocation,
  onPick,
  onPickSaved,
}: Props) {
  const [planner, setPlanner] = useState<PlannerState>(() => (mode === "plan" ? planAfternoon(now) : DEFAULT_PLANNER));
  const patch = useCallback((p: Partial<PlannerState>) => setPlanner((s) => ({ ...s, ...p })), []);

  const run = useCallback(
    (p: PlannerState, originOverride?: LngLat | null) => {
      setPlanner(p);
      void search.run(buildSearchRequest(p, { now: Date.now(), origin: originOverride ?? origin }));
    },
    [search, origin]
  );

  const { status, outcome, request, progress, failed } = search.state;
  const shown = outcome ? (outcome.results.length > 0 ? outcome.results : outcome.bestAvailable) : [];

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
    return (
      <SearchOutcomeCard
        outcome={outcome}
        failed={failed}
        planner={planner}
        origin={origin}
        activeId={activeId}
        onEdit={() => search.reset()}
        onRun={run}
        onClose={onClose}
        onPick={onPick}
        onRequestLocation={onRequestLocation}
      />
    );
  }

  /* ------------------------------ planificador ------------------------------ */
  return (
    <div className={cn(card, "max-h-[62dvh] overflow-y-auto fts-scroll-y")}>
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
          {inventory.total} sitios · {inventory.attribution}
        </Caps>
      )}
    </div>
  );
}
