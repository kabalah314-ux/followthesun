import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER } from "../../lib/placeTypes";
import type { PlannerState } from "../../lib/planning";
import type { PlaceInventoryStatus } from "../../types";
import { cn } from "../../utils/cn";
import { Chip } from "../FindSun/ui";

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
            "rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors duration-300",
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

/** Paso 1 · ¿Dónde te gustaría ir? Solo se ofrecen los tipos con datos reales. */
export function PlaceTypeChips({ state, inventory, onChange }: TypeProps) {
  const typesAvailable = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={state.locationType === "any"} onClick={() => onChange({ locationType: "any" })}>
          Cualquier sitio
        </Chip>
        {typesAvailable.map((t) => (
          <Chip key={t} active={state.locationType === t} onClick={() => onChange({ locationType: t })}>
            {PLACE_TYPE_LABEL[t].singular}
          </Chip>
        ))}
      </div>
      {inventory.state === "loading" && (
        <p className="mt-2.5 text-[11px] text-ink-faint">Cargando los lugares de Barcelona…</p>
      )}
      {inventory.state === "unavailable" && (
        <p className="mt-2.5 text-[11px] text-ink-faint">
          No hemos podido cargar los lugares. Comprueba tu conexión.
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
            {m === null ? "Cualquier distancia" : `${m} min a pie`}
          </Chip>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-ink-faint">
        {hasOrigin
          ? "Tiempo a pie estimado desde tu ubicación (en línea recta con rodeo, no una ruta real)."
          : "Sin tu ubicación se busca en toda Barcelona. Al limitar el tiempo te la pediremos; es opcional."}
      </p>
    </div>
  );
}
