import { useState } from "react";
import {
  INTENT_ORDER,
  PLACE_TYPE_LABEL,
  SUN_INTENTS,
} from "../../lib/placeTypes";
import {
  distanceLabel,
  durationLabel,
  oneHourOfSun,
  whenLabel,
  type PlannerState,
} from "../../lib/planning";
import { dayChoiceLabel, dayStartFor } from "../../lib/planningTime";
import TimeSelect from "../TimeSelect";
import type {
  LngLat,
  PlaceInventoryStatus,
  SavedPlace,
  SunIntent,
  WhenPreset,
} from "../../types";
import { CloseIcon } from "../Icons";
import { Caps, Chip, GhostButton, PrimaryButton } from "./ui";
import { DistanceStep, PlaceTypeStep, StepSummary } from "./PlannerSteps";

/**
 * Sun Session Planner — qué quieres hacer, cuándo, cuánto tiempo, hasta dónde y dónde.
 * Cada paso es una fila de opciones pequeñas; elegir una avanza al siguiente paso, y «Buscar» está
 * siempre disponible porque todo tiene un valor razonable por defecto.
 */

const STEP_TITLES = ["¿Qué te apetece?", "¿Cuándo?", "¿Cuánto rato?", "¿Hasta dónde?", "¿Qué tipo de sitio?"];

const WHEN_PRESETS: Array<{ id: WhenPreset; label: string }> = [
  { id: "now", label: "Ahora" },
  { id: "in30", label: "En 30 min" },
  { id: "in60", label: "En 1 h" },
  { id: "afternoon", label: "Esta tarde" },
  { id: "tomorrow", label: "Mañana" },
];

const DURATIONS = [30, 60, 120, 180];

const timeInput =
  "rounded-full border border-line bg-transparent px-3.5 py-2 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-sun";

interface Props {
  state: PlannerState;
  onChange(patch: Partial<PlannerState>): void;
  now: number;
  origin: LngLat | null;
  inventory: PlaceInventoryStatus;
  saved: SavedPlace[];
  onSearch(): void;
  /** Lanza ya una búsqueda con una configuración (atajos). */
  onQuick(p: PlannerState): void;
  onRequestLocation(): Promise<LngLat | null>;
  onPickSaved(p: SavedPlace): void;
  onClose(): void;
}

export default function Planner({
  state,
  onChange,
  now,
  origin,
  inventory,
  saved,
  onSearch,
  onQuick,
  onRequestLocation,
  onPickSaved,
  onClose,
}: Props) {
  const [step, setStep] = useState(0);
  const [customDuration, setCustomDuration] = useState(false);

  // Sin datos de lugares todavía (o sin ellos) no se descarta ninguna intención: la búsqueda lo dirá.
  const intentAvailable = (i: SunIntent) =>
    inventory.state === "loading" ||
    inventory.state === "unavailable" ||
    SUN_INTENTS[i].types.some((t) => inventory.counts[t] > 0);

  const pickIntent = (i: SunIntent) => {
    const d = SUN_INTENTS[i];
    onChange({
      intent: i,
      when: d.defaultWhen,
      durationMinutes: d.defaultDurationMinutes,
      preference: d.preference,
      locationType: "any",
    });
    setCustomDuration(false);
    setStep(1);
  };
  const pickWhen = (w: WhenPreset) => {
    onChange({ when: w });
    if (w !== "custom") setStep(2);
  };
  const pickDuration = (m: number) => {
    onChange({ durationMinutes: m });
    setCustomDuration(false);
    setStep(3);
  };
  const pickDistance = async (m: number | null) => {
    // Pedir la ubicación solo cuando la persona limita la distancia: nunca por sorpresa.
    if (m !== null && !origin) {
      const loc = await onRequestLocation();
      if (!loc) return;
    }
    onChange({ maxWalkingMinutes: m });
    setStep(4);
  };

  const summary: Array<[string, number]> = [
    [SUN_INTENTS[state.intent].label, 0],
    [whenLabel(state, now), 1],
    [durationLabel(state.durationMinutes), 2],
    [distanceLabel(state.maxWalkingMinutes), 3],
    [state.locationType === "any" ? "Cualquier tipo" : PLACE_TYPE_LABEL[state.locationType].singular, 4],
  ];

  const isPreset = DURATIONS.includes(state.durationMinutes);

  return (
    <div className="fts-fade-in">
      <div className="flex items-start justify-between gap-3">
        <h2 key={step} className="fts-fade-in font-serif text-[24px] leading-none text-ink sm:text-[26px]">
          {STEP_TITLES[step]}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <StepSummary items={summary} step={step} onStep={setStep} />

      <div className="mt-4 min-h-[58px]">
        {/* 0 · Qué */}
        {step === 0 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {INTENT_ORDER.map((i) => (
                <Chip
                  key={i}
                  active={state.intent === i}
                  disabled={!intentAvailable(i)}
                  title={SUN_INTENTS[i].hint}
                  onClick={() => pickIntent(i)}
                >
                  {SUN_INTENTS[i].label}
                </Chip>
              ))}
            </div>

            <div className="mt-4 space-y-3 border-t border-line pt-3.5">
              <Caps>Atajos</Caps>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <PrimaryButton onClick={() => onQuick(oneHourOfSun(60, origin !== null))}>
                  Sol 1 h cerca de mí
                </PrimaryButton>
                <GhostButton onClick={() => onQuick({ ...oneHourOfSun(60, origin !== null), intent: "shade", locationType: "any" })}>
                  Sombra 1 h
                </GhostButton>
              </div>
              {saved.length > 0 && (
                <div className="space-y-2 pt-1">
                  <Caps>Guardados</Caps>
                  <div className="flex flex-wrap gap-1.5">
                    {saved.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onPickSaved(p)}
                        className="rounded-full bg-ink/[0.04] px-3 py-1.5 text-[11px] font-medium text-ink-soft transition-colors hover:text-ink"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 1 · Cuándo */}
        {step === 1 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {WHEN_PRESETS.map((w) => (
                <Chip key={w.id} active={state.when === w.id} onClick={() => pickWhen(w.id)}>
                  {w.label}
                </Chip>
              ))}
              {state.intent === "sunset" && (
                <Chip active={state.when === "sunset"} onClick={() => pickWhen("sunset")}>
                  Al atardecer
                </Chip>
              )}
              <Chip active={state.when === "custom"} onClick={() => pickWhen("custom")}>
                Elegir hora
              </Chip>
            </div>

            {state.when === "custom" && (
              <div className="fts-fade-in mt-3.5 flex flex-wrap items-center gap-2.5 text-[12px] text-ink-soft">
                <select
                  aria-label="Día"
                  value={state.dayOffset}
                  onChange={(e) => onChange({ dayOffset: Number(e.target.value) })}
                  className={timeInput}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {dayChoiceLabel(dayStartFor(now, d), now)}
                    </option>
                  ))}
                </select>
                <span>de</span>
                <TimeSelect
                  label="Desde"
                  value={state.fromMinutes}
                  onChange={(m) => {
                    onChange({
                      fromMinutes: m,
                      toMinutes:
                        state.toMinutes > m ? state.toMinutes : Math.min(1439, m + state.durationMinutes),
                    });
                  }}
                  className={timeInput}
                />
                <span>a</span>
                <TimeSelect
                  label="Hasta"
                  value={state.toMinutes}
                  onChange={(m) => onChange({ toMinutes: m })}
                  className={timeInput}
                />
                <GhostButton onClick={() => setStep(2)} className="text-sun-deep">
                  Siguiente →
                </GhostButton>
              </div>
            )}
            {state.when === "custom" && state.dayOffset > 1 && (
              <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
                Más allá de mañana no hay previsión: solo se calcula la geometría solar y las sombras
                (sol posible, no confirmado).
              </p>
            )}
          </div>
        )}

        {/* 2 · Cuánto */}
        {step === 2 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((m) => (
                <Chip key={m} active={!customDuration && state.durationMinutes === m} onClick={() => pickDuration(m)}>
                  {durationLabel(m)}
                </Chip>
              ))}
              <Chip active={customDuration || !isPreset} onClick={() => setCustomDuration(true)}>
                Otra…
              </Chip>
            </div>
            {(customDuration || !isPreset) && (
              <div className="fts-fade-in mt-3.5 flex items-center gap-3 text-[12px] text-ink-soft">
                <button
                  type="button"
                  aria-label="15 minutos menos"
                  onClick={() => onChange({ durationMinutes: Math.max(15, state.durationMinutes - 15) })}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-ink/[0.06]"
                >
                  −
                </button>
                <span className="min-w-[84px] text-center font-serif text-[20px] tabular-nums text-ink">
                  {durationLabel(state.durationMinutes)}
                </span>
                <button
                  type="button"
                  aria-label="15 minutos más"
                  onClick={() => onChange({ durationMinutes: Math.min(360, state.durationMinutes + 15) })}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-ink/[0.06]"
                >
                  +
                </button>
                <GhostButton onClick={() => setStep(3)} className="text-sun-deep">
                  Siguiente →
                </GhostButton>
              </div>
            )}
            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              {state.intent === "shade"
                ? "Se busca el sitio con más sombra seguida durante todo ese tiempo."
                : "Se busca el sitio con más sol seguido durante todo ese tiempo, no solo a una hora concreta."}
            </p>
          </div>
        )}

        {step === 3 && (
          <DistanceStep value={state.maxWalkingMinutes} hasOrigin={origin !== null} onPick={(m) => void pickDistance(m)} />
        )}
        {step === 4 && <PlaceTypeStep state={state} inventory={inventory} onChange={onChange} />}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 0 ? <GhostButton onClick={() => setStep(step - 1)}>Atrás</GhostButton> : <span />}
        <PrimaryButton onClick={onSearch}>Buscar</PrimaryButton>
      </div>
    </div>
  );
}
