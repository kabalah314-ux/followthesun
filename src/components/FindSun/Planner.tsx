import { useState } from "react";
import { PLACE_TYPE_LABEL, SUN_INTENTS } from "../../lib/placeTypes";
import {
  defaultPlannerWindow,
  oneHourOfSun,
  whenLabel,
  type PlannerState,
} from "../../lib/planning";
import { dayChoiceLabel, dayStartFor, minutesOfDay } from "../../lib/planningTime";
import TimeSelect from "../TimeSelect";
import type {
  LngLat,
  PlaceInventoryStatus,
  SavedPlace,
  SunIntent,
  SunPreference,
} from "../../types";
import { CloseIcon } from "../Icons";
import { Caps, Chip, GhostButton, PrimaryButton } from "./ui";
import { DistanceStep, PlaceTypeChips, StepSummary } from "./PlannerSteps";

/**
 * Buscar sol/sombra — cuatro preguntas: qué, dónde, cuándo e intensidad. Cada paso admite un
 * valor razonable por defecto, así que «Buscar» está siempre disponible.
 */
const STEP_TITLES = [
  "¿Qué te apetece?",
  "¿Dónde te gustaría ir?",
  "¿De qué hora a qué hora planeas estar?",
  "¿Intensidad de sol?",
];

const STEP_HINTS = [
  "Elige si buscas sol o sombra.",
  "Opcional · el tipo de sitio o «cualquier sitio».",
  "Obligatorio · la franja en la que vas a estar, en hora de Barcelona.",
  "Opcional · cómo de intenso lo quieres.",
];

/** Solo sol o sombra; el resto de intenciones siguen disponibles como atajos. */
const PRIMARY_INTENTS: SunIntent[] = ["sun", "shade"];

/** Etiquetas de intensidad según se busque sol o sombra. */
const PREFERENCES: Array<[SunPreference, string, string]> = [
  ["maximum_sun", "Máximo sol", "Máxima sombra"],
  ["balanced", "Sol agradable", "Sombra agradable"],
];

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
  const [showDistance, setShowDistance] = useState(false);

  const shade = state.intent === "shade";
  const preferenceLabel = PREFERENCES.find(([id]) => id === state.preference)?.[shade ? 2 : 1] ?? "";

  // Sin datos de lugares todavía (o sin ellos) no se descarta ninguna intención: la búsqueda lo dirá.
  const intentAvailable = (i: SunIntent) =>
    inventory.state === "loading" ||
    inventory.state === "unavailable" ||
    SUN_INTENTS[i].types.some((t) => inventory.counts[t] > 0);

  /** Franja por defecto (lo que queda de hoy, o mañana) solo si aún no se ha elegido una. */
  const timeDefaults = (): Partial<PlannerState> => {
    if (state.when === "custom") return {};
    const w = defaultPlannerWindow(now);
    return { when: "custom", ...w, durationMinutes: Math.max(10, w.toMinutes - w.fromMinutes) };
  };

  const pickIntent = (i: SunIntent) => {
    onChange({
      intent: i,
      preference: SUN_INTENTS[i].preference,
      locationType: "any",
      ...timeDefaults(),
    });
    setStep(1);
  };

  const openTimeStep = () => {
    onChange(timeDefaults());
    setStep(2);
  };

  const pickType = (patch: Partial<PlannerState>) => {
    onChange(patch);
    if (patch.locationType !== undefined) openTimeStep();
  };

  const pickDistance = async (m: number | null) => {
    // Pedir la ubicación solo cuando la persona limita la distancia: nunca por sorpresa.
    if (m !== null && !origin) {
      const loc = await onRequestLocation();
      if (!loc) return;
    }
    onChange({ maxWalkingMinutes: m });
  };

  /** La duración del plan es la franja elegida: así el motor exige sol durante todo el rato. */
  const setWindow = (patch: Partial<PlannerState>) => {
    const from = patch.fromMinutes ?? state.fromMinutes;
    let to = patch.toMinutes ?? state.toMinutes;
    if (to <= from) to = Math.min(1439, from + 30);
    onChange({
      ...patch,
      when: "custom",
      fromMinutes: from,
      toMinutes: to,
      durationMinutes: Math.max(10, to - from),
    });
  };

  const goToStep = (i: number) => (i === 2 ? openTimeStep() : setStep(i));

  const summary: Array<[string, number]> = [
    [SUN_INTENTS[state.intent].label, 0],
    [state.locationType === "any" ? "Cualquier sitio" : PLACE_TYPE_LABEL[state.locationType].singular, 1],
    [whenLabel(state, now), 2],
    [state.avoidClouds ? `${preferenceLabel} · sin nubes` : preferenceLabel, 3],
  ];

  const pastToday = state.when === "custom" && state.dayOffset === 0 && state.toMinutes <= minutesOfDay(now);

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

      <StepSummary items={summary} step={step} onStep={goToStep} />

      <p key={`hint-${step}`} className="fts-fade-in mt-2 text-[11.5px] leading-relaxed text-ink-soft">
        {STEP_HINTS[step]}
      </p>

      <div className="mt-4 min-h-[58px]">
        {/* 0 · Qué te apetece */}
        {step === 0 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {PRIMARY_INTENTS.map((i) => (
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

        {/* 1 · Dónde te gustaría ir */}
        {step === 1 && (
          <div className="fts-fade-in">
            <PlaceTypeChips state={state} inventory={inventory} onChange={pickType} />
            <button
              type="button"
              onClick={() => setShowDistance((v) => !v)}
              aria-expanded={showDistance}
              className="mt-3.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
            >
              {showDistance ? "Ocultar la distancia" : "¿A qué distancia?"}
            </button>
            {showDistance && (
              <div className="mt-3">
                <DistanceStep value={state.maxWalkingMinutes} hasOrigin={origin !== null} onPick={(m) => void pickDistance(m)} />
              </div>
            )}
          </div>
        )}

        {/* 2 · De qué hora a qué hora */}
        {step === 2 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-ink-soft">
              <select
                aria-label="Día"
                value={state.dayOffset}
                onChange={(e) => onChange({ when: "custom", dayOffset: Number(e.target.value) })}
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
                onChange={(m) => setWindow({ fromMinutes: m })}
                className={timeInput}
              />
              <span>a</span>
              <TimeSelect
                label="Hasta"
                value={state.toMinutes}
                onChange={(m) => setWindow({ toMinutes: m })}
                className={timeInput}
              />
            </div>

            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              {shade
                ? "Se busca el sitio con más sombra seguida durante toda esa franja."
                : "Se busca el sitio con más sol seguido durante toda esa franja, no solo a una hora concreta."}
            </p>

            {pastToday && (
              <p className="mt-2.5 text-[11px] leading-snug text-sun-deep">
                Esa franja ya ha pasado hoy: elige otro día o mueve la hora.
              </p>
            )}
            {state.dayOffset > 1 && (
              <p className="mt-2.5 text-[11px] leading-snug text-ink-faint">
                Más allá de mañana no hay previsión: solo se calcula la geometría solar y las sombras
                (sol posible, no confirmado).
              </p>
            )}
          </div>
        )}

        {/* 3 · Intensidad */}
        {step === 3 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {PREFERENCES.map(([id, sunLabel, shadeLabel]) => (
                <Chip key={id} active={state.preference === id} onClick={() => onChange({ preference: id })}>
                  {shade ? shadeLabel : sunLabel}
                </Chip>
              ))}
              <Chip active={state.avoidClouds} onClick={() => onChange({ avoidClouds: !state.avoidClouds })}>
                Evitar nubes
              </Chip>
              {!shade && (
                <Chip active={state.preferShadeBreaks} onClick={() => onChange({ preferShadeBreaks: !state.preferShadeBreaks })}>
                  Pausas de sombra
                </Chip>
              )}
            </div>

            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              {state.preference === "balanced"
                ? "«Sol agradable» tiene en cuenta el calor y el viento, además del sol."
                : shade
                  ? "A máxima sombra solo cuenta la ausencia de sol directo."
                  : "A máximo sol solo punta la luz directa: calor y viento no se tienen en cuenta."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 0 ? <GhostButton onClick={() => setStep(step - 1)}>Atrás</GhostButton> : <span />}
        <div className="flex items-center gap-2">
          {step < STEP_TITLES.length - 1 && (
            <GhostButton onClick={() => (step === 1 ? openTimeStep() : setStep(step + 1))} className="text-sun-deep">
              Siguiente →
            </GhostButton>
          )}
          <PrimaryButton onClick={onSearch}>Buscar</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
