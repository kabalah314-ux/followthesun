import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER, SHADE_SERVICE_TYPES } from "../../lib/placeTypes";
import type { PlannerState } from "../../lib/planning";
import type { PlaceInventoryStatus } from "../../types";
import { cn } from "../../utils/cn";
import { Chip } from "../FindSun/ui";
import PlaceTypeIcon from "../Places/PlaceTypeIcon";
import { tr } from "../../i18n";

const DISTANCES: Array<number | null> = [5, 10, 20, 30, null];

/** Resumen de la petición: una pastilla por paso; tocarla vuelve a ese paso. */
export function StepSummary({
  items,
  step,
  onStep,
}: {
  items: Array<[string, number]>;
  step: number;
  onStep(i: number): void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map(([text, idx]) => (
        <button
          key={idx}
          type="button"
          onClick={() => onStep(idx)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors duration-300",
            step === idx ? "bg-sun-soft text-sun-deep" : "bg-ink/[0.04] text-ink-soft hover:text-ink"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

interface TypeProps {
  state: PlannerState;
  inventory: PlaceInventoryStatus;
  onChange(patch: Partial<PlannerState>): void;
}

/**
 * Paso 1 · ¿Dónde te gustaría ir? Solo se ofrecen los tipos con datos reales. Buscando sombra se
 * añaden los refugios climáticos y las fuentes (Open Data BCN), que contra el calor sí son destino.
 */
export function PlaceTypeChips({ state, inventory, onChange }: TypeProps) {
  const offered = state.intent === "shade" ? [...PLACE_TYPE_ORDER, ...SHADE_SERVICE_TYPES] : PLACE_TYPE_ORDER;
  const typesAvailable = offered.filter((t) => (inventory.counts[t] ?? 0) > 0);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={state.locationType === "any"} onClick={() => onChange({ locationType: "any" })}>
          {tr("plannerSteps.cualquier_sitio")}
        </Chip>
        {typesAvailable.map((t) => (
          <Chip key={t} active={state.locationType === t} onClick={() => onChange({ locationType: t })}>
            <span className="inline-flex items-center gap-1.5">
              <PlaceTypeIcon type={t} size={15} className="shrink-0 opacity-80" />
              {PLACE_TYPE_LABEL[t].singular}
            </span>
          </Chip>
        ))}
      </div>
      {inventory.state === "loading" && (
        <p className="mt-2.5 text-[12.5px] text-ink-faint">{tr("placesExplorer.cargando_los_lugares_de_barcelona")}</p>
      )}
      {inventory.state === "unavailable" && (
        <p className="mt-2.5 text-[12.5px] text-ink-faint">
          {tr("plannerSteps.no_hemos_podido_cargar_los")}
        </p>
      )}
    </div>
  );
}

/** Paso 1 (opcional) · ¿Hasta dónde caminas? */
export function DistanceStep({
  value,
  hasOrigin,
  onPick,
}: {
  value: number | null;
  hasOrigin: boolean;
  onPick(m: number | null): void;
}) {
  return (
    <div className="fts-fade-in">
      <div className="flex flex-wrap gap-1.5">
        {DISTANCES.map((m) => (
          <Chip key={m ?? "any"} active={value === m} onClick={() => onPick(m)}>
            {m === null ? tr("plannerSteps.cualquier_distancia") : tr("plannerSteps.min_a_pie", { p0: m })}
          </Chip>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">
        {hasOrigin
          ? tr("plannerSteps.tiempo_a_pie_estimado_desde")
          : tr("plannerSteps.sin_tu_ubicacion_se_busca")}
      </p>
    </div>
  );
}
