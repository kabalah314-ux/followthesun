import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER } from "../../lib/placeTypes";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import type { LocationTypeFilter, PlaceInventoryStatus, SunSearchResult } from "../../types";
import SearchResults from "../Find/SearchResults";
import { Caps, Chip } from "../FindSun/ui";
import SearchProgress from "../FindSun/SearchProgress";
import { PanelHeader } from "../Layout/ContextPanel";

interface Props {
  inventory: PlaceInventoryStatus;
  category: LocationTypeFilter;
  onCategory(c: LocationTypeFilter): void;
  search: SunSearchApi;
  /** «Hoy» o «Mañana» (si ya no queda sol hoy). */
  dayWord: string;
  activeId: string | null;
  onPick(r: SunSearchResult): void;
  onClose(): void;
}

/**
 * Lugares — explorar Barcelona sin una búsqueda concreta: categorías con datos reales y los
 * mejores sitios de hoy de cada una (mismo motor que Find the Sun). Las categorías vacías no salen.
 */
export default function PlacesExplorer({ inventory, category, onCategory, search, dayWord, activeId, onPick, onClose }: Props) {
  const types = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);
  const { status, outcome, progress, failed } = search.state;

  return (
    <>
      <PanelHeader title="Lugares" subtitle={`Dónde da el sol ${dayWord.toLowerCase()}`} onClose={onClose} />

      {inventory.state === "loading" && <p className="text-[12px] text-ink-soft">Cargando los lugares de Barcelona…</p>}
      {inventory.state === "unavailable" && (
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          No hemos podido cargar los lugares. Comprueba tu conexión e inténtalo de nuevo.
        </p>
      )}

      {types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === "any"} onClick={() => onCategory("any")}>
            Todos
          </Chip>
          {types.map((t) => (
            <Chip key={t} active={category === t} onClick={() => onCategory(t)}>
              {PLACE_TYPE_LABEL[t].plural}
              <span className="ml-1.5 tabular-nums opacity-50">{inventory.counts[t]}</span>
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3.5">
        <Caps>Mejores {dayWord.toLowerCase()}</Caps>
        <div className="mt-2.5">
          {status === "searching" && <SearchProgress progress={progress} onCancel={() => search.cancel()} />}
          {status !== "searching" && status !== "idle" && (outcome || failed) && (
            <SearchResults
              outcome={outcome}
              failed={failed}
              activeId={activeId}
              onPick={onPick}
              title={category === "any" ? "Lo mejor de Barcelona" : PLACE_TYPE_LABEL[category].plural}
            />
          )}
        </div>
      </div>

      <p className="mt-4 text-[10px] text-ink-faint">
        Lugares © OpenStreetMap. Se muestran solo categorías con datos. Las terrazas se piden aparte: se
        conoce el local, no la posición de las mesas.
      </p>
    </>
  );
}
