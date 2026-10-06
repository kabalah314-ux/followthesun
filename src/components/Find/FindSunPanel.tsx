import { durationLabel, type PlannerState } from "../../lib/planning";
import { dayChoiceLabel, dayStartFor, hhmm, parseHHMM } from "../../lib/planningTime";
import { SUN_INTENTS } from "../../lib/placeTypes";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import type { LngLat, LocationTypeFilter, SunIntent, SunSearchResult } from "../../types";
import { PanelHeader } from "../Layout/ContextPanel";
import { Caps, Chip, GhostButton, PrimaryButton } from "../FindSun/ui";
import SearchProgress from "../FindSun/SearchProgress";
import SearchResults, { type Suggestion } from "./SearchResults";

/**
 * Find the Sun — «¿Dónde hay sol?». Inmediato: qué buscas, cuándo, cuánto rato, y buscar.
 * Todo tiene un valor por defecto: pulsar «Buscar sol» sin tocar nada = 1 h de sol ahora.
 */

interface FindOption {
  id: string;
  label: string;
  intent: SunIntent;
  locationType: LocationTypeFilter;
}

const OPTIONS: FindOption[] = [
  { id: "sun", label: "Máximo sol", intent: "sun", locationType: "any" },
  { id: "shade", label: "Sombra", intent: "shade", locationType: "any" },
  { id: "coffee", label: "Café", intent: "coffee", locationType: "any" },
  { id: "read", label: "Leer", intent: "read", locationType: "any" },
  { id: "beach", label: "Playa", intent: "beach", locationType: "any" },
  { id: "park", label: "Parque", intent: "sun", locationType: "park" },
  { id: "sunset", label: "Atardecer", intent: "sunset", locationType: "any" },
];

const DURATIONS = [30, 60, 120, 180];
const NEARBY_MIN = 15;

const timeInput =
  "w-[92px] rounded-full border border-line bg-transparent px-3 py-1.5 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-sun";

interface Props {
  search: SunSearchApi;
  planner: PlannerState;
  onChange(patch: Partial<PlannerState>): void;
  onSearch(p?: PlannerState): void;
  /** Cargando el inventario de bares y cafeterías. */
  venuesLoading?: boolean;
  now: number;
  origin: LngLat | null;
  activeId: string | null;
  onPick(r: SunSearchResult): void;
  onRequestLocation(): Promise<LngLat | null>;
  onOpenPlaces(): void;
  onOpenPlan(): void;
  onClose(): void;
}

export default function FindSunPanel({
  search,
  planner,
  onChange,
  onSearch,
  venuesLoading,
  now,
  origin,
  activeId,
  onPick,
  onRequestLocation,
  onOpenPlaces,
  onOpenPlan,
  onClose,
}: Props) {
  const { status, outcome, progress, failed } = search.state;
  const header = <PanelHeader title="Buscar sol/sombra" subtitle="¿Dónde hay sol o sombra?" onClose={onClose} />;

  if (status === "searching") {
    return (
      <>
        {header}
        <SearchProgress progress={progress} onCancel={() => search.cancel()} />
      </>
    );
  }

  if (status === "places_unavailable") {
    return (
      <>
        {header}
        <p className="font-serif text-[20px] leading-tight text-ink">No hemos podido cargar los lugares de Barcelona.</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
          Comprueba tu conexión e inténtalo de nuevo. No mostramos resultados inventados.
        </p>
        <div className="mt-4 flex justify-between">
          <GhostButton onClick={() => search.reset()}>Editar búsqueda</GhostButton>
          <GhostButton onClick={() => onSearch()} className="text-sun-deep">
            Reintentar
          </GhostButton>
        </div>
      </>
    );
  }

  if (status !== "idle" && (outcome || failed)) {
    const suggestions: Suggestion[] = [];
    if (planner.when !== "tomorrow") suggestions.push({ label: "Probar mañana", onClick: () => onSearch({ ...planner, when: "tomorrow" }) });
    if (planner.durationMinutes > 30) {
      suggestions.push({
        label: "Menos tiempo",
        onClick: () => onSearch({ ...planner, durationMinutes: Math.max(30, Math.round(planner.durationMinutes / 30) * 15) }),
      });
    }
    if (planner.maxWalkingMinutes !== null) {
      suggestions.push({ label: "Ampliar distancia", onClick: () => onSearch({ ...planner, maxWalkingMinutes: null }) });
    }
    return (
      <>
        {header}
        <SearchResults
          outcome={outcome}
          failed={failed}
          activeId={activeId}
          onPick={onPick}
          onEdit={() => search.reset()}
          suggestions={suggestions}
        />
      </>
    );
  }

  /* ------------------------------ formulario ------------------------------ */
  const option = OPTIONS.find((o) => o.intent === planner.intent && o.locationType === planner.locationType) ?? OPTIONS[0];
  const custom = planner.when === "custom";
  const atTime = custom ? hhmm(planner.fromMinutes) : "";

  const setCustomTime = (value: string) => {
    const m = parseHHMM(value);
    if (m === null) return;
    onChange({ when: "custom", fromMinutes: m, toMinutes: Math.min(1439, m + planner.durationMinutes) });
  };
  const setDuration = (d: number) =>
    onChange(
      custom
        ? { durationMinutes: d, toMinutes: Math.min(1439, planner.fromMinutes + d) }
        : { durationMinutes: d }
    );
  const pickOption = (o: FindOption) => {
    const def = SUN_INTENTS[o.intent];
    const patch: Partial<PlannerState> = { intent: o.intent, locationType: o.locationType, preference: def.preference };
    if (o.intent === "sunset") Object.assign(patch, { when: "sunset", durationMinutes: def.defaultDurationMinutes });
    else if (planner.when === "sunset") patch.when = "now";
    onChange(patch);
  };
  const setNearby = async (nearby: boolean) => {
    if (nearby && !origin && !(await onRequestLocation())) return;
    onChange({ maxWalkingMinutes: nearby ? NEARBY_MIN : null });
  };

  return (
    <>
      {header}
      <div className="space-y-4">
        <section>
          <Caps>¿Qué buscas?</Caps>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {OPTIONS.map((o) => (
              <Chip key={o.id} active={option.id === o.id} onClick={() => pickOption(o)} title={SUN_INTENTS[o.intent].hint}>
                {o.label}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <Caps>¿Cuándo?</Caps>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {planner.intent === "sunset" ? (
              <Chip active={planner.when === "sunset"} onClick={() => onChange({ when: "sunset" })}>
                Al atardecer
              </Chip>
            ) : (
              <>
                <Chip active={planner.when === "now"} onClick={() => onChange({ when: "now" })}>
                  Ahora
                </Chip>
                <Chip active={planner.when === "in30"} onClick={() => onChange({ when: "in30" })}>
                  En 30 min
                </Chip>
                <Chip active={planner.when === "in60"} onClick={() => onChange({ when: "in60" })}>
                  En 1 h
                </Chip>
              </>
            )}
            <span className="flex items-center gap-1.5 pl-1 text-[12px] text-ink-soft">
              <span>{custom ? dayChoiceLabel(dayStartFor(now, planner.dayOffset), now) : "A las"}</span>
              <input
                type="time"
                aria-label="Hora"
                value={atTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className={timeInput}
              />
            </span>
          </div>
        </section>

        {planner.intent !== "sunset" && (
          <section>
            <Caps>Durante</Caps>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <Chip key={d} active={planner.durationMinutes === d} onClick={() => setDuration(d)}>
                  {durationLabel(d)}
                </Chip>
              ))}
            </div>
          </section>
        )}

        <section>
          <Caps>¿Dónde?</Caps>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={planner.maxWalkingMinutes === null} onClick={() => void setNearby(false)}>
              Toda Barcelona
            </Chip>
            <Chip active={planner.maxWalkingMinutes !== null} onClick={() => void setNearby(true)}>
              Cerca de mí · {NEARBY_MIN} min
            </Chip>
          </div>
        </section>

        <div className="pt-1">
          <PrimaryButton onClick={() => onSearch()} className="w-full justify-center" disabled={venuesLoading}>
            {venuesLoading ? "Cargando terrazas…" : "Buscar sol/sombra"}
          </PrimaryButton>
        </div>
        {option.id === "coffee" && (
          <p className="text-[10.5px] leading-snug text-ink-faint">
            Los bares con terraza confirmada salen de OpenStreetMap; el resto son candidatos por estar
            en planta baja. Podrás confirmar cuáles tienen mesas al sol.
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3">
          <GhostButton onClick={onOpenPlaces}>Ver lugares →</GhostButton>
          <GhostButton onClick={onOpenPlan}>Planificar una franja →</GhostButton>
        </div>
      </div>
    </>
  );
}
