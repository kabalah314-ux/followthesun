import { useState } from "react";
import {
  INTENT_ORDER,
  PLACE_TYPE_LABEL,
  PLACE_TYPE_ORDER,
  SUN_INTENTS,
} from "../../lib/placeTypes";
import {
  distanceLabel,
  durationLabel,
  oneHourOfSun,
  planAfternoon,
  sunAt,
  whenLabel,
  type PlannerState,
} from "../../lib/planning";
import { dayChoiceLabel, dayStartFor, hhmm, parseHHMM } from "../../lib/planningTime";
import type {
  LngLat,
  PlaceInventoryStatus,
  SavedPlace,
  SunIntent,
  SunPreference,
  WhenPreset,
} from "../../types";
import { cn } from "../../utils/cn";
import { CloseIcon } from "../Icons";
import { Caps, Chip, GhostButton, PrimaryButton } from "./ui";

/**
 * Sun Session Planner — qué quieres hacer, cuándo, cuánto tiempo, hasta dónde y dónde.
 * Cada paso es una fila de opciones pequeñas; elegir una avanza al siguiente paso, y «Buscar» está
 * siempre disponible porque todo tiene un valor razonable por defecto.
 */

const STEP_TITLES = ["¿Qué buscas?", "¿Cuándo?", "¿Cuánto tiempo?", "¿Hasta dónde?", "¿Qué tipo de lugar?"];

const WHEN_PRESETS: Array<{ id: WhenPreset; label: string }> = [
  { id: "now", label: "Ahora" },
  { id: "in30", label: "En 30 min" },
  { id: "in60", label: "En 1 h" },
  { id: "afternoon", label: "Esta tarde" },
  { id: "tomorrow", label: "Mañana" },
];

const DURATIONS = [30, 60, 120, 180];
const DISTANCES: Array<number | null> = [5, 10, 20, 30, null];

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
  const [atTime, setAtTime] = useState("17:30");
  const [atDuration, setAtDuration] = useState(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [more, setMore] = useState(false);

  // Sin datos de lugares todavía (o sin ellos) no se descarta ninguna intención: la búsqueda lo dirá.
  const intentAvailable = (i: SunIntent) =>
    inventory.state === "loading" ||
    inventory.state === "unavailable" ||
    SUN_INTENTS[i].types.some((t) => inventory.counts[t] > 0);
  const typesAvailable = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);

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
    [state.locationType === "any" ? "Cualquier lugar" : PLACE_TYPE_LABEL[state.locationType].singular, 4],
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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {summary.map(([text, idx]) => (
          <button
            key={idx}
            type="button"
            onClick={() => setStep(idx)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors duration-300",
              step === idx ? "bg-sun-soft text-sun-deep" : "bg-ink/[0.04] text-ink-soft hover:text-ink"
            )}
          >
            {text}
          </button>
        ))}
      </div>

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
                  Encuéntrame 1 h de sol
                </PrimaryButton>
                <GhostButton onClick={() => onQuick(planAfternoon(now))}>Planear mi tarde</GhostButton>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-soft">
                <span>Quiero sol a las</span>
                <input
                  type="time"
                  aria-label="Hora"
                  value={atTime}
                  onChange={(e) => setAtTime(e.target.value)}
                  className={timeInput}
                />
                <span>durante</span>
                {[30, 60, 120].map((m) => (
                  <Chip key={m} active={atDuration === m} onClick={() => setAtDuration(m)}>
                    {durationLabel(m)}
                  </Chip>
                ))}
                <GhostButton
                  onClick={() => {
                    const minutes = parseHHMM(atTime);
                    if (minutes !== null) onQuick(sunAt(minutes, atDuration, now));
                  }}
                  className="text-sun-deep"
                >
                  Buscar →
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
                <input
                  type="time"
                  aria-label="Desde"
                  value={hhmm(state.fromMinutes)}
                  onChange={(e) => {
                    const m = parseHHMM(e.target.value);
                    if (m === null) return;
                    onChange({
                      fromMinutes: m,
                      toMinutes:
                        state.toMinutes > m ? state.toMinutes : Math.min(1439, m + state.durationMinutes),
                    });
                  }}
                  className={timeInput}
                />
                <span>a</span>
                <input
                  type="time"
                  aria-label="Hasta"
                  value={hhmm(state.toMinutes)}
                  onChange={(e) => {
                    const m = parseHHMM(e.target.value);
                    if (m !== null) onChange({ toMinutes: m });
                  }}
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
              Se busca el sitio con más sol durante todo ese tiempo, no solo a una hora concreta.
            </p>
          </div>
        )}

        {/* 3 · Hasta dónde */}
        {step === 3 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              {DISTANCES.map((m) => (
                <Chip
                  key={m ?? "any"}
                  active={state.maxWalkingMinutes === m}
                  onClick={() => void pickDistance(m)}
                >
                  {m === null ? "Cualquier sitio" : `${m} min`}
                </Chip>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-ink-faint">
              {origin
                ? "Tiempo a pie estimado desde tu ubicación (en línea recta con rodeo, no una ruta real)."
                : "Sin tu ubicación se busca en toda Barcelona. Al limitar el tiempo te la pediremos; es opcional."}
            </p>
          </div>
        )}

        {/* 4 · Tipo de lugar */}
        {step === 4 && (
          <div className="fts-fade-in">
            <div className="flex flex-wrap gap-2">
              <Chip active={state.locationType === "any"} onClick={() => onChange({ locationType: "any" })}>
                Cualquier lugar
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

            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              className="mt-3.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
            >
              {more ? "Menos opciones" : "Más opciones"}
            </button>
            {more && (
              <div className="fts-fade-in mt-2.5 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[11px] text-ink-soft">Prioridad</span>
                  {(
                    [
                      ["maximum_sun", "Máximo sol"],
                      ["balanced", "Equilibrado"],
                    ] as Array<[SunPreference, string]>
                  ).map(([id, label]) => (
                    <Chip key={id} active={state.preference === id} onClick={() => onChange({ preference: id })}>
                      {label}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip active={state.avoidClouds} onClick={() => onChange({ avoidClouds: !state.avoidClouds })}>
                    Evitar nubes
                  </Chip>
                  <Chip
                    active={state.preferShadeBreaks}
                    onClick={() => onChange({ preferShadeBreaks: !state.preferShadeBreaks })}
                  >
                    Pausas de sombra
                  </Chip>
                </div>
                <p className="text-[10.5px] leading-snug text-ink-faint">
                  «Equilibrado» tiene en cuenta el calor y el viento, además del sol.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        {step > 0 ? <GhostButton onClick={() => setStep(step - 1)}>Atrás</GhostButton> : <span />}
        <PrimaryButton onClick={onSearch}>Buscar</PrimaryButton>
      </div>
    </div>
  );
}
