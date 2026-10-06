import { useMemo, useState } from "react";
import { BARCELONA } from "../../config";
import type { SunSearchApi } from "../../hooks/useSunSearch";
import { dayStartFor } from "../../lib/planningTime";
import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER } from "../../lib/placeTypes";
import { getSunTimes } from "../../lib/solarCalculations";
import { placeService } from "../../services/placeService";
import type { PlaceInventoryStatus, SunPlace, SunPlaceType, SunSearchResult } from "../../types";
import { Shuffle, Star } from "../LineIcons";
import { GhostButton, PrimaryButton } from "../FindSun/ui";
import SearchResults from "../Find/SearchResults";
import SearchProgress from "../FindSun/SearchProgress";
import { PanelHeader } from "../Layout/ContextPanel";

/**
 * Recomendados — nueve sitios por categoría para descubrir Barcelona sin buscar nada concreto.
 *
 * La selección se SORTEA de los lugares reales de OpenStreetMap («Otros sitios» saca otros nueve) y
 * se analiza con el mismo motor que Find the Sun, así que cada uno llega con su sol de hoy. No hay
 * ninguna lista escrita a mano.
 */

const PER_CATEGORY = 9;

/** Shuffle determinista por semilla (Fisher-Yates con PRNG mulberry32). */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let a = (seed * 2654435761) | 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickRecommended(places: SunPlace[], count: number, seed: number): SunPlace[] {
  const byType = new Map<SunPlaceType, SunPlace[]>();
  for (const p of places) {
    const list = byType.get(p.type);
    if (list) list.push(p);
    else byType.set(p.type, [p]);
  }
  const out: SunPlace[] = [];
  for (const type of PLACE_TYPE_ORDER) {
    const list = byType.get(type);
    if (!list || list.length === 0) continue;
    out.push(...shuffled(list, seed + type.length * 7919).slice(0, count));
  }
  return out;
}

interface Props {
  inventory: PlaceInventoryStatus;
  search: SunSearchApi;
  dayWord: string;
  activeId: string | null;
  onPick(r: SunSearchResult): void;
  onOpenPlaces(): void;
  onClose(): void;
}

export default function Recommended({ inventory, search, dayWord, activeId, onPick, onOpenPlaces, onClose }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const { status, outcome, progress, failed } = search.state;

  const places = placeService.getPlaces();
  const picks = useMemo(() => pickRecommended(places ?? [], PER_CATEGORY, seed), [places, seed]);
  const types = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);
  const total = types.reduce((sum, t) => sum + Math.min(PER_CATEGORY, inventory.counts[t]), 0);

  const searchNow = () => {
    if (picks.length === 0) return;
    const now = Date.now();
    const tomorrow = dayWord === "Mañana";
    const sun = getSunTimes(dayStartFor(now, tomorrow ? 1 : 0), BARCELONA.lat, BARCELONA.lng);
    const start = tomorrow ? sun.sunrise : Math.floor(now / 60_000) * 60_000;
    void search.run(
      {
        startTime: start,
        endTime: sun.sunset,
        minimumSunlightMinutes: 45,
        limit: 9,
      },
      { places: picks }
    );
  };

  return (
    <>
      <PanelHeader title="Recomendados" subtitle="Nueve sitios por categoría para descubrir" onClose={onClose} />

      {inventory.state === "loading" && <p className="text-[12px] text-ink-soft">Cargando los lugares de Barcelona…</p>}
      {inventory.state === "unavailable" && (
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          No hemos podido cargar los lugares. Comprueba tu conexión e inténtalo de nuevo.
        </p>
      )}

      {picks.length > 0 && status === "idle" && (
        <>
          <div className="mt-3 space-y-2">
            {types.map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-[12px] text-ink-soft">
                <span className="w-[104px] shrink-0 font-medium text-ink">{PLACE_TYPE_LABEL[t].plural}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="tabular-nums text-ink-faint">{Math.min(PER_CATEGORY, inventory.counts[t])}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-faint">
            {total} sitios reales de OpenStreetMap. Se sortean cada vez y se analiza su sol {dayWord.toLowerCase()}.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={searchNow}>Ver su sol</PrimaryButton>
            <GhostButton onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>
              <span className="flex items-center gap-1.5">
                <Shuffle size={14} />
                Otros sitios
              </span>
            </GhostButton>
          </div>
        </>
      )}

      {picks.length === 0 && inventory.state === "ready" && (
        <div className="mt-3">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">Todavía no hay lugares cargados en esta zona.</p>
          <GhostButton onClick={onOpenPlaces} className="mt-3 text-sun-deep">
            Explorar lugares →
          </GhostButton>
        </div>
      )}

      {status === "searching" && <SearchProgress progress={progress} onCancel={() => search.cancel()} />}

      {status !== "searching" && status !== "idle" && (outcome || failed) && (
        <>
          <SearchResults
            outcome={outcome}
            failed={failed}
            activeId={activeId}
            onPick={onPick}
            onEdit={() => search.reset()}
            editLabel="Volver"
            suggestions={[{ label: "Otros sitios", onClick: () => setSeed(Math.floor(Math.random() * 1e6)) }]}
            title="Su sol"
          />
          <div className="mt-3">
            <GhostButton onClick={() => search.reset()}>
              <span className="flex items-center gap-1.5">
                <Star size={13} />
                Volver a Recomendados
              </span>
            </GhostButton>
          </div>
        </>
      )}
    </>
  );
}
