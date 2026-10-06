import { useState } from "react";
import { defaultPlannerWindow, oneHourOfSun, whenLabel, type PlannerState } from "../../lib/planning";
import { dayChoiceLabel, dayStartFor, hhmm, minutesOfDay, parseHHMM } from "../../lib/planningTime";
import { PLACE_TYPE_LABEL, SUN_INTENTS } from "../../lib/placeTypes";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import type { LngLat, PlaceInventoryStatus, SunIntent, SunPreference, SunSearchResult } from "../../types";
import SearchResults from "../Find/SearchResults";
import { Caps, Chip, GhostButton, PrimaryButton } from "../FindSun/ui";
import SearchProgress from "../FindSun/SearchProgress";
import { PanelHeader } from "../Layout/ContextPanel";
import PlanResult from "./PlanResult";
import { DistanceStep, PlaceTypeChips, StepSummary } from "./PlannerSteps";

/**
 * Planificar — cuatro preguntas: qué, dónde, cuándo e intensidad. Cada paso admite un valor
 * razonable por defecto, así que «Buscar» está siempre disponible. Usa el mismo motor que
 * Buscar sol/sombra (`findBestSunPlaces`): no se duplica nada.
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

/** Solo sol o sombra; el resto de intenciones siguen disponibles en Buscar sol/sombra. */
const PRIMARY_INTENTS: SunIntent[] = ["sun", "shade"];

/** Etiquetas de intensidad según se busque sol o sombra. */
const PREFERENCES: Array<[SunPreference, string, string]> = [
  ["maximum_sun", "Máximo sol", "Máxima sombra"],
  ["balanced", "Sol agradable", "Sombra agradable"],
];

const timeInput =
  "rounded-full border border-line bg-transparent px-3.5 py-2 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-sun";

interface Props {
  search: SunSearchApi;
  planner: PlannerState;
  onChange(patch: Partial<PlannerState>): void;
  onSearch(p?: PlannerState): void;
  now: number;
  origin: LngLat | null;
  inventory: PlaceInventoryStatus;
  activeId: string | null;
  isSaved(id: string): boolean;
  onPick(r: SunSearchResult): void;
  onToggleSave(r: SunSearchResult): void;
  onShare(r: SunSearchResult): void;
  onRequestLocation(): Promise<LngLat | null>;
  onClose(): void;
}

export default function SunPlanner(p: Props) {
  const { planner, onChange, now } = p;
  const { status, outcome, progress, failed } = p.search.state;
  const header = <PanelHeader title="Planificar" subtitle="Organiza tu tiempo al sol" onClose={p.onClose} />;
  const [step, setStep] = useState(0);
  const [showDistance, setShowDistance] = useState(false);

  if (status === "searching") {
    return (
      <>
        {header}
        <SearchProgress progress={progress} onCancel={() => p.search.cancel()} />
      </>
    );
  }

  if (status !== "idle" && outcome && outcome.results.length > 0) {
    return (
      <>
        {header}
        <PlanResult
          outcome={outcome}
          activeId={p.activeId}
          saved={p.isSaved(outcome.results[0].placeId)}
          onPick={p.onPick}
          onToggleSave={p.onToggleSave}
          onShare={p.onShare}
          onEdit={() => p.search.reset()}
        />
      </>
    );
  }

  if (status !== "idle" && (outcome || failed || status === "places_unavailable")) {
    return (
      <>
        {header}
        {status === "places_unavailable" ? (
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            No hemos podido cargar los lugares de Barcelona. Comprueba tu conexión e inténtalo de nuevo.
          </p>
        ) : (
          <SearchResults
            outcome={outcome}
            failed={failed}
            activeId={p.activeId}
            onPick={p.onPick}
            onEdit={() => p.search.reset()}
            editLabel="Editar plan"
            suggestions={[
              { label: "Probar mañana", onClick: () => p.onSearch({ ...planner, dayOffset: Math.min(6, planner.dayOffset + 1) }) },
            ]}
          />
        )}
      </>
    );
  }

  /* ------------------------------ formulario ------------------------------ */
  const shade = planner.intent === "shade";
  const preferenceLabel = PREFERENCES.find(([id]) => id === planner.preference)?.[shade ? 2 : 1] ?? "";

  // Sin datos de lugares todavía (o sin ellos) no se descarta ninguna intención: la búsqueda lo dirá.
  const intentAvailable = (i: SunIntent) =>
    p.inventory.state === "loading" ||
    p.inventory.state === "unavailable" ||
    SUN_INTENTS[i].types.some((t) => p.inventory.counts[t] > 0);

  /** Franja por defecto (lo que queda de hoy, o mañana) solo si aún no se ha elegido una. */
  const timeDefaults = (): Partial<PlannerState> => {
    if (planner.when === "custom") return {};
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
    if (m !== null && !p.origin) {
      const loc = await p.onRequestLocation();
      if (!loc) return;
    }
    onChange({ maxWalkingMinutes: m });
  };

  /** La duración del plan es la franja elegida: así el motor exige sol (o sombra) durante todo el rato. */
  const setWindow = (patch: Partial<PlannerState>) => {
    const from = patch.fromMinutes ?? planner.fromMinutes;
    let to = patch.toMinutes ?? planner.toMinutes;
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
    [SUN_INTENTS[planner.intent].label, 0],
    [
      planner.locationType === "any" ? "Cualquier sitio" : PLACE_TYPE_LABEL[planner.locationType].singular,
      1,
    ],
    [whenLabel(planner, now), 2],
    [planner.avoidClouds ? `${preferenceLabel} · sin nubes` : preferenceLabel, 3],
  ];

  const pastToday =
    planner.when === "custom" && planner.dayOffset === 0 && planner.toMinutes <= minutesOfDay(now);

  return (
    <>
      {header}
      <div className="fts-fade-in">
        <h2 key={step} className="fts-fade-in font-serif text-[24px] leading-none text-ink">
          {STEP_TITLES[step]}
        </h2>

        <StepSummary items={summary} step={step} onStep={goToStep} />

        <p key={`hint-${step}`} className="fts-fade-in mt-2 text-[11.5px] leading-relaxed text-ink-soft">
          {STEP_HINTS[step]}
        </p>

        <div className="mt-4 min-h-[58px]">
          {/* 0 · Qué te apetece */}
          {step === 0 && (
            <div className="fts-fade-in">
              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_INTENTS.map((i) => (
                  <Chip
                    key={i}
                    active={planner.intent === i}
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
                  <PrimaryButton onClick={() => p.onSearch(oneHourOfSun(60, p.origin !== null))}>
                    Sol 1 h cerca de mí
                  </PrimaryButton>
                  <GhostButton
                    onClick={() =>
                      p.onSearch({ ...oneHourOfSun(60, p.origin !== null), intent: "shade", locationType: "any" })
                    }
                  >
                    Sombra 1 h
                  </GhostButton>
                </div>
              </div>
            </div>
          )}

          {/* 1 · Dónde te gustaría ir */}
          {step === 1 && (
            <div className="fts-fade-in">
              <PlaceTypeChips state={planner} inventory={p.inventory} onChange={pickType} />
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
                  <DistanceStep
                    value={planner.maxWalkingMinutes}
                    hasOrigin={p.origin !== null}
                    onPick={(m) => void pickDistance(m)}
                  />
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
                  value={planner.dayOffset}
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
                <input
                  type="time"
                  aria-label="Desde"
                  value={hhmm(planner.fromMinutes)}
                  onChange={(e) => {
                    const m = parseHHMM(e.target.value);
                    if (m !== null) setWindow({ fromMinutes: m });
                  }}
                  className={timeInput}
                />
                <span>a</span>
                <input
                  type="time"
                  aria-label="Hasta"
                  value={hhmm(planner.toMinutes)}
                  onChange={(e) => {
                    const m = parseHHMM(e.target.value);
                    if (m !== null) setWindow({ toMinutes: m });
                  }}
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
              {planner.dayOffset > 1 && (
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
              <div className="flex flex-wrap gap-1.5">
                {PREFERENCES.map(([id, sunLabel, shadeLabel]) => (
                  <Chip key={id} active={planner.preference === id} onClick={() => onChange({ preference: id })}>
                    {shade ? shadeLabel : sunLabel}
                  </Chip>
                ))}
                <Chip active={planner.avoidClouds} onClick={() => onChange({ avoidClouds: !planner.avoidClouds })}>
                  Evitar nubes
                </Chip>
                {!shade && (
                  <Chip
                    active={planner.preferShadeBreaks}
                    onClick={() => onChange({ preferShadeBreaks: !planner.preferShadeBreaks })}
                  >
                    Pausas de sombra
                  </Chip>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-snug text-ink-faint">
                {planner.preference === "balanced"
                  ? shade
                    ? "«Sombra agradable» sigue teniendo en cuenta el calor y el viento."
                    : "«Sol agradable» tiene en cuenta el calor y el viento, además del sol."
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
            <PrimaryButton onClick={() => p.onSearch()}>Buscar</PrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}
