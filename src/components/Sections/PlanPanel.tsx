import { useState } from "react";
import {
  PLACE_TYPE_LABEL,
  PLACE_TYPE_ORDER,
} from "../../lib/placeTypes";
import { durationLabel, whenLabel, type PlannerState } from "../../lib/planning";
import { dayChoiceLabel, dayStartFor, hhmm, parseHHMM } from "../../lib/planningTime";
import type { LngLat, PlaceInventoryStatus, SunPreference } from "../../types";
import { CloseIcon } from "../Navigation/NavIcons";
import { Caps, Chip, PrimaryButton } from "../FindSun/ui";

const DURATIONS = [30, 60, 120, 180];
const INPUT =
  "rounded-full border border-line bg-transparent px-3.5 py-2 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-sun";

interface Props {
  state: PlannerState;
  onChange(patch: Partial<PlannerState>): void;
  now: number;
  origin: LngLat | null;
  inventory: PlaceInventoryStatus;
  onSearch(): void;
  onRequestLocation(): Promise<LngLat | null>;
  onClose(): void;
}

/** Plan es la pregunta temporal; Find pregunta por el mejor sitio ahora. Entrada simple → mejor ventana. */
export default function PlanPanel({ state, onChange, now, origin, inventory, onSearch, onRequestLocation, onClose }: Props) {
  const [customDuration, setCustomDuration] = useState(!DURATIONS.includes(state.durationMinutes));
  const types = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);

  const chooseDistance = async (minutes: number | null) => {
    if (minutes !== null && !origin && !(await onRequestLocation())) return;
    onChange({ maxWalkingMinutes: minutes });
  };

  return (
    <div className="fts-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Caps>Elige cuándo salir</Caps>
          <h2 className="mt-1.5 font-serif text-[24px] leading-none text-ink">Planifica tu franja</h2>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
            Elige una franja y cuánto sol quieres disfrutar. Encontraremos la mejor ventana dentro de ella.
          </p>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button -mr-1 -mt-1">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Caps>Cuándo</Caps>
          <div className="flex flex-wrap gap-1.5">
            {["now", "afternoon", "sunset", "tomorrow"].map((when) => (
              <Chip key={when} active={state.when === when} onClick={() => onChange({ when: when as PlannerState["when"] })}>
                {whenLabel({ ...state, when: when as PlannerState["when"] }, now)}
              </Chip>
            ))}
            <Chip active={state.when === "custom"} onClick={() => onChange({ when: "custom" })}>Elegir</Chip>
          </div>
          {state.when === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
              <select
                aria-label="Día"
                value={state.dayOffset}
                onChange={(e) => onChange({ dayOffset: Number(e.target.value) })}
                className={INPUT}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>{dayChoiceLabel(dayStartFor(now, d), now)}</option>
                ))}
              </select>
              <span>De</span>
              <input
                type="time"
                aria-label="Desde"
                value={hhmm(state.fromMinutes)}
                onChange={(e) => {
                  const m = parseHHMM(e.target.value);
                  if (m !== null) onChange({ fromMinutes: m, toMinutes: Math.max(state.toMinutes, m + 30) });
                }}
                className={INPUT}
              />
              <span>a</span>
              <input
                type="time"
                aria-label="Hasta"
                value={hhmm(state.toMinutes)}
                onChange={(e) => { const m = parseHHMM(e.target.value); if (m !== null) onChange({ toMinutes: m }); }}
                className={INPUT}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Caps>Cuánto sol</Caps>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((m) => (
              <Chip key={m} active={!customDuration && state.durationMinutes === m} onClick={() => { setCustomDuration(false); onChange({ durationMinutes: m }); }}>
                {durationLabel(m)}
              </Chip>
            ))}
            <Chip active={customDuration} onClick={() => setCustomDuration(true)}>Otra…</Chip>
          </div>
          {customDuration && (
            <div className="flex items-center gap-2">
              <button type="button" aria-label="15 minutos menos" onClick={() => onChange({ durationMinutes: Math.max(15, state.durationMinutes - 15) })} className="fts-stepper">−</button>
              <span className="min-w-[74px] text-center font-serif text-[18px] tabular-nums text-ink">{durationLabel(state.durationMinutes)}</span>
              <button type="button" aria-label="15 minutos más" onClick={() => onChange({ durationMinutes: Math.min(360, state.durationMinutes + 15) })} className="fts-stepper">+</button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Caps>Prioridad</Caps>
          <div className="flex flex-wrap gap-1.5">
            {([["maximum_sun", "Máximo sol"], ["balanced", "Equilibrado"]] as Array<[SunPreference, string]>).map(([id, label]) => (
              <Chip key={id} active={state.preference === id} onClick={() => onChange({ preference: id })}>{label}</Chip>
            ))}
            <Chip active={state.avoidClouds} onClick={() => onChange({ avoidClouds: !state.avoidClouds })}>Evitar nubes</Chip>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Caps>Dónde</Caps>
            <button type="button" onClick={() => void chooseDistance(state.maxWalkingMinutes === null ? 20 : null)} className="text-[10.5px] font-medium text-sun-deep">
              {origin ? "Mi ubicación" : "Cerca de mí"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {types.length > 0 && (
              <Chip active={state.locationType === "any"} onClick={() => onChange({ locationType: "any" })}>Cualquier lugar</Chip>
            )}
            {types.map((t) => (
              <Chip key={t} active={state.locationType === t} onClick={() => onChange({ locationType: t })}>
                {PLACE_TYPE_LABEL[t].singular}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([5, 10, 20, 30, null] as Array<number | null>).map((m) => (
              <Chip key={m ?? "any"} active={state.maxWalkingMinutes === m} onClick={() => void chooseDistance(m)}>
                {m === null ? "Cualquier distancia" : `${m} min a pie`}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <span className="text-[10px] text-ink-faint">24 h · Europe/Madrid</span>
        <PrimaryButton onClick={onSearch}>Encontrar mi mejor plan</PrimaryButton>
      </div>
    </div>
  );
}